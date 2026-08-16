class_name RegisterFlow
extends RefCounted

## 계정 생성 왕복.
##
## 화면은 입력과 안내만 맡고 이 객체가 요청을 보내고 응답을 해석한다. 조립
## 지점(`boot.gd`)이 화면 전환만 맡게 하려는 분리다.
##
## 서버는 계정을 만들어도 로그인시키지 않는다. 그래서 성공하면 방금 정한 자격을
## 로그인 폼에 채워 둔다. 사용자가 같은 비밀번호를 다시 입력할 이유가 없다.

## 계정이 만들어졌다. 조립 지점이 로그인 화면으로 돌린다
signal completed

## `ActionSender` 가 응답을 기다릴 때 쓰는 표식
const LABEL := "register"

var _sender: ActionSender = null
var _screen: RegisterScreen = null
var _login: LoginScreen = null
## 응답을 기다리는 동안 들고 있는 자격. 응답이 오거나 실패하면 비운다
var _pending: Dictionary = {}


func bind(
	sender: ActionSender, screen: RegisterScreen, login: LoginScreen
) -> void:
	_sender = sender
	_screen = screen
	_login = login
	_screen.submitted.connect(_on_submitted)


func on_result(payload: Dictionary) -> void:
	var pending := _pending
	_pending = {}

	if not Protocol.as_bool(payload.get("success")):
		var code := Protocol.as_string(payload.get("reason_code"), "UNKNOWN")
		print("계정 생성 거절: %s" % code)
		_screen.show_rejection(code)
		return

	print("계정 생성 성공")
	completed.emit()
	_login.prefill(
		Protocol.as_string(pending.get("username")),
		Protocol.as_string(pending.get("password")),
		false)
	_login.show_message("ui.register.done")


## 응답이 오지 않았다. 화면을 되살리고 대기 자격을 버린다.
func on_timed_out(label: String) -> void:
	_pending = {}
	_screen.show_message("ui.notice.request_timeout", {"label": label})


func _on_submitted(
	username: String, password: String, email: String, locale: String
) -> void:
	var fields: Dictionary = {
		"username": username,
		"password": password,
		"preferred_locale": locale,
	}
	# 이메일은 선택 항목이다. 비었으면 필드 자체를 넣지 않는다
	if not email.is_empty():
		fields["email"] = email

	_pending = {"username": username, "password": password}

	if _sender.send_request(Protocol.REGISTER, fields, LABEL) == 0:
		_pending = {}
		_screen.show_message("ui.register.send_failed")
