class_name EntityZone
extends VBoxContainer

## 엔티티 버튼 구역 하나. 인물, 동물, 적, 물건에 각각 하나씩 쓴다.
##
## 구역마다 스크롤을 둔다. uuid 전환으로 표시 개수 제한이 사라졌으므로 한 구역이
## 화면을 다 먹는 것을 막아야 한다.
##
## 엔티티가 없으면 구역째 숨긴다. 빈 제목만 남는 것을 피한다.

signal entity_selected(entity_id: String)

const BUTTON_SCENE := preload("res://scenes/main/entity_button.tscn")

@onready var _title: Label = %ZoneTitle
@onready var _buttons: HFlowContainer = %ZoneButtons

var _translator: TranslatorService = null
var _title_key := ""


func bind(title_key: String, translator: TranslatorService) -> void:
	_title_key = title_key
	_translator = translator
	apply_texts()


func apply_texts() -> void:
	if _translator == null or _title_key.is_empty():
		return
	_title.text = _translator.t(_title_key)


## 버튼을 전부 다시 만든다. 부분 갱신은 Task 5.6 이 다룬다.
func set_entities(entities: Array) -> void:
	for child: Node in _buttons.get_children():
		child.queue_free()

	for value: Variant in entities:
		var entity: Dictionary = Protocol.as_dict(value)
		var button: EntityButton = BUTTON_SCENE.instantiate()
		_buttons.add_child(button)
		button.setup(entity, _translator)
		button.selected.connect(_on_button_selected)

	visible = not entities.is_empty()


## 선택된 하나만 눌린 모습으로 둔다.
func set_selected(entity_id: String) -> void:
	for child: Node in _buttons.get_children():
		if child is EntityButton:
			var button := child as EntityButton
			button.set_selected(button.entity_id == entity_id)


func _on_button_selected(entity_id: String) -> void:
	entity_selected.emit(entity_id)
