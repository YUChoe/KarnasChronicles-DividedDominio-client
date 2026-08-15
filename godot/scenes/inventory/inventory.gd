class_name InventoryScreen
extends VBoxContainer

## 인벤토리 화면.
##
## 같은 `template_id` 아이템을 묶어 수량과 함께 보인다. 서버는 묶지 않고 개별
## 엔티티로 보내므로 묶음은 표시 규칙이다. 액션의 `target` 은 언제나 개별 uuid 다.
##
## 순서 번호로 아이템을 지정하지 않는다. 100번대 번호 체계는 사라졌다.

signal closed()
signal action_requested(verb: String, target_id: String, params: Dictionary)
signal notice_requested(key: String, params: Dictionary)

const FILTER_ALL := "all"

@onready var _title: Label = %InventoryTitle
@onready var _weight: Label = %WeightLabel
@onready var _silver: Label = %SilverLabel
@onready var _close: Button = %InventoryClose
@onready var _unequip_all: Button = %UnequipAllButton
@onready var _filters: HFlowContainer = %FilterButtons
@onready var _rows: VBoxContainer = %ItemRows
@onready var _empty: Label = %ItemsEmpty
@onready var _detail: Label = %DetailName
@onready var _verbs: HFlowContainer = %DetailVerbs
@onready var _quantity_row: HBoxContainer = %QuantityRow
@onready var _quantity_label: Label = %QuantityLabel
@onready var _quantity: SpinBox = %QuantitySpin
@onready var _give_row: HBoxContainer = %GiveRow
@onready var _give_label: Label = %GiveLabel
@onready var _give_target: OptionButton = %GiveTarget
@onready var _equipment: EquipmentPanel = %EquipmentPanel
@onready var _container: ContainerPanel = %ContainerPanel

var _state: GameStateStore = null
var _translator: TranslatorService = null

var _filter := FILTER_ALL
## 필터 → 버튼
var _filter_buttons: Dictionary = {}
var _selected_id := ""
## 항목 인덱스 → 플레이어 uuid
var _give_ids: Array[String] = []


func _ready() -> void:
	_close.pressed.connect(func() -> void: closed.emit())
	# design.md 의 대상 없는 액션 표에 있다. 장착 중인 것이 있을 때만 보인다
	_unequip_all.pressed.connect(
		func() -> void: action_requested.emit("unequip_all", "", {}))


func bind(state: GameStateStore, translator: TranslatorService) -> void:
	_state = state
	_translator = translator

	_state.inventory_changed.connect(_refresh)
	_state.player_changed.connect(_refresh_header)
	_state.entities_changed.connect(_refresh_give_targets)
	_state.container_contents_received.connect(_on_container_contents)
	_translator.locale_changed.connect(_on_locale_changed)

	for filter: String in _filter_names():
		var button := Button.new()
		button.toggle_mode = true
		button.button_pressed = filter == FILTER_ALL
		button.pressed.connect(_on_filter_pressed.bind(filter))
		_filters.add_child(button)
		_filter_buttons[filter] = button

	_equipment.bind(_translator)
	_equipment.slot_selected.connect(_select_item)
	_container.bind(_translator)
	_container.take_requested.connect(_on_take_requested)

	apply_texts()
	_refresh()


func apply_texts() -> void:
	if _translator == null:
		return
	_title.text = _translator.t("ui.inventory.title")
	_close.text = _translator.t("ui.inventory.close")
	_unequip_all.text = _translator.t("ui.verb.unequip_all")
	_empty.text = _translator.t("ui.inventory.empty")
	_quantity_label.text = _translator.t("ui.quantity.label")
	_give_label.text = _translator.t("ui.give.target")

	for filter: String in _filter_names():
		var button: Button = _filter_buttons[filter]
		button.text = _translator.t("ui.filter.%s" % filter)

	_equipment.apply_texts()
	_container.apply_texts()
	_refresh()


## 화면에 들어올 때 최신 상태를 요청한다.
func on_opened() -> void:
	action_requested.emit("request_inventory", "", {})


func _filter_names() -> Array[String]:
	var names: Array[String] = [FILTER_ALL]
	names.append_array(Items.CATEGORIES)
	return names


func _refresh() -> void:
	if _state == null or _translator == null:
		return
	_refresh_header()
	_refresh_items()
	_equipment.set_equipped(_state.equipped,
		Protocol.as_array(_state.inventory.get("items")))
	_unequip_all.visible = not _state.equipped.is_empty()
	_refresh_detail()


func _refresh_header() -> void:
	if _state == null or _translator == null:
		return

	_weight.text = _translator.t("ui.inventory.weight", {
		"current": _state.inventory.get("total_weight", 0.0),
		"max": _state.inventory.get("max_weight", 0.0),
	})
	# 골드는 인벤토리와 플레이어 상태 양쪽에 온다. 인벤토리 쪽이 더 최신이다
	var silver: Variant = _state.inventory.get(
		"silver", _state.player.get("silver", 0))
	_silver.text = _translator.t(
		"ui.inventory.silver", {"silver": Protocol.as_int(silver)})


func _refresh_items() -> void:
	for child: Node in _rows.get_children():
		child.queue_free()

	var groups := Items.group(Protocol.as_array(_state.inventory.get("items")))
	var shown := 0

	for entry: Dictionary in groups:
		var item: Dictionary = Protocol.as_dict(entry.get("item"))
		if _filter != FILTER_ALL and Items.category_of(item) != _filter:
			continue
		shown += 1
		_rows.add_child(_item_row(entry))

	_empty.visible = shown == 0


func _item_row(entry: Dictionary) -> Button:
	var item: Dictionary = Protocol.as_dict(entry.get("item"))
	var count := Protocol.as_int(entry.get("count"), 1)
	var weight := float(entry.get("weight", 0.0))

	var button := Button.new()
	button.toggle_mode = true
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	var name := _translator.pick(item.get("name"))
	button.text = (_translator.t("ui.inventory.row", {
			"name": name, "weight": snappedf(weight, 0.01),
		}) if count <= 1 else _translator.t("ui.inventory.row_stacked", {
			"name": name, "count": count, "weight": snappedf(weight, 0.01),
		}))

	var item_id := Protocol.as_string(item.get("id"))
	button.button_pressed = item_id == _selected_id
	button.pressed.connect(_select_item.bind(item_id))
	return button


func _select_item(item_id: String) -> void:
	_selected_id = item_id
	_refresh_items()
	_refresh_detail()


func _selected_item() -> Dictionary:
	for value: Variant in Protocol.as_array(_state.inventory.get("items")):
		var item: Dictionary = Protocol.as_dict(value)
		if Protocol.as_string(item.get("id")) == _selected_id:
			return item
	return {}


func _refresh_detail() -> void:
	for child: Node in _verbs.get_children():
		child.queue_free()

	var item := _selected_item()
	if item.is_empty():
		_selected_id = ""
		_detail.text = ""
		_quantity_row.visible = false
		_give_row.visible = false
		return

	_detail.text = _translator.pick(item.get("name"))

	var verbs := ActionRules.for_inventory_item(item, _action_context())
	if _container.is_open():
		verbs.append("put")

	for verb: String in verbs:
		var button := Button.new()
		button.text = _translator.t("ui.verb.%s" % verb)
		button.pressed.connect(_on_verb_pressed.bind(verb))
		_verbs.add_child(button)

	# 수량은 `stack_count` 가 1을 넘을 때만 의미가 있다. 현재는 화폐뿐이다
	var stack := Items.stack_count(item)
	_quantity_row.visible = Items.supports_quantity(item)
	if _quantity_row.visible:
		_quantity.min_value = 1
		_quantity.max_value = stack
		_quantity.value = mini(int(_quantity.value), stack)
		if _quantity.value < 1:
			_quantity.value = 1

	_give_row.visible = verbs.has("give")
	if _give_row.visible:
		_refresh_give_targets()


func _action_context() -> Dictionary:
	return {"has_other_players": not _room_players().is_empty()}


func _room_players() -> Dictionary:
	var my_id := Protocol.as_string(_state.player.get("id"))
	var players: Dictionary = {}
	for entity_id: Variant in _state.entities:
		var entity: Dictionary = Protocol.as_dict(_state.entities[entity_id])
		if Protocol.as_string(entity.get("kind")) != ActionRules.KIND_PLAYER:
			continue
		var id := Protocol.as_string(entity.get("id"))
		if id.is_empty() or id == my_id:
			continue
		players[id] = _translator.pick(entity.get("name"))
	return players



func _refresh_give_targets() -> void:
	if _translator == null:
		return
	var players := _room_players()

	_give_target.clear()
	_give_ids.clear()
	for id: Variant in players:
		_give_target.add_item(Protocol.as_string(players[id]))
		_give_ids.append(Protocol.as_string(id))

	if _give_ids.is_empty():
		_give_target.add_item(_translator.t("ui.give.no_target"))
		_give_target.disabled = true
	else:
		_give_target.disabled = false


func _on_verb_pressed(verb: String) -> void:
	var item := _selected_item()
	if item.is_empty():
		return

	# 요구사항이 정한 셋에 `give` 를 더한다. 계약의 `give` params 에 quantity 가
	# 있고 스택 아이템을 나눠 건넬 수 있어야 한다.
	var params: Dictionary = {}
	if _quantity_row.visible and verb in ["drop", "put", "give"]:
		params["quantity"] = int(_quantity.value)

	if verb == "give":
		if _give_ids.is_empty():
			notice_requested.emit("ui.give.no_target", {})
			return
		var index := maxi(0, _give_target.selected)
		params["to"] = _give_ids[index]

	if verb == "put" or verb == "take_from":
		params["container"] = _container.container_id()

	action_requested.emit(verb, _selected_id, params)


func _on_take_requested(item_id: String) -> void:
	action_requested.emit("take_from", item_id,
		{"container": _container.container_id()})


func _on_container_contents(container_id: String, items: Array) -> void:
	_container.show_contents(container_id, items)
	_refresh_detail()


func _on_filter_pressed(filter: String) -> void:
	_filter = filter
	for name: String in _filter_names():
		var button: Button = _filter_buttons[name]
		button.button_pressed = name == filter
	_refresh_items()


func _on_locale_changed(_locale: String) -> void:
	apply_texts()
