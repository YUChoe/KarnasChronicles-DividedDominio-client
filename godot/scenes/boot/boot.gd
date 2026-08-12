extends Node

## 조립 지점이자 화면 전환의 뿌리.
##
## 연결, 디스패처, 액션 송신, 상태 저장소를 엮는다. 각 부품은 서로를 직접 찾지
## 않고 이곳에서 주입받는다. autoload 식별자를 직접 참조하는 곳은 여기뿐이다.

const LOGIN_SCENE := preload("res://scenes/login/login.tscn")
const MAIN_SCENE := preload("res://scenes/main/main.tscn")

const LABEL_LOGIN := "login"
const LABEL_LOGOUT := "logout"

## 로그인 성공 후 게임 화면을 열기 전에 기다리는 스냅샷
const REQUIRED_SNAPSHOTS: Array[String] = [
	Protocol.ROOM_INFO, Protocol.PLAYER_STATE, Protocol.INVENTORY,
]

const NOTICE_UNSUPPORTED := "This client is out of date. Please update to continue."
const NOTICE_CHANNEL := "Wrong channel: expected %s but the server reported %s. Check the connection settings."
const NOTICE_GATEWAY := "The gateway refused the connection: %s"
const NOTICE_ADMIN := "The admin panel arrives in Task 11."
const NOTICE_TIMEOUT := "The server did not answer the %s request."

@onready var _connection: Connection = $Connection
@onready var _action_sender: ActionSender = $ActionSender
@onready var _indicator: ConnectionIndicator = %ConnectionIndicator
@onready var _screens: Control = %Screens
@onready var _notice: Label = %Notice

var _config: ClientConfig = null
var _dispatcher: Dispatcher = null
var _store: GameStateStore = null
var _login: LoginScreen = null
var _main: MainScreen = null
## 로그인 후 도착한 스냅샷 종류
var _snapshots: Dictionary = {}


func _ready() -> void:
	_config = ClientConfig.load_or_create()
	_store = get_node("/root/GameState") as GameStateStore

	_dispatcher = Dispatcher.new()
	_dispatcher.state = _store

	_connection.set_dispatcher(_dispatcher)
	_connection.locale = _config.locale

	_action_sender.connection = _connection
	_action_sender.set_dispatcher(_dispatcher)

	_connection.state_changed.connect(_on_state_changed)
	_connection.protocol_unsupported.connect(_on_protocol_unsupported)
	_connection.channel_mismatch.connect(_on_channel_mismatch)
	_connection.closed.connect(_on_closed)

	_dispatcher.gateway_error.connect(_on_gateway_error)
	_dispatcher.login_result_received.connect(_on_login_result)
	_dispatcher.logout_result_received.connect(_on_logout_result)

	_action_sender.request_timed_out.connect(_on_request_timed_out)

	_store.resync_required.connect(_on_resync_required)
	_store.snapshot_received.connect(_on_snapshot_received)

	_indicator.bind(_connection)
	_indicator.reconnect_requested.connect(_on_reconnect_requested)

	_build_screens()
	_notice.text = ""
	_connection.open(_config.game_url())


## 순서가 중요하다. `@onready` 변수는 노드가 트리에 들어가 `_ready` 가 돌아야
## 채워진다. `add_child` 보다 먼저 설정 메서드를 부르면 null 접근이 된다.
func _build_screens() -> void:
	_login = LOGIN_SCENE.instantiate()
	_screens.add_child(_login)
	_login.set_landing_url(_config.landing_url)
	_login.submitted.connect(_on_login_submitted)

	_main = MAIN_SCENE.instantiate()
	_screens.add_child(_main)
	_main.bind(_store)
	_main.logout_requested.connect(_on_logout_requested)
	_main.admin_requested.connect(_on_admin_requested)

	var saved := CredentialStore.load_credentials()
	if not saved.is_empty():
		_login.prefill(
			Protocol.as_string(saved.get("username")),
			Protocol.as_string(saved.get("password")),
			_config.auto_login)

	_show_login()


func _show_login() -> void:
	_login.visible = true
	_main.visible = false
	_snapshots = {}


func _show_main() -> void:
	_login.visible = false
	_main.visible = true
	_notice.text = ""
	print("게임 화면 진입. 어드민 버튼 노출=%s" % str(
		Protocol.as_bool(_store.admin_channel.get("available"))))


func _on_state_changed(state: Connection.State) -> void:
	_store.set_connection_state(int(state), _connection.get_reconnect_attempt())
	print("연결 상태: %s" % Connection.State.keys()[int(state)])

	if state == Connection.State.READY:
		_login.set_connected(true)
		_maybe_auto_login()
		return

	if state == Connection.State.DISCONNECTED:
		# 응답이 올 수 없으므로 대기 중인 버튼을 되살린다
		_action_sender.clear_pending()
		# 서버 세션이 사라졌으므로 인증 상태도 버린다
		_store.reset_session()
		_login.set_connected(false)
		_show_login()


func _maybe_auto_login() -> void:
	if not _config.auto_login:
		_login.focus_first_empty()
		return
	var saved := CredentialStore.load_credentials()
	if saved.is_empty():
		return
	_on_login_submitted(
		Protocol.as_string(saved.get("username")),
		Protocol.as_string(saved.get("password")),
		true)


func _on_login_submitted(username: String, password: String, remember: bool) -> void:
	_login.set_busy(true)
	_config.auto_login = remember
	_config.save()

	if remember:
		CredentialStore.save_credentials(username, password)
	else:
		CredentialStore.clear()

	var seq := _action_sender.send_request(
		Protocol.LOGIN,
		{"username": username, "password": password},
		LABEL_LOGIN)
	if seq == 0:
		_login.show_notice("Could not send the sign-in request.")


func _on_login_result(payload: Dictionary) -> void:
	if not Protocol.as_bool(payload.get("success")):
		# 저장된 자격이 더 이상 맞지 않으므로 자동 로그인을 끈다
		CredentialStore.clear()
		_config.auto_login = false
		_config.save()
		var code := Protocol.as_string(payload.get("reason_code"), "UNKNOWN")
		print("로그인 거절: %s" % code)
		_login.show_rejection(code)
		return

	# 계약이 room_info, player_state, inventory 를 이어서 보낸다. 셋을 모두 받은
	# 뒤에 게임 화면을 연다.
	_snapshots = {}
	_login.set_busy(true)
	print("로그인 성공: %s" % Protocol.as_string(_store.player.get("username"), "?"))


func _on_snapshot_received(kind: String) -> void:
	if not _store.authenticated or _main.visible:
		return
	if not REQUIRED_SNAPSHOTS.has(kind):
		return

	_snapshots[kind] = true
	print("스냅샷 도착: %s" % kind)
	for required: String in REQUIRED_SNAPSHOTS:
		if not _snapshots.has(required):
			return
	_show_main()


func _on_logout_requested() -> void:
	_main.set_logout_busy(true)
	var seq := _action_sender.send_request(Protocol.LOGOUT, {}, LABEL_LOGOUT)
	if seq == 0:
		_main.set_logout_busy(false)


## 인증만 해제되고 연결은 유지된다. 다른 계정으로 다시 들어갈 수 있다.
func _on_logout_result(_payload: Dictionary) -> void:
	_main.set_logout_busy(false)
	_show_login()
	_login.show_notice("")
	_login.focus_first_empty()


func _on_admin_requested() -> void:
	_notice.text = NOTICE_ADMIN


func _on_request_timed_out(_seq: int, label: String) -> void:
	if label == LABEL_LOGIN:
		_login.show_notice(NOTICE_TIMEOUT % label)
	elif label == LABEL_LOGOUT:
		_main.set_logout_busy(false)
		_notice.text = NOTICE_TIMEOUT % label


func _on_protocol_unsupported(version: int) -> void:
	_notice.text = NOTICE_UNSUPPORTED
	push_warning("지원하지 않는 프로토콜 버전: %d" % version)


func _on_channel_mismatch(actual: String, expected: String) -> void:
	_notice.text = NOTICE_CHANNEL % [expected, actual]


func _on_gateway_error(reason: String) -> void:
	_notice.text = NOTICE_GATEWAY % reason


func _on_closed(code: int, reason: String) -> void:
	print("연결 종료 %d %s" % [code, reason])


## 엔티티 사본이 어긋났다. 방 전체를 다시 받는다.
func _on_resync_required(reason: String) -> void:
	push_warning("방 재동기화: %s" % reason)
	_action_sender.send_action("look")


func _on_reconnect_requested() -> void:
	_connection.open(_config.game_url())
