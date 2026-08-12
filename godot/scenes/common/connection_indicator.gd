class_name ConnectionIndicator
extends HBoxContainer

## 연결 상태 표시.
##
## 연결 중, 연결됨, 끊김, 재연결 시도를 보여주고 재연결 대기를 취소할 수단을
## 제공한다. 문구는 아직 하드코딩이며 Task 2.3 에서 Translator 를 거치게 한다.

## 사용자가 취소 후 다시 붙기를 원한다. 접속 주소를 아는 쪽이 처리한다.
signal reconnect_requested()

const TEXT_DISCONNECTED := "Disconnected"
const TEXT_CONNECTING := "Connecting…"
const TEXT_WAITING := "Waiting for the server…"
const TEXT_READY := "Connected"
const TEXT_RECONNECTING := "Reconnecting in %ds (attempt %d)"
const TEXT_CANCELLED := "Reconnection cancelled"
const TEXT_CANCEL := "Cancel"
const TEXT_RETRY := "Retry"

@onready var _label: Label = %StatusLabel
@onready var _button: Button = %CancelButton

var _connection: Connection = null
var _countdown := 0.0
var _attempt := 0
var _cancelled := false


func bind(connection: Connection) -> void:
	_connection = connection
	_connection.state_changed.connect(_on_state_changed)
	_connection.reconnect_scheduled.connect(_on_reconnect_scheduled)
	_connection.reconnect_cancelled.connect(_on_reconnect_cancelled)
	_button.pressed.connect(_on_button_pressed)
	_on_state_changed(_connection.get_state())


func _process(delta: float) -> void:
	if _countdown <= 0.0:
		return
	_countdown = maxf(0.0, _countdown - delta)
	_label.text = TEXT_RECONNECTING % [int(ceil(_countdown)), _attempt]


func _on_state_changed(state: Connection.State) -> void:
	_countdown = 0.0
	_cancelled = false
	_button.visible = false

	match state:
		Connection.State.DISCONNECTED:
			_label.text = TEXT_DISCONNECTED
		Connection.State.CONNECTING:
			_label.text = TEXT_CONNECTING
		Connection.State.WAITING_WELCOME:
			_label.text = TEXT_WAITING
		Connection.State.READY:
			_label.text = TEXT_READY


func _on_reconnect_scheduled(delay: float, attempt: int) -> void:
	_countdown = delay
	_attempt = attempt
	_cancelled = false
	_label.text = TEXT_RECONNECTING % [int(ceil(delay)), attempt]
	_button.text = TEXT_CANCEL
	_button.visible = true


func _on_reconnect_cancelled() -> void:
	_countdown = 0.0
	_cancelled = true
	_label.text = TEXT_CANCELLED
	_button.text = TEXT_RETRY
	_button.visible = true


func _on_button_pressed() -> void:
	if _connection == null:
		return
	if _cancelled:
		reconnect_requested.emit()
		_button.visible = false
		return
	_connection.cancel_reconnect()
