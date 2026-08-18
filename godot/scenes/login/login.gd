class_name LoginScreen
extends VBoxContainer

## 로그인 화면.
##
## 회원가입은 이 화면에서 시작한다. 계정 생성은 게임 채널의 `register` 이며
## 회원가입 화면이 맡는다. 여기서는 그 화면을 여는 신호만 낸다.
##
## 거절 사유 문구는 화면이 자체 보유한다. 서버가 `message.key` 를 함께 보내지만
## 실패 사유가 셋뿐이고 화면 맥락에 맞는 안내가 필요하다. 어드민 패널도 같은
## 방식이다(Task 11.1).
##
## 안내 문구는 키와 params 로 들고 있는다. locale 이 바뀌면 같은 안내를 다른
## 언어로 다시 그려야 한다.

signal submitted(username: String, password: String, remember: bool)
signal register_requested
## 언어 선택과 연결 상태가 설정 화면에 있다. 로그인 전에도 닿아야 한다
signal settings_requested

const REJECTION_PREFIX := "ui.login.rejected."
## 계약이 정의한 로그인 실패 사유. 사용자명 존재 여부를 구분해 알려주지 않는
## 것이 계정 열거 공격을 막는 조치이므로 문구도 구분하지 않는다.
const KNOWN_REASONS: Array[String] = [
	"INVALID_CREDENTIALS", "ALREADY_LOGGED_IN", "ACCOUNT_LOCKED",
]

@onready var _title: Label = %TitleLabel
@onready var _username_label: Label = %UsernameLabel
@onready var _password_label: Label = %PasswordLabel
@onready var _username: LineEdit = %UsernameEdit
@onready var _password: LineEdit = %PasswordEdit
@onready var _remember: CheckBox = %RememberCheck
@onready var _submit: Button = %SubmitButton
@onready var _message: Label = %MessageLabel
@onready var _register: Button = %RegisterButton
@onready var _settings: Button = %SettingsButton

var _translator: TranslatorService = null
var _message_key := ""
var _message_params: Dictionary = {}


func _ready() -> void:
	_submit.pressed.connect(_on_submit_pressed)
	_username.text_submitted.connect(_on_text_submitted)
	_password.text_submitted.connect(_on_text_submitted)
	_register.pressed.connect(_on_register_pressed)
	_settings.pressed.connect(func() -> void: settings_requested.emit())


func bind(translator: TranslatorService) -> void:
	_translator = translator
	_translator.locale_changed.connect(_on_locale_changed)
	apply_texts()


func apply_texts() -> void:
	if _translator == null:
		return
	_title.text = _translator.t("ui.login.title")
	_username_label.text = _translator.t("ui.login.username")
	_password_label.text = _translator.t("ui.login.password")
	_remember.text = _translator.t("ui.login.remember")
	_submit.text = _translator.t("ui.login.submit")
	_register.text = _translator.t("ui.login.register")
	_settings.text = _translator.t("ui.settings.title")
	_message.text = ("" if _message_key.is_empty()
		else _translator.t(_message_key, _message_params))


## 저장된 자격으로 폼을 채운다. 자동 로그인은 호출 측이 결정한다.
func prefill(username: String, password: String, remember: bool) -> void:
	_username.text = username
	_password.text = password
	_remember.button_pressed = remember


## 연결이 준비되지 않았으면 입력을 막는다.
func set_connected(connected: bool) -> void:
	_submit.disabled = not connected
	if not connected:
		_set_message("ui.login.not_connected")
	elif _message_key == "ui.login.not_connected":
		clear_message()


func set_busy(busy: bool) -> void:
	_submit.disabled = busy
	_username.editable = not busy
	_password.editable = not busy
	if busy:
		_set_message("ui.login.signing_in")


func show_rejection(reason_code: String) -> void:
	set_busy(false)
	_password.text = ""
	if KNOWN_REASONS.has(reason_code):
		_set_message(REJECTION_PREFIX + reason_code)
	else:
		_set_message(REJECTION_PREFIX + "unknown", {"reason_code": reason_code})


func show_message(key: String, params: Dictionary = {}) -> void:
	set_busy(false)
	_set_message(key, params)


func clear_message() -> void:
	_message_key = ""
	_message_params = {}
	_message.text = ""


func focus_first_empty() -> void:
	if _username.text.is_empty():
		_username.grab_focus()
	else:
		_password.grab_focus()


func _set_message(key: String, params: Dictionary = {}) -> void:
	_message_key = key
	_message_params = params
	if _translator != null:
		_message.text = _translator.t(key, params)


func _on_locale_changed(_locale: String) -> void:
	apply_texts()


func _on_text_submitted(_text: String) -> void:
	_on_submit_pressed()


func _on_submit_pressed() -> void:
	var username := _username.text.strip_edges()
	var password := _password.text
	if username.is_empty() or password.is_empty():
		_set_message("ui.login.need_both")
		return
	submitted.emit(username, password, _remember.button_pressed)


func _on_register_pressed() -> void:
	register_requested.emit()
