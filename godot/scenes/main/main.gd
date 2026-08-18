class_name MainScreen
extends VBoxContainer

## 탐험 화면.
##
## 방 설명, 시간대, 좌표, 출구, 엔티티, 미니맵, 로그, 채팅을 표시한다. 방 이름은
## 표시하지 않는다. `rooms` 테이블에 이름 컬럼이 없다.
##
## 하위 패널은 각자 자기 표시만 담당하고 송신은 이 화면이 모아서 한다. 패널이
## 네트워크 계층을 알지 않게 한다.

signal settings_requested()
signal inventory_requested()
signal status_requested()
## 조립 지점의 알림 영역에 문구를 띄운다
signal notice_requested(key: String, params: Dictionary)

const DIRECTIONS: Array[String] = ["north", "south", "east", "west"]
const VERB_MOVE := "move"
const VERB_ENTER := "enter"
const VERB_EMOTE := "emote"
const LABEL_CHAT := "chat"

@onready var _summary: Label = %SummaryLabel
@onready var _time: Label = %TimeLabel
@onready var _position: Label = %PositionLabel
@onready var _description: Label = %DescriptionLabel
@onready var _settings: Button = %SettingsButton
@onready var _inventory: Button = %InventoryButton
@onready var _status: Button = %StatusButton
@onready var _minimap: Minimap = %Minimap
@onready var _exits_title: Label = %ExitsTitle
@onready var _enter: Button = %EnterButton
@onready var _people: EntityZone = %PeopleZone
@onready var _animals: EntityZone = %AnimalsZone
@onready var _enemies: EntityZone = %EnemiesZone
@onready var _objects: EntityZone = %ObjectsZone
@onready var _popover: ActionPopover = %ActionPopover
@onready var _social: SocialBar = %SocialBar
@onready var _players: PlayerList = %PlayerList
@onready var _log: EventLog = %EventLog
@onready var _chat: ChatBar = %ChatBar

var _state: GameStateStore = null
var _translator: TranslatorService = null
var _sender: ActionSender = null
## 방향 → 버튼
var _direction_buttons: Dictionary = {}
var _nav_busy := false
## `who_result` 로 알게 된 플레이어. uuid → 표시 이름
var _known_players: Dictionary = {}
## 선택한 대상. 비어 있으면 선택 없음
var _selected_id := ""


func _ready() -> void:
	_settings.pressed.connect(func() -> void: settings_requested.emit())
	_inventory.pressed.connect(func() -> void: inventory_requested.emit())
	_status.pressed.connect(func() -> void: status_requested.emit())
	_enter.pressed.connect(_on_enter_pressed)

	for direction: String in DIRECTIONS:
		var button: Button = get_node("%%%sButton" % direction.capitalize())
		_direction_buttons[direction] = button
		button.pressed.connect(_on_direction_pressed.bind(direction))


func bind(
	state: GameStateStore, translator: TranslatorService, sender: ActionSender
) -> void:
	_state = state
	_translator = translator
	_sender = sender

	_state.player_changed.connect(_on_player_changed)
	_state.room_changed.connect(_on_room_changed)
	_state.entities_changed.connect(_on_entities_changed)
	_state.chat_received.connect(_log.add_chat)
	_state.event_received.connect(_log.add_event)
	_state.who_result_received.connect(_on_who_result)
	_translator.locale_changed.connect(_on_locale_changed)
	_sender.request_settled.connect(_on_request_settled)
	_sender.request_timed_out.connect(_on_request_timed_out)

	_minimap.bind(_translator)
	_people.bind("ui.zone.people", _translator)
	_animals.bind("ui.zone.animals", _translator)
	_enemies.bind("ui.zone.enemies", _translator)
	_objects.bind("ui.zone.objects", _translator)
	_popover.bind(_translator)
	_social.bind(_translator)
	_players.bind(_translator)
	_log.bind(_translator)
	_chat.bind(_translator)

	for zone: EntityZone in [_people, _animals, _enemies, _objects]:
		zone.entity_selected.connect(_on_entity_selected)

	_popover.action_requested.connect(_on_popover_action)
	_popover.item_required.connect(_on_popover_item_required)
	_popover.closed.connect(_clear_selection)
	_social.verb_requested.connect(_on_social_verb)
	_social.emote_requested.connect(_on_emote_requested)
	_players.whisper_requested.connect(_on_whisper_requested)
	_chat.message_submitted.connect(_on_chat_submitted)
	_chat.target_missing.connect(_on_chat_target_missing)

	apply_texts()
	_on_player_changed()
	_refresh_room()
	_on_entities_changed()


func apply_texts() -> void:
	if _translator == null:
		return
	_settings.text = _translator.t("ui.settings.title")
	_inventory.text = _translator.t("ui.inventory.open")
	_status.text = _translator.t("ui.status.open")
	_exits_title.text = _translator.t("ui.room.exits")
	_enter.text = _translator.t("ui.room.enter")

	for direction: String in DIRECTIONS:
		var button: Button = _direction_buttons[direction]
		button.text = _translator.t("ui.direction.%s" % direction)

	_minimap.apply_texts()
	_people.apply_texts()
	_animals.apply_texts()
	_enemies.apply_texts()
	_objects.apply_texts()


func _on_player_changed() -> void:
	if _state == null:
		return

	var display_name := Protocol.as_string(_state.player.get("display_name"), "?")
	var username := Protocol.as_string(_state.player.get("username"), "?")
	var faction := Protocol.as_string(_state.player.get("faction_id"))
	_summary.text = ("%s (%s)" % [display_name, username]
		if faction.is_empty() else "%s (%s)  %s" % [display_name, username, faction])

	_social.set_following(
		not Protocol.as_string(_state.player.get("following")).is_empty())


func _refresh_room() -> void:
	if _state == null or _translator == null:
		return

	if _state.room.is_empty():
		_description.text = ""
		_position.text = ""
		_time.text = ""
		_enter.visible = false
		for direction: String in DIRECTIONS:
			var hidden: Button = _direction_buttons[direction]
			hidden.visible = false
		return

	var description := _translator.pick(_state.room.get("description"))
	_description.text = (description if not description.is_empty()
		else _translator.t("ui.room.no_description"))

	var room_type := Protocol.as_string(
		_state.room.get("room_type"), Terrain.UNKNOWN)
	_position.text = _translator.t("ui.room.position", {
		"icon": Terrain.icon_of(room_type),
		"terrain": room_type,
		"x": Protocol.as_int(_state.room.get("x")),
		"y": Protocol.as_int(_state.room.get("y")),
	})
	_time.text = _translator.t("ui.room.time.%s" % (
		_state.time_of_day if not _state.time_of_day.is_empty() else "day"))

	_refresh_exits()
	_minimap.render(_state.nearby_rooms,
		Protocol.as_int(_state.room.get("x")),
		Protocol.as_int(_state.room.get("y")))


## 이동 가능한 출구는 활성, 막힌 출구는 비활성, 그 밖의 방향은 숨긴다.
func _refresh_exits() -> void:
	var exits := Protocol.as_array(_state.room.get("exits"))
	var blocked := Protocol.as_array(_state.room.get("blocked_exits"))

	for direction: String in DIRECTIONS:
		var button: Button = _direction_buttons[direction]
		if exits.has(direction):
			button.visible = true
			button.disabled = _nav_busy
		elif blocked.has(direction):
			button.visible = true
			button.disabled = true
		else:
			button.visible = false

	# `enter` 는 `room_connections` 기반이라 대상 엔티티가 없다
	_enter.visible = Protocol.as_bool(_state.room.get("has_passage"))
	_enter.disabled = _nav_busy


func _on_entities_changed() -> void:
	if _state == null:
		return

	var people: Array = []
	var animals: Array = []
	var enemies: Array = []
	var objects: Array = []

	for entity_id: Variant in _state.entities:
		var entity: Dictionary = Protocol.as_dict(_state.entities[entity_id])
		match _zone_of(entity):
			"objects":
				objects.append(entity)
			"enemies":
				enemies.append(entity)
			"animals":
				animals.append(entity)
			_:
				people.append(entity)

	_people.set_entities(people)
	_animals.set_entities(animals)
	_enemies.set_entities(enemies)
	_objects.set_entities(objects)
	_refresh_chat_targets()

	# 대상이 방에서 사라지면 선택을 푼다
	if not _selected_id.is_empty() and not _state.entities.has(_selected_id):
		_clear_selection()
	else:
		_apply_selection()


## 구역 분류는 서버가 계산한 `disposition` 을 따른다. 클라이언트가 판정하지 않는다.
func _zone_of(entity: Dictionary) -> String:
	match Protocol.as_string(entity.get("kind")):
		ActionRules.KIND_OBJECT:
			return "objects"
		ActionRules.KIND_PLAYER:
			return "people"
		ActionRules.KIND_MONSTER:
			match Protocol.as_string(entity.get("disposition")):
				"hostile":
					return "enemies"
				"neutral":
					return "animals"
	return "people"


## 귓속말 대상은 같은 방의 플레이어와 `who_result` 로 알게 된 플레이어다.
## 자신은 제외한다.
func _refresh_chat_targets() -> void:
	var my_id := Protocol.as_string(_state.player.get("id"))
	var targets: Dictionary = {}

	for entity_id: Variant in _state.entities:
		var entity: Dictionary = Protocol.as_dict(_state.entities[entity_id])
		if Protocol.as_string(entity.get("kind")) != ActionRules.KIND_PLAYER:
			continue
		var id := Protocol.as_string(entity.get("id"))
		if id.is_empty() or id == my_id:
			continue
		targets[id] = _translator.pick(entity.get("name"))

	for id: Variant in _known_players:
		var known := Protocol.as_string(id)
		if known == my_id:
			continue
		targets[known] = Protocol.as_string(_known_players[id], known)

	_chat.set_targets(targets)


func _on_who_result(players: Array) -> void:
	for value: Variant in players:
		var player: Dictionary = Protocol.as_dict(value)
		var id := Protocol.as_string(player.get("id"))
		if id.is_empty():
			continue
		var display_name := Protocol.as_string(player.get("display_name"))
		_known_players[id] = (Protocol.as_string(player.get("username"), id)
			if display_name.is_empty() else display_name)

	_refresh_chat_targets()
	_players.show_players(players)


func _on_room_changed() -> void:
	# 새 방 정보가 곧 이동 완료 신호다. 성공한 액션에는 seq 가 실려 오지 않는다.
	_nav_busy = false
	_clear_selection()
	_refresh_room()


func _on_entity_selected(entity_id: String) -> void:
	var entity: Dictionary = Protocol.as_dict(_state.entities.get(entity_id))
	if entity.is_empty():
		return

	_selected_id = entity_id
	_apply_selection()

	var context: Dictionary = {
		"has_inventory_items": not Protocol.as_array(
			_state.inventory.get("items")).is_empty(),
	}
	_popover.show_target(entity, ActionRules.for_room_entity(entity, context))


func _apply_selection() -> void:
	for zone: EntityZone in [_people, _animals, _enemies, _objects]:
		zone.set_selected(_selected_id)


func _clear_selection() -> void:
	_selected_id = ""
	_popover.clear()
	_apply_selection()


func _on_popover_action(verb: String, target_id: String) -> void:
	if _sender != null:
		_sender.send_action(verb, target_id)


func _on_popover_item_required(_verb: String) -> void:
	notice_requested.emit("ui.action.needs_item", {})


## 서버가 적용 불가라고 답한 동사를 팝오버에서 지운다. 오류로 표시하지 않는다.
func on_not_applicable(verb: String, target_id: String) -> void:
	if target_id.is_empty() or target_id != _popover.target_id():
		return
	_popover.remove_verb(verb)


func _on_direction_pressed(direction: String) -> void:
	if _sender == null:
		return
	_nav_busy = true
	_refresh_exits()
	_sender.send_action(VERB_MOVE, "", {"direction": direction})


func _on_enter_pressed() -> void:
	if _sender == null:
		return
	_nav_busy = true
	_refresh_exits()
	_sender.send_action(VERB_ENTER)


func _on_social_verb(verb: String) -> void:
	if _sender != null:
		_sender.send_action(verb)


func _on_emote_requested(emote_id: String) -> void:
	if _sender != null:
		_sender.send_action(VERB_EMOTE, "", {"emote_id": emote_id})


func _on_whisper_requested(player_id: String) -> void:
	_chat.focus_whisper(player_id)


func _on_chat_submitted(channel: String, message: String, to: String) -> void:
	if _sender == null:
		return
	var fields: Dictionary = {"channel": channel, "message": message}
	if channel == Protocol.CHAT_WHISPER:
		fields["to"] = to
	_sender.send_request(Protocol.CHAT, fields, LABEL_CHAT)


func _on_chat_target_missing() -> void:
	notice_requested.emit("ui.chat.pick_target", {})


func _on_request_settled(_seq: int, label: String, _message_type: String) -> void:
	_release_nav(label)


func _on_request_timed_out(_seq: int, label: String) -> void:
	_release_nav(label)


## 거절이나 무응답으로 끝난 이동은 버튼을 되살린다.
func _release_nav(label: String) -> void:
	if label != VERB_MOVE and label != VERB_ENTER:
		return
	_nav_busy = false
	if _state != null and not _state.room.is_empty():
		_refresh_exits()


func _on_locale_changed(_locale: String) -> void:
	apply_texts()
	_on_player_changed()
	_refresh_room()
	_on_entities_changed()
