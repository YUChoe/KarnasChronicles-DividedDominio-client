class_name LoginFlow
extends RefCounted

## 로그인 왕복과 자격 보관.
##
## 화면은 입력과 안내만 맡고 이 객체가 요청을 보내고 응답을 해석한다.
## `RegisterFlow` 와 같은 구조다. 조립 지점(`boot.gd`)이 화면 전환만 맡게 하려는
## 분리다.
##
## 저장된 자격으로 자동 로그인하는 것도 여기서 한다. 거절되면 저장을 버린다.
## 맞지 않는 자격으로 매번 다시 시도하면 실패 상한에 걸린다.

## 인증이 받아들여졌다. 조립 지점이 스냅샷을 기다린다
signal accepted

## `ActionSender` 가 응답을 기다릴 때 쓰는 표식
const LABEL := "login"

var _sender: ActionSender = null
var _screen: LoginScreen = null
var _config: ClientConfig = null


func bind(
	sender: ActionSender, screen: LoginScreen, config: ClientConfig
) -> void:
	_sender = sender
	_screen = screen
	_config = config
	_screen.submitted.connect(submit)


## 저장된 자격을 폼에 채운다. 자동 로그인 여부는 설정이 정한다.
func prefill() -> void:
	var saved := CredentialStore.load_credentials()
	if saved.is_empty():
		return

	_screen.prefill(
		Protocol.as_string(saved.get("username")),
		Protocol.as_string(saved.get("password")),
		_config.auto_login)


## 연결이 준비되면 부른다. 자동 로그인이 꺼져 있으면 입력을 기다린다.
func try_auto_login() -> void:
	if not _config.auto_login:
		_screen.focus_first_empty()
		return

	var saved := CredentialStore.load_credentials()
	if saved.is_empty():
		return

	submit(
		Protocol.as_string(saved.get("username")),
		Protocol.as_string(saved.get("password")),
		true)


func submit(username: String, password: String, remember: bool) -> void:
	_screen.set_busy(true)
	_config.auto_login = remember
	_config.save()

	if remember:
		CredentialStore.save_credentials(username, password)
	else:
		CredentialStore.clear()

	var seq := _sender.send_request(
		Protocol.LOGIN,
		{"username": username, "password": password},
		LABEL)
	if seq == 0:
		_screen.show_message("ui.login.send_failed")


func on_result(payload: Dictionary) -> void:
	if not Protocol.as_bool(payload.get("success")):
		# 저장된 자격이 더 이상 맞지 않으므로 자동 로그인을 끈다
		CredentialStore.clear()
		_config.auto_login = false
		_config.save()
		var code := Protocol.as_string(payload.get("reason_code"), "UNKNOWN")
		print("로그인 거절: %s" % code)
		_screen.show_rejection(code)
		return

	# 계약이 room_info, player_state, inventory 를 이어서 보낸다. 셋을 모두 받을
	# 때까지 화면을 붙잡아 둔다
	_screen.set_busy(true)
	accepted.emit()


## 응답이 오지 않았다. 화면에 안내를 남긴다.
func on_timed_out(label: String) -> void:
	_screen.show_message("ui.notice.request_timeout", {"label": label})
