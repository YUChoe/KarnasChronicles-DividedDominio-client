class_name CombatScreen
extends VBoxContainer

## 전투 화면.
##
## 라운드, 턴, 참가자 HP, 턴 순서, 액션 버튼, 전투 기록을 보인다.
##
## 단축키의 숫자는 서버로 가지 않는다. `CombatKeys` 가 verb 로 바꾼다. 전투
## 참가자는 `Combatant` 구조이며 방 정보의 monster 엔티티와 필드가 다르다.
## `armor_class` 가 없고 `defense` 를 가진다.

signal action_requested(verb: String, target_id: String, params: Dictionary)
signal notice_requested(key: String, params: Dictionary)

@onready var _title: Label = %CombatTitle
@onready var _round: Label = %RoundLabel
@onready var _turn: Label = %TurnLabel
@onready var _enemies_title: Label = %EnemiesTitle
@onready var _allies_title: Label = %AlliesTitle
@onready var _enemies: VBoxContainer = %EnemyRows
@onready var _allies: VBoxContainer = %AllyRows
@onready var _order_title: Label = %TurnOrderTitle
@onready var _order: Label = %TurnOrderLabel
@onready var _actions: HFlowContainer = %CombatActions
@onready var _items: OptionButton = %CombatItems
@onready var _log: EventLog = %CombatLog

var _state: GameStateStore = null
var _translator: TranslatorService = null

## verb → 버튼
var _buttons: Dictionary = {}
var _selected_enemy := ""
## 항목 인덱스 → 아이템 uuid
var _item_ids: Array[String] = []


func bind(state: GameStateStore, translator: TranslatorService) -> void:
	_state = state
	_translator = translator

	_state.combat_changed.connect(_refresh)
	_state.inventory_changed.connect(_refresh_items)
	_translator.locale_changed.connect(_on_locale_changed)

	for verb: String in CombatKeys.ORDER:
		var button := Button.new()
		button.pressed.connect(_on_action_pressed.bind(verb))
		_actions.add_child(button)
		_buttons[verb] = button

	_log.bind(_translator)
	_log.set_fixed_filter("combat")

	apply_texts()
	_refresh()


func apply_texts() -> void:
	if _translator == null:
		return
	_title.text = _translator.t("ui.combat.title")
	_enemies_title.text = _translator.t("ui.combat.enemies")
	_allies_title.text = _translator.t("ui.combat.allies")
	_order_title.text = _translator.t("ui.combat.turn_order")

	for verb: String in CombatKeys.ORDER:
		var button: Button = _buttons[verb]
		button.text = _translator.t("ui.combat.%s" % verb,
			{"key": CombatKeys.key_of(verb)})

	_refresh()


## 숫자 키를 verb 로 바꿔 보낸다. 숫자는 서버로 가지 않는다.
func _unhandled_key_input(event: InputEvent) -> void:
	if not is_visible_in_tree() or not (event is InputEventKey):
		return
	var key_event := event as InputEventKey
	if not key_event.pressed or key_event.echo:
		return

	var verb := CombatKeys.verb_of_keycode(key_event.keycode)
	if verb.is_empty():
		return
	get_viewport().set_input_as_handled()
	_on_action_pressed(verb)


func _refresh() -> void:
	if _state == null or _translator == null or _state.combat.is_empty():
		return

	_round.text = _translator.t("ui.combat.round",
		{"round": Protocol.as_int(_state.combat.get("round"))})

	var my_turn := Protocol.as_bool(_state.combat.get("is_my_turn"))
	_turn.text = (_translator.t("ui.combat.your_turn") if my_turn
		else _translator.t("ui.combat.waiting",
			{"name": _name_of(Protocol.as_string(_state.combat.get("current_turn")))}))

	_fill(_enemies, Protocol.as_array(_state.combat.get("enemies")), true)
	_fill(_allies, Protocol.as_array(_state.combat.get("allies")), false)
	_order.text = _turn_order_text()

	for verb: String in CombatKeys.ORDER:
		var button: Button = _buttons[verb]
		button.disabled = not my_turn
	_items.disabled = not my_turn

	_refresh_items()


func _fill(rows: VBoxContainer, combatants: Array, selectable: bool) -> void:
	for child: Node in rows.get_children():
		child.queue_free()

	for value: Variant in combatants:
		var combatant: Dictionary = Protocol.as_dict(value)
		rows.add_child(_row(combatant, selectable))


func _row(combatant: Dictionary, selectable: bool) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)

	var id := Protocol.as_string(combatant.get("id"))
	var name := _translator.pick(combatant.get("name"))
	var alive := Protocol.as_bool(combatant.get("is_alive"), true)

	if selectable:
		var button := Button.new()
		button.toggle_mode = true
		button.custom_minimum_size = Vector2(180, 0)
		button.text = name
		button.disabled = not alive
		button.button_pressed = id == _selected_enemy
		button.pressed.connect(_on_enemy_pressed.bind(id))
		row.add_child(button)
	else:
		var label := Label.new()
		label.custom_minimum_size = Vector2(180, 0)
		label.text = name
		row.add_child(label)

	var hp := Protocol.as_int(combatant.get("hp"))
	var max_hp := maxi(1, Protocol.as_int(combatant.get("max_hp"), 1))

	var bar := ProgressBar.new()
	bar.custom_minimum_size = Vector2(140, 0)
	bar.max_value = max_hp
	bar.value = hp
	bar.show_percentage = false
	row.add_child(bar)

	var hp_label := Label.new()
	hp_label.custom_minimum_size = Vector2(70, 0)
	hp_label.text = _translator.t("ui.combat.hp", {"hp": hp, "max_hp": max_hp})
	row.add_child(hp_label)

	var stats := Label.new()
	stats.text = _translator.t("ui.combat.stats", {
		"attack": Protocol.as_int(combatant.get("attack_power")),
		"defense": Protocol.as_int(combatant.get("defense")),
	})
	row.add_child(stats)

	var mark := Label.new()
	if not alive:
		mark.text = _translator.t("ui.combat.fallen")
	elif Protocol.as_bool(combatant.get("is_defending")):
		mark.text = _translator.t("ui.combat.defending")
	row.add_child(mark)

	return row


func _turn_order_text() -> String:
	var names: Array[String] = []
	for value: Variant in Protocol.as_array(_state.combat.get("turn_order")):
		names.append(_name_of(Protocol.as_string(value)))
	return " → ".join(names)


## 참가자 목록에서 이름을 찾는다. 없으면 빈 문자열이다.
func _name_of(combatant_id: String) -> String:
	for key: String in ["allies", "enemies"]:
		for value: Variant in Protocol.as_array(_state.combat.get(key)):
			var combatant: Dictionary = Protocol.as_dict(value)
			if Protocol.as_string(combatant.get("id")) == combatant_id:
				return _translator.pick(combatant.get("name"))
	return ""


## 전투 중 쓸 수 있는 아이템만 담는다.
func _refresh_items() -> void:
	if _translator == null:
		return

	var previous := _selected_item()
	_items.clear()
	_item_ids.clear()

	for value: Variant in Protocol.as_array(_state.inventory.get("items")):
		var item: Dictionary = Protocol.as_dict(value)
		if not Protocol.as_bool(item.get("is_usable")):
			continue
		var id := Protocol.as_string(item.get("id"))
		if id.is_empty():
			continue
		_items.add_item(_translator.pick(item.get("name")))
		_item_ids.append(id)

	if _item_ids.is_empty():
		_items.add_item(_translator.t("ui.combat.no_item"))
		_items.disabled = true
		return

	var index := _item_ids.find(previous)
	_items.selected = index if index >= 0 else 0


func _selected_item() -> String:
	if _items.selected < 0 or _items.selected >= _item_ids.size():
		return ""
	return _item_ids[_items.selected]


func _on_enemy_pressed(combatant_id: String) -> void:
	_selected_enemy = combatant_id
	_refresh()


func _on_action_pressed(verb: String) -> void:
	if not Protocol.as_bool(_state.combat.get("is_my_turn")):
		return

	if verb == CombatKeys.ATTACK:
		if _selected_enemy.is_empty():
			notice_requested.emit("ui.combat.no_target", {})
			return
		action_requested.emit(verb, _selected_enemy, {})
		return

	if verb == CombatKeys.USE_ITEM:
		var item_id := _selected_item()
		if item_id.is_empty():
			notice_requested.emit("ui.combat.no_item", {})
			return
		action_requested.emit(verb, item_id, {})
		return

	action_requested.emit(verb, "", {})


func _on_locale_changed(_locale: String) -> void:
	apply_texts()
