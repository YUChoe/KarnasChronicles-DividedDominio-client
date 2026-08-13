class_name ContainerPanel
extends PanelContainer

## 컨테이너 내용.
##
## `open` verb 의 응답인 `container_contents` 로 채운다. 서버가 열림 상태를
## 유지하지 않으므로 대응하는 `close` verb 가 없다. 닫기는 화면을 숨길 뿐이다.
##
## 내부 아이템도 방과 인벤토리와 같은 오브젝트 스키마를 따른다. 배열 인덱스로
## 지정하던 경로는 폐기됐고 uuid 로 통일됐다.

signal take_requested(item_id: String)
signal closed()

@onready var _title: Label = %ContainerTitle
@onready var _rows: VBoxContainer = %ContainerRows
@onready var _empty: Label = %ContainerEmpty
@onready var _close: Button = %ContainerClose

var _translator: TranslatorService = null
var _container_id := ""
var _items: Array = []


func _ready() -> void:
	_close.pressed.connect(_on_close_pressed)
	visible = false


func bind(translator: TranslatorService) -> void:
	_translator = translator
	apply_texts()


func apply_texts() -> void:
	if _translator == null:
		return
	_title.text = _translator.t("ui.container.title")
	_empty.text = _translator.t("ui.container.empty")
	_close.text = _translator.t("ui.container.close")
	_rebuild()


func container_id() -> String:
	return _container_id


func is_open() -> bool:
	return visible


func show_contents(container_id_value: String, items: Array) -> void:
	_container_id = container_id_value
	_items = items
	_rebuild()
	visible = true


func close() -> void:
	_container_id = ""
	_items = []
	visible = false


func _rebuild() -> void:
	for child: Node in _rows.get_children():
		child.queue_free()

	_empty.visible = _items.is_empty()
	if _translator == null:
		return

	for value: Variant in _items:
		var item: Dictionary = Protocol.as_dict(value)
		var id := Protocol.as_string(item.get("id"))
		if id.is_empty():
			continue

		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)

		var label := Label.new()
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		label.text = _translator.pick(item.get("name"))
		row.add_child(label)

		var button := Button.new()
		button.text = _translator.t("ui.verb.take_from")
		button.pressed.connect(_on_take_pressed.bind(id))
		row.add_child(button)

		_rows.add_child(row)


func _on_take_pressed(item_id: String) -> void:
	take_requested.emit(item_id)


func _on_close_pressed() -> void:
	close()
	closed.emit()
