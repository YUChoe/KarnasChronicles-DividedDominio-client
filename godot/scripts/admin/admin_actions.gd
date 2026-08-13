class_name AdminActions
extends RefCounted

## 실시간 액션 14종과 각 액션의 params.
##
## 계약(`docs/protocol/admin.md` 실시간 액션)의 표를 그대로 옮긴 것이다. 화면이
## 이 명세로 입력란을 만든다. 액션이 늘면 이 표만 고친다.
##
## `direction` 은 north, south, east, west 뿐이다. 대각선과 상하 방향이 이 세계에
## 없다. `create_exit` 는 새 연결을 만드는 것이 아니라 `blocked_exits` 에서
## 방향을 빼는 것이다.

## 표시 순서. 계약의 표와 같다.
const ORDER: Array[String] = [
	"goto", "kick", "spawn_monster", "spawn_item", "terminate",
	"create_room", "update_room", "create_exit", "validate_world",
	"list_monster_templates", "list_item_templates", "scheduler",
	"change_display_name", "room_info",
]

## 액션 → params 이름 목록. 빈 배열은 인자가 없는 액션이다.
const PARAMS := {
	"goto": ["target_player", "x", "y"],
	"kick": ["target_player", "reason"],
	"spawn_monster": ["template_id", "x", "y"],
	"spawn_item": ["template_id", "x", "y"],
	"terminate": ["target_id", "reason"],
	"create_room": ["x", "y", "room_type", "description_en", "description_ko"],
	"update_room": ["id", "room_type", "description_en", "description_ko"],
	"create_exit": ["from_id", "direction", "to_id"],
	"validate_world": [],
	"list_monster_templates": [],
	"list_item_templates": [],
	"scheduler": ["operation", "event_name"],
	"change_display_name": ["target_player", "display_name"],
	"room_info": ["x", "y"],
}

## 정수로 보내야 하는 params. 문자열로 보내면 서버가 거절한다.
const INTEGER_PARAMS: Array[String] = ["x", "y"]

## 대상 플레이어의 게임 세션이 있어야 하는 액션. 없으면
## `PLAYER_NOT_ONLINE` 으로 거절된다. `change_display_name` 은 DB 값을 바꾸므로
## 접속 중이 아니어도 된다.
const NEEDS_ONLINE_PLAYER: Array[String] = ["goto", "kick"]


static func params_of(action: String) -> Array[String]:
	var out: Array[String] = []
	for value: Variant in Protocol.as_array(PARAMS.get(action)):
		out.append(Protocol.as_string(value))
	return out


static func is_integer_param(name: String) -> bool:
	return INTEGER_PARAMS.has(name)


## 입력값을 계약이 기대하는 타입으로 바꾼다. 빈 값은 담지 않는다.
static func build_params(action: String, inputs: Dictionary) -> Dictionary:
	var params: Dictionary = {}
	for name: String in params_of(action):
		var raw := Protocol.as_string(inputs.get(name)).strip_edges()
		if raw.is_empty():
			continue
		params[name] = int(raw) if is_integer_param(name) else raw
	return params
