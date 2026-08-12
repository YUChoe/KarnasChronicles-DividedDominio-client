class_name LoginScreen
extends VBoxContainer

## 로그인 화면.
##
## 회원가입 경로를 제공하지 않는다. 계정 생성은 랜딩 사이트가 서버의 계정 생성
## 경로를 호출해 처리하며 이 화면은 링크만 보여준다.
##
## 거절 사유 문구는 자체 보유한다. 서버가 `message.key` 를 함께 보내지만 실패
## 사유가 셋뿐이고 화면 맥락에 맞는 안내가 필요하다. Task 2.3 에서 Translator 를
## 거치게 한다.

signal submitted(username: String, password: String, remember: bool)

## 계약이 정의한 로그인 실패 사유. 사용자명 존재 여부를 구분해 알려주지 않는
## 것이 계정 열거 공격을 막는 조치이므로 문구도 구분하지 않는다.
const REASON_TEXT := {
	"INVALID_CREDENTIALS": "The username or password is incorrect.",
	"ALREADY_LOGGED_IN": "That account is already signed in elsewhere.",
	"ACCOUNT_LOCKED": "That account is locked. Please contact an administrator.",
}
const REASON_FALLBACK := "Sign-in failed (%s)."
const TEXT_WAITING := "Signing in…"
const TEXT_DISCONNECTED := "Not connected to the server."

@onready var _username: LineEdit = %UsernameEdit
@onready var _password: LineEdit = %PasswordEdit
@onready var _remember: CheckBox = %RememberCheck
@onready var _submit: Button = %SubmitButton
@onready var _message: Label = %MessageLabel
@onready var _landing: LinkButton = %LandingLink


func _ready() -> void:
	_submit.pressed.connect(_on_submit_pressed)
	_username.text_submitted.connect(_on_text_submitted)
	_password.text_submitted.connect(_on_text_submitted)
	_landing.pressed.connect(_on_landing_pressed)
	_message.text = ""


func set_landing_url(url: String) -> void:
	_landing.uri = url


## 저장된 자격으로 폼을 채운다. 자동 로그인은 호출 측이 결정한다.
func prefill(username: String, password: String, remember: bool) -> void:
	_username.text = username
	_password.text = password
	_remember.button_pressed = remember


## 연결이 준비되지 않았으면 입력을 막는다.
func set_connected(connected: bool) -> void:
	_submit.disabled = not connected
	if not connected:
		_message.text = TEXT_DISCONNECTED
	elif _message.text == TEXT_DISCONNECTED:
		_message.text = ""


func set_busy(busy: bool) -> void:
	_submit.disabled = busy
	_username.editable = not busy
	_password.editable = not busy
	if busy:
		_message.text = TEXT_WAITING


func show_rejection(reason_code: String) -> void:
	set_busy(false)
	_password.text = ""
	_message.text = REASON_TEXT.get(reason_code, REASON_FALLBACK % reason_code)


func show_notice(text: String) -> void:
	set_busy(false)
	_message.text = text


func focus_first_empty() -> void:
	if _username.text.is_empty():
		_username.grab_focus()
	else:
		_password.grab_focus()


func _on_text_submitted(_text: String) -> void:
	_on_submit_pressed()


func _on_submit_pressed() -> void:
	var username := _username.text.strip_edges()
	var password := _password.text
	if username.is_empty() or password.is_empty():
		_message.text = "Enter both a username and a password."
		return
	submitted.emit(username, password, _remember.button_pressed)


func _on_landing_pressed() -> void:
	if _landing.uri.is_empty():
		return
	var status := OS.shell_open(_landing.uri)
	if status != OK:
		push_warning("랜딩 사이트를 열 수 없습니다: %s (%d)" % [_landing.uri, status])
