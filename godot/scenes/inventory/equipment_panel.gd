class_name EquipmentPanel
extends VBoxContainer

## 장착 슬롯 표시.
##
## 서버는 빈 슬롯을 담지 않는다. 표시할 슬롯 목록은 클라이언트가 들고 있고 없는
## 키를 빈 슬롯으로 처리한다. 목록 밖의 슬롯에 장착된 것이 있으면 뒤에 덧붙인다.
## 레거시 슬롯 이름(`weapon`, `armor`, `accessory`)이 데이터에 남아 있다.

signal slot_selected(item_id: String)

@onready var _title: Label = %EquipmentTitle
@onready var _rows: VBoxContainer = %EquipmentRows

var _translator: TranslatorService = null
var _equipped: Dictionary = {}
## uuid → 아이템
var _items_by_id: Dictionary = {}


func bind(translator: TranslatorService) -> void:
	_translator = translator
	apply_texts()


func apply_texts() -> void:
	if _translator == null:
		return
	_title.text = _translator.t("ui.equipment.title")
	_rebuild()


func set_equipped(equipped: Dictionary, items: Array) -> void:
	_equipped = equipped
	_items_by_id = {}
	for value: Variant in items:
		var item: Dictionary = Protocol.as_dict(value)
		var id := Protocol.as_string(item.get("id"))
		if not id.is_empty():
			_items_by_id[id] = item
	_rebuild()


func _rebuild() -> void:
	for child: Node in _rows.get_children():
		child.queue_free()
	if _translator == null:
		return

	for slot: String in _slots():
		_rows.add_child(_row(slot))


## 표시 순서는 고정 목록이 먼저, 목록 밖의 슬롯이 뒤다.
func _slots() -> Array[String]:
	var slots: Array[String] = Items.SLOTS.duplicate()
	for slot: Variant in _equipped:
		var name := Protocol.as_string(slot)
		if not name.is_empty() and not slots.has(name):
			slots.append(name)
	return slots


func _row(slot: String) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)

	var label := Label.new()
	label.custom_minimum_size = Vector2(96, 0)
	# 목록 밖의 슬롯은 번역 키가 없으므로 원래 이름을 그대로 보인다
	var key := "ui.slot.%s" % slot
	var text := _translator.t(key)
	label.text = slot if text == key else text
	row.add_child(label)

	var item_id := Protocol.as_string(_equipped.get(slot))
	if item_id.is_empty():
		var empty := Label.new()
		empty.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		empty.text = _translator.t("ui.equipment.empty_slot")
		row.add_child(empty)
		return row

	var button := Button.new()
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.text = _translator.pick(
		Protocol.as_dict(_items_by_id.get(item_id)).get("name"))
	if button.text.is_empty():
		button.text = _translator.t("ui.equipment.empty_slot")
	button.pressed.connect(_on_slot_pressed.bind(item_id))
	row.add_child(button)
	return row


func _on_slot_pressed(item_id: String) -> void:
	slot_selected.emit(item_id)
