class_name ConnectionIndicator
extends HBoxContainer

## 연결 상태 표시.
##
## 연결 중, 연결됨, 끊김, 재연결 시도를 보여주고 재연결 대기를 취소할 수단을
## 제공한다.
##
## 현재 상태를 필드로 들고 있는 것은 locale 이 바뀌면 같은 상태를 다른 언어로
## 다시 그려야 하기 때문이다. 표시 문자열만 갖고 있으면 다시 그릴 수 없다.

## 사용자가 취소 후 다시 붙기를 원한다. 접속 주소를 아는 쪽이 처리한다.
signal reconnect_requested()

const STATE_KEYS := {
	Connection.State.DISCONNECTED: "ui.connection.disconnected",
	Connection.State.CONNECTING: "ui.connection.connecting",
	Connection.State.WAITING_WELCOME: "ui.connection.waiting",
	Connection.State.READY: "ui.connection.connected",
}

@onready var _label: Label = %StatusLabel
@onready var _button: Button = %CancelButton

var _connection: Connection = null
var _translator: TranslatorService = null

var _state: Connection.State = Connection.State.DISCONNECTED
var _countdown := 0.0
var _attempt := 0
var _cancelled := false


func bind(connection: Connection, translator: TranslatorService) -> void:
	_connection = connection
	_translator = translator

	_connection.state_changed.connect(_on_state_changed)
	_connection.reconnect_scheduled.connect(_on_reconnect_scheduled)
	_connection.reconnect_cancelled.connect(_on_reconnect_cancelled)
	_translator.locale_changed.connect(_on_locale_changed)
	_button.pressed.connect(_on_button_pressed)

	_on_state_changed(_connection.get_state())


func apply_texts() -> void:
	if _translator == null:
		return

	# 버튼이 숨어 있어도 문구를 갱신한다. 갱신을 표시 상태에 묶어 두면 다시
	# 나타날 때 이전 locale 의 문구가 남는다.
	_button.text = _translator.t(
		"ui.connection.retry" if _cancelled else "ui.connection.cancel")

	if _cancelled:
		_label.text = _translator.t("ui.connection.reconnect_cancelled")
		return

	if _countdown > 0.0:
		_label.text = _translator.t("ui.connection.reconnecting", {
			"seconds": int(ceil(_countdown)),
			"attempt": _attempt,
		})
		return

	_label.text = _translator.t(
		Protocol.as_string(STATE_KEYS.get(_state), "ui.connection.disconnected"))


func _process(delta: float) -> void:
	if _countdown <= 0.0:
		return
	_countdown = maxf(0.0, _countdown - delta)
	apply_texts()


func _on_state_changed(state: Connection.State) -> void:
	_state = state
	_countdown = 0.0
	_cancelled = false
	_button.visible = false
	apply_texts()


func _on_reconnect_scheduled(delay: float, attempt: int) -> void:
	_countdown = delay
	_attempt = attempt
	_cancelled = false
	_button.visible = true
	apply_texts()


func _on_reconnect_cancelled() -> void:
	_countdown = 0.0
	_cancelled = true
	_button.visible = true
	apply_texts()


func _on_locale_changed(_locale: String) -> void:
	apply_texts()


func _on_button_pressed() -> void:
	if _connection == null:
		return
	if _cancelled:
		reconnect_requested.emit()
		_button.visible = false
		return
	_connection.cancel_reconnect()
