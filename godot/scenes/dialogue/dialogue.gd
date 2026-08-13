class_name DialogueScreen
extends VBoxContainer

## 대화 화면.
##
## `choices[].index` 는 대화 인스턴스 안에서만 유효한 로컬 번호다. uuid 규약의
## 예외이며 선택지가 엔티티가 아니라 대화 트리의 분기이기 때문이다. 그 번호를
## `dialogue_choice` 의 `params.choice` 로 되돌려 보낸다.
##
## 발화와 선택지는 과도기 형태다. 계약은 키와 params 를 규정하지만 서버가 아직
## 언어별 dict 를 보낸다. `Translator.text_of` 가 양쪽을 받는다.

signal action_requested(verb: String, target_id: String, params: Dictionary)

@onready var _title: Label = %DialogueTitle
@onready var _speaker: Label = %SpeakerLabel
@onready var _lines: RichTextLabel = %DialogueLines
@onready var _choices: VBoxContainer = %ChoiceButtons
@onready var _no_choices: Label = %NoChoices
@onready var _end: Button = %DialogueEnd

var _state: GameStateStore = null
var _translator: TranslatorService = null


func _ready() -> void:
	_end.pressed.connect(
		func() -> void: action_requested.emit("dialogue_end", "", {}))


func bind(state: GameStateStore, translator: TranslatorService) -> void:
	_state = state
	_translator = translator

	_state.dialogue_changed.connect(_refresh)
	_translator.locale_changed.connect(_on_locale_changed)

	apply_texts()


func apply_texts() -> void:
	if _translator == null:
		return
	_title.text = _translator.t("ui.dialogue.title")
	_end.text = _translator.t("ui.dialogue.end")
	_no_choices.text = _translator.t("ui.dialogue.no_choices")
	_refresh()


func _refresh() -> void:
	if _state == null or _translator == null:
		return

	for child: Node in _choices.get_children():
		child.queue_free()

	# `is_active` 가 거짓이면 상태 저장소가 비운다. 화면 전환은 조립 지점이 한다
	if _state.dialogue.is_empty():
		_speaker.text = ""
		_lines.text = ""
		_no_choices.visible = false
		return

	var speaker: Dictionary = Protocol.as_dict(_state.dialogue.get("speaker"))
	_speaker.text = _translator.pick(speaker.get("name"))

	var lines: Array[String] = []
	for value: Variant in Protocol.as_array(_state.dialogue.get("lines")):
		lines.append(_translator.text_of(value))
	_lines.text = "\n".join(lines)

	var choices := Protocol.as_array(_state.dialogue.get("choices"))
	_no_choices.visible = choices.is_empty()

	for value: Variant in choices:
		var choice: Dictionary = Protocol.as_dict(value)
		var index := Protocol.as_int(choice.get("index"))
		var button := Button.new()
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.text = _translator.text_of(choice.get("text"))
		button.pressed.connect(_on_choice_pressed.bind(index))
		_choices.add_child(button)


func _on_choice_pressed(index: int) -> void:
	action_requested.emit("dialogue_choice", "", {"choice": index})


func _on_locale_changed(_locale: String) -> void:
	apply_texts()
