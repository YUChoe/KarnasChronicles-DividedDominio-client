class_name MainScreen
extends VBoxContainer

## 게임 화면.
##
## 지금은 로그인 이후 상태를 확인하고 로그아웃과 어드민 진입을 제공하는 최소
## 구성이다. 방 표시, 출구 버튼, 엔티티 버튼, 미니맵은 Task 5 가 채운다.

signal logout_requested()
signal admin_requested()

@onready var _summary: Label = %SummaryLabel
@onready var _position: Label = %PositionLabel
@onready var _logout: Button = %LogoutButton
@onready var _admin: Button = %AdminButton
@onready var _placeholder: Label = %PlaceholderLabel

var _state: GameStateStore = null
var _translator: TranslatorService = null


func _ready() -> void:
	_logout.pressed.connect(func() -> void: logout_requested.emit())
	_admin.pressed.connect(func() -> void: admin_requested.emit())


func bind(state: GameStateStore, translator: TranslatorService) -> void:
	_state = state
	_translator = translator

	_state.player_changed.connect(_refresh)
	_state.room_changed.connect(_refresh)
	_translator.locale_changed.connect(_on_locale_changed)

	apply_texts()
	_refresh()


func apply_texts() -> void:
	if _translator == null:
		return
	_logout.text = _translator.t("ui.main.sign_out")
	_admin.text = _translator.t("ui.main.admin_panel")
	_placeholder.text = _translator.t("ui.main.placeholder")


func set_logout_busy(busy: bool) -> void:
	_logout.disabled = busy


func _refresh() -> void:
	if _state == null or _translator == null:
		return

	var display_name := Protocol.as_string(_state.player.get("display_name"), "?")
	var username := Protocol.as_string(_state.player.get("username"), "?")
	_summary.text = "%s (%s)" % [display_name, username]

	if _state.room.is_empty():
		_position.text = ""
	else:
		_position.text = _translator.t("ui.main.position", {
			"terrain": Protocol.as_string(_state.room.get("room_type"), "?"),
			"x": Protocol.as_int(_state.room.get("x")),
			"y": Protocol.as_int(_state.room.get("y")),
			"time_of_day": _state.time_of_day,
		})

	# 권한만으로는 진입 가능 여부를 알 수 없다. 어드민 포트를 열지 않은 배포가
	# 있으므로 서버가 알려준 `available` 이 참일 때만 노출한다.
	_admin.visible = Protocol.as_bool(_state.admin_channel.get("available"))


func _on_locale_changed(_locale: String) -> void:
	apply_texts()
	_refresh()
