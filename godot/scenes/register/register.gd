class_name RegisterScreen
extends VBoxContainer

## 회원가입 화면.
##
## 계정 생성은 게임 채널의 `register` 로 한다. 인증 전에 보낼 수 있고 성공해도
## 로그인되지 않으므로, 조립 지점이 이어서 `login` 을 보낸다.
##
## 검증 규칙은 서버의 `server/accounts.py` 와 같다. 여기서 걸러내는 것은 왕복을
## 줄이려는 것이고 판정은 서버가 한다. 서버가 어느 항목이 문제인지 알려주지
## 않으므로(`VALIDATION_FAILED` 하나뿐이다) 이 화면이 먼저 짚어 준다.
##
## 안내 문구는 키와 params 로 들고 있는다. locale 이 바뀌면 같은 안내를 다른
## 언어로 다시 그려야 한다.

signal submitted(username: String, password: String, email: String, locale: String)
signal cancelled

const MESSAGE_PREFIX := "ui.register."
const REJECTION_PREFIX := "ui.register.rejected."

## 서버와 같은 규칙. `accounts.py` 의 상수와 값을 맞춘다.
const USERNAME_MIN := 3
const USERNAME_MAX := 20
const PASSWORD_MIN := 8
## bcrypt 가 72바이트를 넘는 입력을 조용히 잘라낸다. 잘린 채 저장되면 뒷부분이
## 다른 비밀번호로도 인증에 성공한다
const PASSWORD_MAX_BYTES := 72
const EMAIL_MAX := 254

## 계약이 정의한 실패 사유
const KNOWN_REASONS: Array[String] = [
	"USERNAME_TAKEN", "VALIDATION_FAILED", "INTERNAL_ERROR",
]

@onready var _title: Label = %TitleLabel
@onready var _username_label: Label = %UsernameLabel
@onready var _password_label: Label = %PasswordLabel
@onready var _confirm_label: Label = %ConfirmLabel
@onready var _email_label: Label = %EmailLabel
@onready var _username: LineEdit = %UsernameEdit
@onready var _password: LineEdit = %PasswordEdit
@onready var _confirm: LineEdit = %ConfirmEdit
@onready var _email: LineEdit = %EmailEdit
@onready var _hint: Label = %HintLabel
@onready var _submit: Button = %SubmitButton
@onready var _cancel: Button = %CancelButton
@onready var _message: Label = %MessageLabel

var _translator: TranslatorService = null
var _message_key := ""
var _message_params: Dictionary = {}
## 계정에 저장할 언어. 조립 지점이 현재 locale 을 넣어 준다
var _locale := "en"


func _ready() -> void:
	_submit.pressed.connect(_on_submit_pressed)
	_cancel.pressed.connect(_on_cancel_pressed)
	_username.text_submitted.connect(_on_text_submitted)
	_password.text_submitted.connect(_on_text_submitted)
	_confirm.text_submitted.connect(_on_text_submitted)
	_email.text_submitted.connect(_on_text_submitted)


func bind(translator: TranslatorService) -> void:
	_translator = translator
	_translator.locale_changed.connect(_on_locale_changed)
	_locale = _translator.get_locale()
	apply_texts()


func apply_texts() -> void:
	if _translator == null:
		return
	_title.text = _translator.t("ui.register.title")
	_username_label.text = _translator.t("ui.login.username")
	_password_label.text = _translator.t("ui.login.password")
	_confirm_label.text = _translator.t("ui.register.confirm")
	_email_label.text = _translator.t("ui.register.email")
	_hint.text = _translator.t("ui.register.hint")
	_submit.text = _translator.t("ui.register.submit")
	_cancel.text = _translator.t("ui.register.cancel")
	_message.text = ("" if _message_key.is_empty()
		else _translator.t(_message_key, _message_params))


## 화면을 열 때마다 입력을 비운다. 비밀번호가 화면에 남지 않게 한다.
func reset() -> void:
	_username.text = ""
	_password.text = ""
	_confirm.text = ""
	_email.text = ""
	clear_message()
	set_busy(false)


func set_busy(busy: bool) -> void:
	_submit.disabled = busy
	_username.editable = not busy
	_password.editable = not busy
	_confirm.editable = not busy
	_email.editable = not busy
	if busy:
		_set_message("ui.register.sending")


func show_rejection(reason_code: String) -> void:
	set_busy(false)
	_password.text = ""
	_confirm.text = ""
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


func focus_first() -> void:
	_username.grab_focus()


## 서버와 같은 규칙으로 검증한다. 문제가 없으면 빈 문자열이다.
##
## Returns:
##   안내 문구 키. 첫 위반만 돌려준다
static func validation_key(
	username: String, password: String, confirm: String, email: String
) -> String:
	if username.is_empty() or password.is_empty():
		return MESSAGE_PREFIX + "need_required"
	if username.length() < USERNAME_MIN or username.length() > USERNAME_MAX:
		return MESSAGE_PREFIX + "username_length"
	for index: int in username.length():
		var code := username.unicode_at(index)
		var is_digit := code >= 48 and code <= 57
		var is_upper := code >= 65 and code <= 90
		var is_lower := code >= 97 and code <= 122
		var is_underscore := code == 95
		if not (is_digit or is_upper or is_lower or is_underscore):
			return MESSAGE_PREFIX + "username_charset"
	if password.length() < PASSWORD_MIN:
		return MESSAGE_PREFIX + "password_length"
	if password.to_utf8_buffer().size() > PASSWORD_MAX_BYTES:
		return MESSAGE_PREFIX + "password_bytes"
	if password != confirm:
		return MESSAGE_PREFIX + "password_mismatch"
	if not email.is_empty():
		if email.length() > EMAIL_MAX or not _is_email(email):
			return MESSAGE_PREFIX + "email_format"
	return ""


## 서버의 `EMAIL_PATTERN` 과 같은 규칙. 도달 가능성은 검증하지 않는다.
static func _is_email(email: String) -> bool:
	var pattern := RegEx.new()
	if pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$") != OK:
		return true
	return pattern.search(email) != null


func _set_message(key: String, params: Dictionary = {}) -> void:
	_message_key = key
	_message_params = params
	if _translator != null:
		_message.text = _translator.t(key, params)


func _on_locale_changed(locale: String) -> void:
	_locale = locale
	apply_texts()


func _on_text_submitted(_text: String) -> void:
	_on_submit_pressed()


func _on_submit_pressed() -> void:
	var username := _username.text.strip_edges()
	var password := _password.text
	var confirm := _confirm.text
	var email := _email.text.strip_edges()

	var failure := validation_key(username, password, confirm, email)
	if not failure.is_empty():
		_set_message(failure)
		return

	set_busy(true)
	submitted.emit(username, password, email, _locale)


func _on_cancel_pressed() -> void:
	cancelled.emit()
