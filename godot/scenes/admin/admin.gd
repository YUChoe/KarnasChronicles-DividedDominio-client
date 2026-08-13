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
const STATS_TAB := 2
const PLAYER_TAB := 3

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
@onready var _stats_tab: Button = %StatsTab
@onready var _player_tab: Button = %PlayerTab
@onready var _map: AdminMapView = %MapView
@onready var _table: AdminResourceTable = %ResourceTable
@onready var _form: AdminCrudForm = %CrudForm
@onready var _stats: AdminStatsView = %StatsView
@onready var _player: AdminPlayerDetail = %PlayerDetail
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
	_stats_tab.pressed.connect(_on_tab_pressed.bind(STATS_TAB))
	_player_tab.pressed.connect(_on_tab_pressed.bind(PLAYER_TAB))


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
	_dispatcher.list_result.connect(_on_list_result)
	_dispatcher.get_result.connect(_player.show_row)
	_dispatcher.mutate_result.connect(_on_mutate_result)
	_dispatcher.stats_result.connect(_stats.show_stats)
	_dispatcher.action_result.connect(_stats.show_action_result)

	_map.bind(_translator)
	_map.refresh_requested.connect(_request_map)
	_table.bind(_translator)
	_table.query_requested.connect(_on_query_requested)
	_table.row_selected.connect(_on_row_selected)

	_form.bind(_translator)
	_form.create_requested.connect(_on_create_requested)
	_form.update_requested.connect(_on_update_requested)
	_form.delete_requested.connect(_on_delete_requested)

	_stats.bind(_translator)
	_stats.stats_requested.connect(_request_stats)
	_stats.action_requested.connect(_on_action_requested)

	_player.bind(_translator)
	_player.row_requested.connect(_on_player_row_requested)
	_player.inventory_requested.connect(_on_player_inventory_requested)

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
	_stats_tab.text = _translator.t("ui.admin.tab_stats")
	_player_tab.text = _translator.t("ui.admin.tab_player")
	_map.apply_texts()
	_table.apply_texts()
	_form.apply_texts()
	_stats.apply_texts()
	_player.apply_texts()
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
		for panel: Control in [_map, _table, _form, _stats, _player]:
			panel.visible = false
		_map.clear()
		_table.clear()
	_refresh_status()


func _on_tab_pressed(tab: int) -> void:
	if not _connection.is_authenticated():
		return

	_map_tab.button_pressed = tab == MAP_TAB
	_table_tab.button_pressed = tab == TABLE_TAB
	_stats_tab.button_pressed = tab == STATS_TAB
	_player_tab.button_pressed = tab == PLAYER_TAB

	_map.visible = tab == MAP_TAB
	_table.visible = tab == TABLE_TAB
	# 편집 폼은 표와 함께 보인다. 표에서 고른 행을 채우기 때문이다
	_form.visible = tab == TABLE_TAB
	_stats.visible = tab == STATS_TAB
	_player.visible = tab == PLAYER_TAB

	match tab:
		MAP_TAB:
			_request_map()
		TABLE_TAB:
			_form.set_resource(_table.current_resource())
			_table.request_first_page()
		STATS_TAB:
			_request_stats()
		PLAYER_TAB:
			var player_id := _player.current_player()
			if not player_id.is_empty():
				_player.load_player(player_id)


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


func _request_stats() -> void:
	_connection.send_authenticated({"type": Protocol.ADMIN_STATS})


## 표 응답은 어느 리소스를 물었는지에 따라 갈린다. 플레이어 인벤토리 조회도
## `objects` 목록으로 오므로 그 화면이 보일 때만 그쪽으로 넘긴다.
func _on_list_result(payload: Dictionary) -> void:
	if _player.visible and Protocol.as_string(
			payload.get("resource")) == AdminPlayerDetail.RESOURCE_OBJECTS:
		_player.show_inventory(payload)
		return
	_table.show_result(payload)


func _on_row_selected(resource: String, row: Dictionary) -> void:
	_form.show_row(resource, row)
	# 플레이어 행을 고르면 상세 화면이 바로 쓸 수 있게 id 만 넘긴다
	if resource == AdminPlayerDetail.RESOURCE_PLAYERS:
		_player.set_player(Protocol.as_string(row.get("id")))


func _on_create_requested(resource: String, values: Dictionary) -> void:
	_connection.send_authenticated({
		"type": Protocol.ADMIN_CREATE,
		"resource": resource,
		"values": values,
	})


func _on_update_requested(
	resource: String, key: Dictionary, values: Dictionary
) -> void:
	_connection.send_authenticated({
		"type": Protocol.ADMIN_UPDATE,
		"resource": resource,
		"key": key,
		"values": values,
	})


func _on_delete_requested(resource: String, key: Dictionary) -> void:
	_connection.send_authenticated({
		"type": Protocol.ADMIN_DELETE,
		"resource": resource,
		"key": key,
	})


## 생성·수정·삭제가 응답 타입을 공유한다. `row` 가 없으면 삭제다.
func _on_mutate_result(payload: Dictionary) -> void:
	if payload.has("row"):
		_form.show_saved()
	else:
		_form.show_deleted()
	_table.request_first_page()


func _on_action_requested(action: String, params: Dictionary) -> void:
	var payload: Dictionary = {
		"type": Protocol.ADMIN_ACTION,
		"action": action,
	}
	if not params.is_empty():
		payload["params"] = params
	_connection.send_authenticated(payload)


func _on_player_row_requested(player_id: String) -> void:
	_connection.send_authenticated({
		"type": Protocol.ADMIN_GET,
		"resource": AdminPlayerDetail.RESOURCE_PLAYERS,
		"key": {"id": player_id},
	})


func _on_player_inventory_requested(player_id: String) -> void:
	_connection.send_authenticated({
		"type": Protocol.ADMIN_LIST,
		"resource": AdminPlayerDetail.RESOURCE_OBJECTS,
		"page": 1,
		"page_size": AdminResourceTable.PAGE_SIZE,
		"filter": AdminPlayerDetail.inventory_filter(player_id),
	})


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
	if Protocol.as_string(payload.get("reason_code")) == Protocol.REFERENCED:
		_form.show_references(Protocol.as_array(payload.get("references")))
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
