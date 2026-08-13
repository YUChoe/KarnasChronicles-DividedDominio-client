class_name ActionPopover
extends PanelContainer

## 대상 상세와 동사 버튼.
##
## 엔티티 버튼 아래에 인라인으로 나타난다. 시선 이동이 적은 대신 레이아웃이
## 흔들린다. 대안인 우측 고정 패널은 흔들림이 없지만 엔티티 목록에서 시선이
## 멀어지고, 오른쪽 열이 이미 미니맵과 출구로 차 있다. design.md 의 기본안대로
## 팝오버를 택했다.
##
## Entity_UUID 를 화면에 적지 않는다. 팝오버가 내부적으로 들고 전송에만 쓴다.

signal action_requested(verb: String, target_id: String)
## 아이템을 골라야 보낼 수 있는 동사를 눌렀다
signal item_required(verb: String)
signal closed()

## 대상만으로는 보낼 수 없는 동사. `give` 는 건넬 아이템이 있어야 한다.
## 아이템 선택은 인벤토리 화면의 일이며 Task 7 에서 이어 붙인다.
const VERBS_NEEDING_ITEM: Array[String] = ["give"]

@onready var _name: Label = %TargetName
@onready var _meta: Label = %TargetMeta
@onready var _hp: Label = %TargetHp
@onready var _description: Label = %TargetDescription
@onready var _verbs: HFlowContainer = %VerbButtons
@onready var _close: Button = %PopoverClose

var _translator: TranslatorService = null
var _entity: Dictionary = {}
var _verb_list: Array[String] = []


func _ready() -> void:
	_close.pressed.connect(func() -> void: closed.emit())
	visible = false


func bind(translator: TranslatorService) -> void:
	_translator = translator
	_translator.locale_changed.connect(_on_locale_changed)


func target_id() -> String:
	return Protocol.as_string(_entity.get("id"))


func show_target(entity: Dictionary, verbs: Array[String]) -> void:
	_entity = entity
	_verb_list = verbs.duplicate()
	_render()
	visible = true


func clear() -> void:
	_entity = {}
	_verb_list.clear()
	visible = false


## 서버가 적용 불가라고 답한 동사를 지운다. 오류로 표시하지 않는다.
func remove_verb(verb: String) -> void:
	_verb_list.erase(verb)
	_render()


func _render() -> void:
	if _translator == null or _entity.is_empty():
		return

	_name.text = _translator.pick(_entity.get("name"))
	_meta.text = _meta_text()

	var max_hp := Protocol.as_int(_entity.get("max_hp"), 0)
	_hp.visible = max_hp > 0
	if _hp.visible:
		_hp.text = _translator.t("ui.target.hp", {
			"hp": Protocol.as_int(_entity.get("hp")),
			"max_hp": max_hp,
		})

	var description := _translator.pick(_entity.get("description"))
	_description.text = (description if not description.is_empty()
		else _translator.t("ui.target.no_description"))

	for child: Node in _verbs.get_children():
		child.queue_free()

	for verb: String in _verb_list:
		var button := Button.new()
		button.text = _translator.t("ui.verb.%s" % verb)
		button.pressed.connect(_on_verb_pressed.bind(verb))
		_verbs.add_child(button)

	_close.text = _translator.t("ui.players.close")


## 종족과 관계, 스택 수량을 한 줄에 담는다.
func _meta_text() -> String:
	var parts: Array[String] = []

	var faction := Protocol.as_string(_entity.get("faction_id"))
	if not faction.is_empty():
		parts.append(faction)

	var disposition := Protocol.as_string(_entity.get("disposition"))
	if not disposition.is_empty():
		parts.append(_translator.t("ui.disposition.%s" % disposition))

	var stack := Protocol.as_int(_entity.get("stack_count"), 1)
	if stack > 1:
		parts.append(_translator.t("ui.target.stack", {"count": stack}))

	return "  ".join(parts)


func _on_verb_pressed(verb: String) -> void:
	if VERBS_NEEDING_ITEM.has(verb):
		item_required.emit(verb)
		return
	action_requested.emit(verb, target_id())


func _on_locale_changed(_locale: String) -> void:
	if visible:
		_render()
