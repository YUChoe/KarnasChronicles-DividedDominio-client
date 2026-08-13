class_name ChatBar
extends HBoxContainer

## 채팅 입력.
##
## 여기가 자유 문자 입력이 허용되는 지점이다. 명령어 입력창이 아니며 입력값은
## 그대로 `chat` 메시지의 `message` 로 간다.
##
## 귓속말의 `to` 는 uuid 다. 사용자명 문자열을 보내지 않는다. 대상 목록은 같은
## 방의 플레이어와 `who_result` 로 확보한다.

signal message_submitted(channel: String, message: String, to: String)
## 귓속말 대상이 없는데 귓속말을 보내려 했다.
signal target_missing()

## 계약이 본문을 500자로 제한한다.
const MAX_LENGTH := 500

@onready var _channel: OptionButton = %ChannelOptions
@onready var _target: OptionButton = %TargetOptions
@onready var _input: LineEdit = %MessageEdit
@onready var _send: Button = %SendButton

var _translator: TranslatorService = null
## 항목 인덱스 → uuid
var _target_ids: Array[String] = []


func _ready() -> void:
	_input.max_length = MAX_LENGTH
	_send.pressed.connect(_on_send_pressed)
	_input.text_submitted.connect(_on_text_submitted)


func bind(translator: TranslatorService) -> void:
	_translator = translator
	_translator.locale_changed.connect(_on_locale_changed)

	_channel.clear()
	_channel.add_item("")
	_channel.add_item("")
	_channel.item_selected.connect(_on_channel_selected)

	apply_texts()
	_refresh_target_visibility()


func apply_texts() -> void:
	if _translator == null:
		return
	_channel.set_item_text(0, _translator.t("ui.chat.channel_room"))
	_channel.set_item_text(1, _translator.t("ui.chat.channel_whisper"))
	_send.text = _translator.t("ui.chat.send")
	_input.placeholder_text = _translator.t("ui.chat.placeholder")
	# 항목이 없는데 set_item_text 를 부르면 범위를 벗어난다
	if _target_ids.is_empty() and _target.item_count > 0:
		_target.set_item_text(0, _translator.t("ui.chat.no_target"))


## `{uuid: 표시 이름}` 을 받아 귓속말 대상 목록을 채운다.
func set_targets(targets: Dictionary) -> void:
	var previous := current_target()

	_target.clear()
	_target_ids.clear()

	if targets.is_empty():
		_target.add_item(_translator.t("ui.chat.no_target") if _translator else "")
		_target.disabled = true
		_refresh_target_visibility()
		return

	_target.disabled = false
	for uuid: Variant in targets:
		var id := Protocol.as_string(uuid)
		_target.add_item(Protocol.as_string(targets[uuid], id))
		_target_ids.append(id)

	var index := _target_ids.find(previous)
	_target.selected = index if index >= 0 else 0
	_refresh_target_visibility()


## 귓속말 채널로 바꾸고 대상을 고른다. 플레이어 목록에서 호출한다.
func focus_whisper(target_id: String) -> void:
	var index := _target_ids.find(target_id)
	if index < 0:
		return
	_channel.selected = 1
	_target.selected = index
	_refresh_target_visibility()
	_input.grab_focus()


func current_channel() -> String:
	return Protocol.CHAT_WHISPER if _channel.selected == 1 else Protocol.CHAT_ROOM


func current_target() -> String:
	if _target.selected < 0 or _target.selected >= _target_ids.size():
		return ""
	return _target_ids[_target.selected]


func _refresh_target_visibility() -> void:
	_target.visible = current_channel() == Protocol.CHAT_WHISPER


func _on_channel_selected(_index: int) -> void:
	_refresh_target_visibility()


func _on_text_submitted(_text: String) -> void:
	_on_send_pressed()


func _on_send_pressed() -> void:
	var message := _input.text.strip_edges()
	if message.is_empty():
		return

	var channel := current_channel()
	var to := current_target()
	if channel == Protocol.CHAT_WHISPER and to.is_empty():
		target_missing.emit()
		return

	_input.text = ""
	message_submitted.emit(channel, message, to)


func _on_locale_changed(_locale: String) -> void:
	apply_texts()
