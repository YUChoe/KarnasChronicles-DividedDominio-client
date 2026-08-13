class_name AdminScreen
extends VBoxContainer

## 어드민 패널.
##
## 게임 연결과 독립된 어드민 채널로 별도 접속하고 별도 인증한다. 게임 로그인
## 상태가 어드민 권한을 부여하지 않는다.
##
## 이 화면이 어드민 연결과 디스패처를 소유한다. 게임 조립 지점은 화면 전환만
## 담당하고 어드민 통신에 관여하지 않는다.

signal closed()
signal notice_requested(key: String, params: Dictionary)

const MAP_TAB := 0
const TABLE_TAB := 1

@onready var _title: Label = %AdminTitle
@onready var _status: Label = %AdminStatus
@onready var _close: Button = %AdminClose
@onready var _login_row: HBoxContainer = %AdminLoginRow
@onready var _username: LineEdit = %AdminUsername
@onready var _password: LineEdit = %AdminPassword
@onready var _login: Button = %AdminLogin
@onready var _tabs: HBoxContainer = %AdminTabs
@onready var _map_tab: Button = %MapTab
@onready var _table_tab: Button = %TableTab
@onready var _map: AdminMapView = %MapView
@onready var _table: AdminResourceTable = %ResourceTable
@onready var _notice: Label = %AdminNotice

var _translator: TranslatorService = null
var _config: ClientConfig = null
var _connection: AdminConnection = null
var _dispatcher: AdminDispatcher = null


func _ready() -> void:
	_close.pressed.connect(func() -> void: closed.emit())
	_login.pressed.connect(_on_login_pressed)
	_password.text_submitted.connect(func(_t: String) -> void: _on_login_pressed())
	_map_tab.pressed.connect(_on_tab_pressed.bind(MAP_TAB))
	_table_tab.pressed.connect(_on_tab_pressed.bind(TABLE_TAB))


## 어드민 연결은 이 화면이 만든다. 노드로 붙여야 `_process` 가 돈다.
func bind(translator: TranslatorService, config: ClientConfig) -> void:
	_translator = translator
	_config = config
	_translator.locale_changed.connect(_on_locale_changed)

	_dispatcher = AdminDispatcher.new()
	_connection = AdminConnection.new()
	_connection.name = "AdminConnection"
	add_child(_connection)
	_connection.bind_admin_dispatcher(_dispatcher)

	_connection.state_changed.connect(_on_state_changed)
	_connection.authenticated.connect(_on_authenticated)
	_connection.authentication_failed.connect(_on_authentication_failed)
	_connection.session_expired.connect(_on_session_expired)
	_connection.channel_mismatch.connect(_on_channel_mismatch)

	_dispatcher.rejected.connect(_on_rejected)
	_dispatcher.map_result.connect(_map.show_map)
	_dispatcher.list_result.connect(_table.show_result)

	_map.bind(_translator)
	_map.refresh_requested.connect(_request_map)
	_table.bind(_translator)
	_table.query_requested.connect(_on_query_requested)

	apply_texts()
	_apply_auth_state()
	_on_tab_pressed(MAP_TAB)


func apply_texts() -> void:
	if _translator == null:
		return
	_title.text = _translator.t("ui.admin.title")
	_close.text = _translator.t("ui.admin.close")
	_login.text = _translator.t("ui.admin.login")
	_username.placeholder_text = _translator.t("ui.admin.username")
	_password.placeholder_text = _translator.t("ui.admin.password")
	_map_tab.text = _translator.t("ui.admin.tab_map")
	_table_tab.text = _translator.t("ui.admin.tab_table")
	_map.apply_texts()
	_table.apply_texts()
	_refresh_status()


## 화면에 들어올 때 접속한다. 게임 연결과 독립적이다.
func on_opened() -> void:
	_notice.text = ""
	if _connection.get_state() == Connection.State.DISCONNECTED:
		_connection.open(_config.admin_url())


func _refresh_status() -> void:
	if _translator == null or _connection == null:
		return

	if _connection.is_authenticated():
		var admin := _connection.get_admin()
		var name := Protocol.as_string(admin.get("display_name"))
		if name.is_empty():
			name = Protocol.as_string(admin.get("username"), "?")
		_status.text = _translator.t("ui.admin.signed_in", {"name": name})
		return

	match _connection.get_state():
		Connection.State.READY:
			_status.text = _translator.t("ui.admin.connected")
		Connection.State.DISCONNECTED:
			_status.text = _translator.t("ui.admin.disconnected")
		_:
			_status.text = _translator.t("ui.admin.connecting")


## 인증 전에는 로그인 줄만, 인증 후에는 탭과 내용만 보인다.
func _apply_auth_state() -> void:
	var signed_in := _connection.is_authenticated()
	_login_row.visible = not signed_in
	_tabs.visible = signed_in
	if not signed_in:
		_map.visible = false
		_table.visible = false
		_map.clear()
		_table.clear()
	_refresh_status()


func _on_tab_pressed(tab: int) -> void:
	if not _connection.is_authenticated():
		return

	_map_tab.button_pressed = tab == MAP_TAB
	_table_tab.button_pressed = tab == TABLE_TAB
	_map.visible = tab == MAP_TAB
	_table.visible = tab == TABLE_TAB

	if tab == MAP_TAB:
		_request_map()
	else:
		_table.request_first_page()


func _request_map() -> void:
	# 설명은 담지 않는다. 방 520개 기준으로 응답이 라인 상한에 육박한다
	_connection.send_authenticated({
		"type": Protocol.ADMIN_MAP,
		"include_descriptions": false,
	})


func _on_query_requested(
	resource: String, page: int, filter: Dictionary, sort: Dictionary
) -> void:
	var payload: Dictionary = {
		"type": Protocol.ADMIN_LIST,
		"resource": resource,
		"page": page,
		"page_size": AdminResourceTable.PAGE_SIZE,
	}
	if not filter.is_empty():
		payload["filter"] = filter
	if not sort.is_empty():
		payload["sort"] = sort
	_connection.send_authenticated(payload)


func _on_login_pressed() -> void:
	var username := _username.text.strip_edges()
	var password := _password.text
	if username.is_empty() or password.is_empty():
		return
	_notice.text = ""
	_password.text = ""
	_connection.login(username, password)


func _on_state_changed(_state: Connection.State) -> void:
	_apply_auth_state()


func _on_authenticated(_admin: Dictionary, expires_at: String) -> void:
	_apply_auth_state()
	_notice.text = ("" if expires_at.is_empty()
		else _translator.t("ui.admin.session_expires", {"expires_at": expires_at}))
	_on_tab_pressed(MAP_TAB)


func _on_authentication_failed(reason_code: String, detail: String) -> void:
	_apply_auth_state()
	_show_rejection(reason_code, detail)


func _on_session_expired() -> void:
	_apply_auth_state()
	_notice.text = _translator.t("ui.admin.session_expired")


func _on_channel_mismatch(actual: String, expected: String) -> void:
	_notice.text = _translator.t("ui.notice.channel_mismatch",
		{"expected": expected, "actual": actual})


func _on_rejected(payload: Dictionary) -> void:
	_show_rejection(
		Protocol.as_string(payload.get("reason_code"), "UNKNOWN"),
		Protocol.as_string(payload.get("detail")))


## 거절 문구는 클라이언트가 자체 보유한다. `detail` 은 개발자용 영문이므로
## 안내 뒤에 덧붙인다.
func _show_rejection(reason_code: String, detail: String) -> void:
	var text := _translator.t(AdminCodes.notice_key(reason_code),
		{"reason_code": reason_code})
	if not detail.is_empty():
		text += "  " + _translator.t("ui.admin.detail", {"detail": detail})
	_notice.text = text


func _on_locale_changed(_locale: String) -> void:
	apply_texts()
