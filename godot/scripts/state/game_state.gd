class_name GameStateStore
extends Node

## 클라이언트 상태 저장소. autoload 이름은 `GameState` 다.
##
## 서버 메시지는 디스패처를 거쳐 이곳에만 반영되고 화면은 신호를 관찰해 갱신한다.
## 화면이 상태를 폴링하지 않으며 화면끼리 상태를 주고받지 않는다.
##
## 모든 필드는 서버 페이로드를 그대로 담는다. 게임 규칙 판정은 하지 않는다.
##
## 클래스 이름이 autoload 이름과 다른 것은 Godot 이 둘의 충돌을 막기 때문이다.
## 다른 스크립트는 autoload 식별자를 직접 쓰지 않고 이 타입으로 주입받는다.
## autoload 식별자는 단일 파일 검사(`--check-only`)에서 해석되지 않으며, 주입이
## 서버 없이 상태 반영을 검증하는 Task 12.3 의 전제이기도 하다.

## 로그 보관 상한. 채팅과 이벤트에 각각 적용한다.
const LOG_LIMIT := 500

signal player_changed()
signal room_changed()
signal entities_changed()
signal inventory_changed()
signal combat_changed()
signal dialogue_changed()
signal shop_changed()
signal container_contents_received(container_id: String, items: Array)
signal who_result_received(players: Array)
signal chat_received(entry: Dictionary)
signal event_received(entry: Dictionary)
signal connection_changed()
## 스냅샷 메시지가 도착했다. 값은 `room_info`, `player_state`, `inventory`,
## `combat_state` 중 하나다. 로그인 직후 셋을 모두 받았는지 세는 데 쓴다.
signal snapshot_received(kind: String)

## 보유한 엔티티 사본에 없는 대상의 갱신을 받았을 때 발신한다.
## 연결 계층이 `look` verb 로 방 전체를 재요청한다.
signal resync_required(reason: String)

## `login_result` 와 `player_state` 가 채운다
var player: Dictionary = {}
## `login_result.admin_channel`. 어드민 진입 버튼 노출 조건이다
var admin_channel: Dictionary = {}
var authenticated := false

## `room_info.room`
var room: Dictionary = {}
var time_of_day := ""
## Entity_UUID 를 키로 하는 딕셔너리
var entities: Dictionary = {}
## 미니맵용 좌표와 지형 배열
var nearby_rooms: Array = []

var inventory: Dictionary = {}
var equipped: Dictionary = {}

var combat: Dictionary = {}
var dialogue: Dictionary = {}
var shop: Dictionary = {}

var chat_log: Array = []
var event_log: Array = []

var connection_state: int = 0
var reconnect_attempt := 0


## 로그아웃과 재접속에서 게임 상태만 비운다. 연결 상태는 그대로 둔다.
func reset_session() -> void:
	player = {}
	admin_channel = {}
	authenticated = false
	room = {}
	time_of_day = ""
	entities = {}
	nearby_rooms = []
	inventory = {}
	equipped = {}
	combat = {}
	dialogue = {}
	shop = {}
	player_changed.emit()
	room_changed.emit()
	entities_changed.emit()
	inventory_changed.emit()
	combat_changed.emit()
	dialogue_changed.emit()


func set_connection_state(state: int, attempt: int) -> void:
	connection_state = state
	reconnect_attempt = attempt
	connection_changed.emit()


func apply_login_result(payload: Dictionary) -> void:
	authenticated = Protocol.as_bool(payload.get("success"))
	if authenticated:
		player = Protocol.as_dict(payload.get("player"))
		admin_channel = Protocol.as_dict(payload.get("admin_channel"))
	else:
		player = {}
		admin_channel = {}
	player_changed.emit()


func apply_logout_result(_payload: Dictionary) -> void:
	reset_session()


func apply_player_state(payload: Dictionary) -> void:
	player = Protocol.as_dict(payload.get("player"))
	player_changed.emit()
	snapshot_received.emit(Protocol.PLAYER_STATE)


func apply_room_info(payload: Dictionary) -> void:
	room = Protocol.as_dict(payload.get("room"))
	time_of_day = Protocol.as_string(payload.get("time_of_day"))
	nearby_rooms = Protocol.as_array(payload.get("nearby_rooms"))

	entities = {}
	for value: Variant in Protocol.as_array(payload.get("entities")):
		var entity: Dictionary = Protocol.as_dict(value)
		var id := Protocol.as_string(entity.get("id"))
		if not id.is_empty():
			entities[id] = entity

	room_changed.emit()
	entities_changed.emit()
	snapshot_received.emit(Protocol.ROOM_INFO)


func apply_entity_enter(payload: Dictionary) -> void:
	var entity: Dictionary = Protocol.as_dict(payload.get("entity"))
	var id := Protocol.as_string(entity.get("id"))
	if id.is_empty():
		push_warning("entity_enter 에 id 가 없습니다")
		return
	entities[id] = entity
	entities_changed.emit()


func apply_entity_leave(payload: Dictionary) -> void:
	var id := Protocol.as_string(payload.get("entity_id"))
	if not entities.has(id):
		return
	entities.erase(id)
	entities_changed.emit()


## 변경된 필드만 사본에 병합한다. 대상이 없으면 방 전체를 재요청한다.
func apply_entity_update(payload: Dictionary) -> void:
	var id := Protocol.as_string(payload.get("entity_id"))
	if not entities.has(id):
		resync_required.emit("entity_update 대상 %s 가 사본에 없습니다" % id)
		return

	var entity: Dictionary = Protocol.as_dict(entities[id])
	var changes: Dictionary = Protocol.as_dict(payload.get("changes"))
	for key: Variant in changes:
		entity[key] = changes[key]
	entities[id] = entity
	entities_changed.emit()


func apply_inventory(payload: Dictionary) -> void:
	inventory = {
		"total_weight": payload.get("total_weight", 0.0),
		"max_weight": payload.get("max_weight", 0.0),
		"items": Protocol.as_array(payload.get("items")),
	}
	equipped = Protocol.as_dict(payload.get("equipped"))
	inventory_changed.emit()
	snapshot_received.emit(Protocol.INVENTORY)


func apply_container_contents(payload: Dictionary) -> void:
	container_contents_received.emit(
		Protocol.as_string(payload.get("container_id")),
		Protocol.as_array(payload.get("items"))
	)


func apply_combat_state(payload: Dictionary) -> void:
	combat = payload.duplicate(true)
	combat_changed.emit()
	snapshot_received.emit(Protocol.COMBAT_STATE)


func apply_dialogue(payload: Dictionary) -> void:
	if Protocol.as_bool(payload.get("is_active"), true):
		dialogue = payload.duplicate(true)
	else:
		dialogue = {}
	dialogue_changed.emit()


func apply_shop(payload: Dictionary) -> void:
	shop = payload.duplicate(true)
	shop_changed.emit()


func apply_who_result(payload: Dictionary) -> void:
	who_result_received.emit(Protocol.as_array(payload.get("players")))


func apply_chat(payload: Dictionary) -> void:
	var entry := payload.duplicate(true)
	_append_capped(chat_log, entry)
	chat_received.emit(entry)


func apply_event(payload: Dictionary) -> void:
	var entry := payload.duplicate(true)
	_append_capped(event_log, entry)
	event_received.emit(entry)


func _append_capped(log_array: Array, entry: Dictionary) -> void:
	log_array.append(entry)
	if log_array.size() > LOG_LIMIT:
		log_array.remove_at(0)
