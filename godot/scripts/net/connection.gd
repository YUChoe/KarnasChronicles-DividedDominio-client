class_name Connection
extends Node

## 게임 채널 WebSocket 연결.
##
## `WebSocketPeer` 를 감싸 상태 전이, 재연결, 유휴 유지를 담당한다. 메시지 내용은
## 해석하지 않고 `Dispatcher` 로 넘긴다. 다만 `welcome` 은 상태 전이와 버전·채널
## 확인에 필요하므로 디스패처가 보낸 신호를 되받아 처리한다.
##
## 게이트웨이가 라인 경계를 복원해 프레임 하나에 JSON 오브젝트 하나를 담으므로
## 프레임 단위로 파싱한다. 프레임에 개행이 없다.

enum State {
	DISCONNECTED,
	CONNECTING,
	WAITING_WELCOME,
	READY,
}

## 서버 세션 유휴 타이머 갱신 주기. 계약이 60초를 규정한다.
const PING_INTERVAL := 60.0
## 재연결 지수 백오프. 1초에서 시작해 2배씩 늘리고 30초를 상한으로 둔다.
const RECONNECT_BASE_DELAY := 1.0
const RECONNECT_MAX_DELAY := 30.0
const RECONNECT_FACTOR := 2.0

signal state_changed(state: State)
## 재연결 대기가 시작됐다. 사용자에게 취소 수단을 제공한다.
signal reconnect_scheduled(delay: float, attempt: int)
signal reconnect_cancelled()
## 지원하지 않는 `protocol_version` 을 받았다. 클라이언트 업데이트를 안내한다.
signal protocol_unsupported(version: int)
## 기대한 채널이 아니다. 접속 설정 오류다.
signal channel_mismatch(actual: String, expected: String)
signal closed(code: int, reason: String)

var dispatcher: Dispatcher = null
## `client_info` 로 통지할 locale. 접속 설정에서 주입한다.
var locale := ClientConfig.DEFAULT_LOCALE
var expected_channel := Protocol.CHANNEL_GAME

var _socket: WebSocketPeer = null
var _state: State = State.DISCONNECTED
var _url := ""
var _seq := 0
var _idle_seconds := 0.0
## 사용자나 프로토콜 위반으로 끊은 경우 재연결하지 않는다
var _intentional := false
var _reconnect_attempt := 0
var _reconnect_remaining := 0.0
var _reconnect_pending := false


func get_state() -> State:
	return _state


func get_reconnect_attempt() -> int:
	return _reconnect_attempt


func is_reconnect_pending() -> bool:
	return _reconnect_pending


## 요청 메시지에 넣을 seq. 1부터 증가하며 연결마다 초기화된다.
func next_seq() -> int:
	_seq += 1
	return _seq


func set_dispatcher(value: Dispatcher) -> void:
	dispatcher = value
	if not dispatcher.welcome_received.is_connected(_on_welcome_received):
		dispatcher.welcome_received.connect(_on_welcome_received)


func open(url: String) -> void:
	_url = url
	_intentional = false
	_cancel_reconnect_silently()
	_start_socket()


## 사용자가 끊었다. 재연결하지 않는다.
func close(reason: String = "client closed") -> void:
	_intentional = true
	_cancel_reconnect_silently()
	if _socket != null:
		_socket.close(1000, reason)
	_set_state(State.DISCONNECTED)


## 대기 중인 재연결을 취소한다.
func cancel_reconnect() -> void:
	if not _reconnect_pending:
		return
	_intentional = true
	_cancel_reconnect_silently()
	reconnect_cancelled.emit()


## `welcome` 수신 전에는 어떤 메시지도 보내지 않는다.
func send(payload: Dictionary) -> bool:
	if _state != State.READY or _socket == null:
		push_warning("READY 상태가 아니어서 %s 를 보내지 않았습니다"
			% Protocol.as_string(payload.get("type"), "?"))
		return false

	var status := _socket.send_text(JSON.stringify(payload))
	if status != OK:
		push_warning("송신 실패 (%d)" % status)
		return false

	_idle_seconds = 0.0
	return true


func _process(delta: float) -> void:
	if _reconnect_pending:
		_tick_reconnect(delta)
		return
	if _socket == null:
		return

	_socket.poll()

	match _socket.get_ready_state():
		WebSocketPeer.STATE_OPEN:
			if _state == State.CONNECTING:
				_set_state(State.WAITING_WELCOME)
			_drain_packets()
			_tick_ping(delta)
		WebSocketPeer.STATE_CLOSED:
			_handle_closed()


func _start_socket() -> void:
	_socket = WebSocketPeer.new()
	_seq = 0
	_idle_seconds = 0.0

	var status := _socket.connect_to_url(_url)
	if status != OK:
		push_warning("접속 시도 실패: %s (%d)" % [_url, status])
		_socket = null
		_set_state(State.DISCONNECTED)
		_schedule_reconnect()
		return

	_set_state(State.CONNECTING)


func _drain_packets() -> void:
	while _socket.get_available_packet_count() > 0:
		var text := _socket.get_packet().get_string_from_utf8()
		if dispatcher == null:
			push_warning("디스패처가 없어 프레임을 버립니다")
			continue
		dispatcher.handle_frame(text)


func _tick_ping(delta: float) -> void:
	if _state != State.READY:
		return
	_idle_seconds += delta
	if _idle_seconds < PING_INTERVAL:
		return
	send({"type": Protocol.PING, "seq": next_seq()})


func _handle_closed() -> void:
	var code := _socket.get_close_code()
	var reason := _socket.get_close_reason()
	_socket = null
	_set_state(State.DISCONNECTED)
	closed.emit(code, reason)

	if not _intentional:
		_schedule_reconnect()


func _schedule_reconnect() -> void:
	if _url.is_empty():
		return
	_reconnect_attempt += 1
	_reconnect_remaining = _backoff_delay(_reconnect_attempt)
	_reconnect_pending = true
	reconnect_scheduled.emit(_reconnect_remaining, _reconnect_attempt)


## 1, 2, 4, 8, 16, 30, 30 ... 초
func _backoff_delay(attempt: int) -> float:
	var delay := RECONNECT_BASE_DELAY * pow(RECONNECT_FACTOR, float(attempt - 1))
	return minf(delay, RECONNECT_MAX_DELAY)


func _tick_reconnect(delta: float) -> void:
	_reconnect_remaining -= delta
	if _reconnect_remaining > 0.0:
		return
	_reconnect_pending = false
	_start_socket()


func _cancel_reconnect_silently() -> void:
	_reconnect_pending = false
	_reconnect_remaining = 0.0


func _set_state(state: State) -> void:
	if _state == state:
		return
	_state = state
	if state == State.READY:
		_reconnect_attempt = 0
	state_changed.emit(state)


## `welcome` 으로 버전과 채널을 확인하고 READY 로 전이한다.
func _on_welcome_received(payload: Dictionary) -> void:
	if _state != State.WAITING_WELCOME:
		push_warning("welcome 을 %d 상태에서 받았습니다" % _state)
		return

	var version := Protocol.as_int(payload.get("protocol_version"), -1)
	if not Protocol.SUPPORTED_VERSIONS.has(version):
		protocol_unsupported.emit(version)
		close("unsupported protocol version")
		return

	var channel := Protocol.as_string(payload.get("channel"))
	if channel != expected_channel:
		channel_mismatch.emit(channel, expected_channel)
		close("channel mismatch")
		return

	_set_state(State.READY)
	_send_client_info()


## 접속 후 단방향 통지. 응답을 기다리지 않는다.
func _send_client_info() -> void:
	send({
		"type": Protocol.CLIENT_INFO,
		"seq": next_seq(),
		"client_version": Protocol.as_string(
			ProjectSettings.get_setting("application/config/version"), "0.0.0"),
		"platform": OS.get_name().to_lower(),
		"locale": locale,
	})
