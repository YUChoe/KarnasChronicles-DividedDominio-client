class_name AdminConnection
extends Connection

## 어드민 채널 전용 연결.
##
## 게임 연결과 독립적이다. 게임 로그인 상태가 어드민 권한을 부여하지 않으므로
## 어드민 채널에서 다시 인증한다. 게임 채널이 열려 있든 없든 무관하게 붙는다.
##
## `Connection` 을 상속해 소켓, 상태 전이, 재연결, 유휴 유지를 재사용한다. 다른
## 점은 셋이다. 기대 채널이 `admin` 이고, `client_info` 를 보내지 않으며(어드민
## 채널이 이 타입을 거절한다), 세션 만료 시각을 들고 있는다.
##
## 세션 유효 기간은 2시간이다. 만료되면 서버가 `SESSION_EXPIRED` 로 거절하고
## 연결을 끊으므로 클라이언트가 먼저 알아채고 재인증을 요구한다.

## 인증에 성공했다
signal authenticated(admin: Dictionary, expires_at: String)
## 인증이 거절됐다
signal authentication_failed(reason_code: String, detail: String)
## 세션이 만료됐다. 재인증이 필요하다
signal session_expired()

## 만료 몇 초 전에 미리 알릴지. 서버가 끊기 전에 재인증을 유도한다
const EXPIRY_MARGIN := 30.0

var _authenticated := false
## 남은 세션 시간(초). 0 이하면 만료로 본다
var _seconds_left := 0.0
var _admin: Dictionary = {}


func _init() -> void:
	expected_channel = Protocol.CHANNEL_ADMIN
	announce_client_info = false


func is_authenticated() -> bool:
	return _authenticated


func get_admin() -> Dictionary:
	return _admin


func seconds_left() -> float:
	return _seconds_left


## 어드민 디스패처의 신호를 붙인다. `set_dispatcher` 를 먼저 부른 뒤 호출한다.
func bind_admin_dispatcher(dispatcher: AdminDispatcher) -> void:
	set_dispatcher(dispatcher)
	dispatcher.admin_login_result.connect(_on_login_result)
	dispatcher.rejected.connect(_on_rejected)


func login(username: String, password: String) -> bool:
	return send({
		"type": Protocol.ADMIN_LOGIN,
		"seq": next_seq(),
		"username": username,
		"password": password,
	})


## 인증 후에만 보낼 수 있는 메시지다. 인증 전에는 서버가 거절한다.
func send_authenticated(payload: Dictionary) -> int:
	if not _authenticated:
		push_warning("인증 전에 %s 를 보내려 했습니다"
			% Protocol.as_string(payload.get("type"), "?"))
		return 0

	var seq := next_seq()
	payload["seq"] = seq
	return seq if send(payload) else 0


func _process(delta: float) -> void:
	super._process(delta)
	if not _authenticated or _seconds_left <= 0.0:
		return

	_seconds_left -= delta
	if _seconds_left > 0.0:
		return

	_authenticated = false
	_seconds_left = 0.0
	session_expired.emit()


func _on_login_result(payload: Dictionary) -> void:
	if not Protocol.as_bool(payload.get("success")):
		_authenticated = false
		_admin = {}
		authentication_failed.emit(
			Protocol.as_string(payload.get("reason_code"), "UNKNOWN"),
			Protocol.as_string(payload.get("detail")))
		return

	_authenticated = true
	_admin = Protocol.as_dict(payload.get("admin"))
	var expires_at := Protocol.as_string(payload.get("expires_at"))
	_seconds_left = maxf(0.0, _seconds_until(expires_at) - EXPIRY_MARGIN)
	authenticated.emit(_admin, expires_at)


## 서버가 만료를 알렸다. 남은 시간 계산과 무관하게 즉시 재인증을 요구한다.
func _on_rejected(payload: Dictionary) -> void:
	if Protocol.as_string(payload.get("reason_code")) != Protocol.SESSION_EXPIRED:
		return
	_authenticated = false
	_seconds_left = 0.0
	session_expired.emit()


## `expires_at` 은 서버 로컬 시각의 ISO 문자열이다. 시간대 정보가 없어 클라이언트
## 시계와 직접 비교하면 어긋난다. 그래서 절대 시각이 아니라 계약이 정한 2시간을
## 기준으로 삼고, 문자열은 화면 표시에만 쓴다.
func _seconds_until(_expires_at: String) -> float:
	return 2.0 * 60.0 * 60.0
