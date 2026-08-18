class_name SettingsScreen
extends VBoxContainer

## 설정 화면.
##
## 게임 진행과 무관한 것들을 모은다. 연결 상태, 언어, 로그아웃, 어드민 패널,
## 종료다. 예전에는 앞의 둘이 화면 최상단 줄에, 뒤의 둘이 탐험 화면 헤더에
## 있었다. 늘 보이지만 거의 쓰지 않는 것들이라 자리만 차지했다.
##
## 연결 상태와 언어 선택은 공용 컴포넌트를 그대로 담는다. 조립 지점이 여전히
## 그것들을 `bind` 하고 신호를 받는다. 이 화면은 자리만 제공한다.

signal closed
signal logout_requested
signal admin_requested
signal quit_requested

@onready var _title: Label = %TitleLabel
@onready var _indicator: ConnectionIndicator = %ConnectionIndicator
@onready var _locale: LocaleSelector = %LocaleSelector
@onready var _logout: Button = %LogoutButton
@onready var _admin: Button = %AdminButton
@onready var _quit: Button = %QuitButton
@onready var _close: Button = %CloseButton

var _translator: TranslatorService = null


func _ready() -> void:
	_logout.pressed.connect(func() -> void: logout_requested.emit())
	_admin.pressed.connect(func() -> void: admin_requested.emit())
	_quit.pressed.connect(func() -> void: quit_requested.emit())
	_close.pressed.connect(func() -> void: closed.emit())

	# 브라우저는 스크립트가 창을 닫는 것을 막는다. 눌러도 아무 일이 없는 버튼을
	# 두지 않는다
	_quit.visible = not OS.has_feature("web")


func bind(translator: TranslatorService) -> void:
	_translator = translator
	_translator.locale_changed.connect(_on_locale_changed)
	apply_texts()


func apply_texts() -> void:
	if _translator == null:
		return
	_title.text = _translator.t("ui.settings.title")
	_logout.text = _translator.t("ui.main.sign_out")
	_admin.text = _translator.t("ui.main.admin_panel")
	_quit.text = _translator.t("ui.settings.quit")
	_close.text = _translator.t("ui.settings.close")


## 조립 지점이 공용 컴포넌트를 배선하려면 노드가 필요하다.
func connection_indicator() -> ConnectionIndicator:
	return _indicator


func locale_selector() -> LocaleSelector:
	return _locale


## 어드민 계정만 패널에 들어갈 수 있다. 서버가 `login_result` 로 알려준다.
func set_admin_available(available: bool) -> void:
	_admin.visible = available


## 로그인 전에는 로그아웃할 것이 없다. 언어와 연결 상태만 남긴다.
func set_logout_available(available: bool) -> void:
	_logout.visible = available


func set_logout_busy(busy: bool) -> void:
	_logout.disabled = busy


func _on_locale_changed(_locale_name: String) -> void:
	apply_texts()
