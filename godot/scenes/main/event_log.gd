class_name EventLog
extends VBoxContainer

## 이벤트와 채팅 로그.
##
## 서버는 완성된 문장을 보내지 않으므로 이벤트는 키와 params 를 보관하고 표시할
## 때 번역한다. locale 이 바뀌면 같은 로그가 다른 언어로 다시 그려진다.
##
## 채팅 본문은 번역하지 않는다. 플레이어가 입력한 문장을 그대로 보여준다.
##
## `RichTextLabel` 의 BBCode 를 켜지 않는다. 채팅 본문이 사용자 입력이므로
## BBCode 를 해석하면 다른 플레이어가 태그를 심을 수 있다.

## 채널 필터.
##
## 탭은 셋이다. 전투·이동·아이템·사회·시스템 탭은 없앴다. 그 내용은 "전체"
## 에 그대로 남는다. 탭이 여덟이면 고르는 일이 읽는 일보다 번거롭다.
##
## "대화" 는 채팅과 대화를 함께 받는다. NPC 와의 대화도 플레이어끼리의 말도
## 사용자에게는 같은 일이다.
const CHANNEL_ALL := "all"
const CHANNEL_CHAT := "chat"
const CHANNEL_DIALOGUE := "dialogue"
const CHANNEL_PARTY := "party"
const FILTERS: Array[String] = [
	CHANNEL_ALL, CHANNEL_CHAT, CHANNEL_PARTY,
]

## 필터가 받는 채널. 목록에 없는 필터는 자기 이름만 받는다.
const FILTER_CHANNELS := {
	CHANNEL_CHAT: [CHANNEL_CHAT, CHANNEL_DIALOGUE],
}

## 사용자가 탭을 바꿨다. 채팅 입력은 대화와 파티 탭에서만 동작한다
signal filter_changed(channel: String)

## 보관 상한. 상태 저장소와 같은 값을 쓴다.
const LIMIT := GameStateStore.LOG_LIMIT

@onready var _tabs: HFlowContainer = %LogTabs
@onready var _view: RichTextLabel = %LogView

var _translator: TranslatorService = null
## {"channel": String, "kind": "event"|"chat", ...}
var _entries: Array[Dictionary] = []
var _filter := CHANNEL_ALL
## 필터 → 버튼
var _buttons: Dictionary = {}


## 채널을 하나로 고정하고 탭을 숨긴다. 전투 화면이 전투 기록만 보일 때 쓴다.
func set_fixed_filter(channel: String) -> void:
	_filter = channel
	_tabs.visible = false
	_render()


func bind(translator: TranslatorService) -> void:
	_translator = translator
	_translator.locale_changed.connect(_on_locale_changed)

	for channel: String in FILTERS:
		var button := Button.new()
		button.toggle_mode = true
		button.button_pressed = channel == CHANNEL_ALL
		button.pressed.connect(_on_filter_pressed.bind(channel))
		_tabs.add_child(button)
		_buttons[channel] = button

	apply_texts()


func apply_texts() -> void:
	if _translator == null:
		return
	for channel: String in FILTERS:
		var button: Button = _buttons[channel]
		button.text = _translator.t("ui.log.%s" % channel)
	_render()


func add_event(payload: Dictionary) -> void:
	_append({
		"channel": Protocol.as_string(payload.get("category"), "system"),
		"kind": "event",
		"message": Protocol.as_dict(payload.get("message")),
	})


func add_chat(payload: Dictionary) -> void:
	var from: Dictionary = Protocol.as_dict(payload.get("from"))
	_append({
		"channel": CHANNEL_CHAT,
		"kind": "chat",
		"chat_channel": Protocol.as_string(
			payload.get("channel"), Protocol.CHAT_ROOM),
		"from": Protocol.as_string(from.get("display_name"), "?"),
		"message": Protocol.as_string(payload.get("message")),
	})


## 지금 고른 탭.
func current_filter() -> String:
	return _filter


func entry_count() -> int:
	return _entries.size()


## 채팅 입력을 받아도 되는 탭인가.
##
## 다른 탭을 보고 있으면 보낸 말이 그 화면에 나타나지 않는다. 눌러도 결과가
## 보이지 않는 입력을 열어 두지 않는다.
static func allows_chat(filter: String) -> bool:
	return filter == CHANNEL_CHAT or filter == CHANNEL_PARTY


## 필터가 그 채널을 받는가.
##
## 정적 함수인 것은 씬 트리 없이 검증하기 위해서다. 탭 구성이 요구 사항이므로
## 테스트가 그것을 붙잡아야 한다.
static func accepts(filter: String, channel: String) -> bool:
	if filter == CHANNEL_ALL:
		return true
	var accepted: Array = FILTER_CHANNELS.get(filter, [filter])
	return accepted.has(channel)


func _append(entry: Dictionary) -> void:
	_entries.append(entry)
	if _entries.size() > LIMIT:
		_entries.remove_at(0)
	_render()


func _render() -> void:
	if _translator == null:
		return

	var lines: Array[String] = []
	for entry: Dictionary in _entries:
		if not EventLog.accepts(_filter, Protocol.as_string(entry.get("channel"))):
			continue
		lines.append(_line_of(entry))

	_view.text = "\n".join(lines)
	# 새 줄이 보이도록 끝으로 내린다
	_view.scroll_to_line(maxi(0, _view.get_line_count() - 1))


func _line_of(entry: Dictionary) -> String:
	if Protocol.as_string(entry.get("kind")) == "chat":
		var key := ("ui.chat.line_whisper"
			if Protocol.as_string(entry.get("chat_channel")) == Protocol.CHAT_WHISPER
			else "ui.chat.line_room")
		return _translator.t(key, {
			"from": Protocol.as_string(entry.get("from")),
			"message": Protocol.as_string(entry.get("message")),
		})
	return _translator.render(Protocol.as_dict(entry.get("message")))


func _on_filter_pressed(channel: String) -> void:
	if not _tabs.visible:
		return
	_filter = channel
	for name: String in FILTERS:
		var button: Button = _buttons[name]
		button.button_pressed = name == channel
	_render()
	filter_changed.emit(channel)


func _on_locale_changed(_locale: String) -> void:
	apply_texts()
