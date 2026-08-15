class_name ReadingScreen
extends VBoxContainer

## 읽기 화면.
##
## 책과 두루마리의 본문을 보여 준다. 본문은 번역 키가 아니라 언어별 dict 다.
## DB 의 이중언어 컬럼에 담긴 콘텐츠이므로 엔티티 이름·설명과 같이 다룬다.
##
## 여러 쪽이면 `read` 에 `params.page` 를 붙여 다음 쪽을 요청한다. 쪽을 서버가
## 들고 있으므로 클라이언트는 받은 쪽만 보여 준다.

signal closed()
signal action_requested(verb: String, target_id: String, params: Dictionary)

@onready var _title: Label = %ReadingTitle
@onready var _close: Button = %ReadingClose
@onready var _content: RichTextLabel = %ReadingContent
@onready var _page: Label = %ReadingPage
@onready var _previous: Button = %ReadingPrevious
@onready var _next: Button = %ReadingNext

var _state: GameStateStore = null
var _translator: TranslatorService = null

var _object_id := ""
var _page_number := 1
var _total_pages := 1


func _ready() -> void:
	_close.pressed.connect(func() -> void: closed.emit())
	_previous.pressed.connect(func() -> void: _turn(-1))
	_next.pressed.connect(func() -> void: _turn(1))


func bind(state: GameStateStore, translator: TranslatorService) -> void:
	_state = state
	_translator = translator
	apply_texts()


func apply_texts() -> void:
	if _translator == null:
		return
	_close.text = _translator.t("ui.reading.close")
	_previous.text = _translator.t("ui.reading.previous")
	_next.text = _translator.t("ui.reading.next")
	_refresh_page_label()


## `readable_content` 를 화면에 옮긴다.
func show_content(payload: Dictionary) -> void:
	_object_id = Protocol.as_string(payload.get("object_id"))
	_page_number = Protocol.as_int(payload.get("page"), 1)
	_total_pages = Protocol.as_int(payload.get("total_pages"), 1)

	_title.text = _name_of(_object_id)
	_content.text = _translator.pick(payload.get("content"))

	_refresh_page_label()

	var multi := _total_pages > 1
	_previous.visible = multi
	_next.visible = multi
	_previous.disabled = _page_number <= 1
	_next.disabled = _page_number >= _total_pages


## 이름은 방이나 소지품의 엔티티에서 찾는다. 서버가 본문과 함께 보내지 않는다.
func _name_of(object_id: String) -> String:
	if _state == null or object_id.is_empty():
		return ""

	var entity: Dictionary = Protocol.as_dict(_state.entities.get(object_id))
	if not entity.is_empty():
		return _translator.pick(entity.get("name"))

	for value: Variant in Protocol.as_array(_state.inventory.get("items")):
		var item: Dictionary = Protocol.as_dict(value)
		if Protocol.as_string(item.get("id")) == object_id:
			return _translator.pick(item.get("name"))

	return ""


func _refresh_page_label() -> void:
	if _translator == null:
		return
	if _total_pages > 1:
		_page.text = _translator.t(
			"ui.reading.page",
			{"page": _page_number, "total": _total_pages})
	else:
		_page.text = ""


func _turn(step: int) -> void:
	var wanted := _page_number + step
	if wanted < 1 or wanted > _total_pages or _object_id.is_empty():
		return
	action_requested.emit("read", _object_id, {"page": wanted})
