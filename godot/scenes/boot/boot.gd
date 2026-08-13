extends Node

## 조립 지점이자 화면 전환의 뿌리.
##
## 연결, 디스패처, 액션 송신, 상태 저장소를 엮는다. 각 부품은 서로를 직접 찾지
## 않고 이곳에서 주입받는다. autoload 식별자를 직접 참조하는 곳은 여기뿐이다.

const LOGIN_SCENE := preload("res://scenes/login/login.tscn")
const MAIN_SCENE := preload("res://scenes/main/main.tscn")
const INVENTORY_SCENE := preload("res://scenes/inventory/inventory.tscn")
const COMBAT_SCENE := preload("res://scenes/combat/combat.tscn")
const DIALOGUE_SCENE := preload("res://scenes/dialogue/dialogue.tscn")
const SHOP_SCENE := preload("res://scenes/shop/shop.tscn")

const LABEL_LOGIN := "login"
const LABEL_LOGOUT := "logout"

## 로그인 성공 후 게임 화면을 열기 전에 기다리는 스냅샷
const REQUIRED_SNAPSHOTS: Array[String] = [
	Protocol.ROOM_INFO, Protocol.PLAYER_STATE, Protocol.INVENTORY,
]


@onready var _connection: Connection = $Connection
@onready var _action_sender: ActionSender = $ActionSender
@onready var _indicator: ConnectionIndicator = %ConnectionIndicator
@onready var _locale_selector: LocaleSelector = %LocaleSelector
@onready var _screens: Control = %Screens
@onready var _notice: Label = %Notice

var _config: ClientConfig = null
var _dispatcher: Dispatcher = null
var _store: GameStateStore = null
var _translator: TranslatorService = null
var _login: LoginScreen = null
var _main: MainScreen = null
var _inventory: InventoryScreen = null
var _combat: CombatScreen = null
var _dialogue: DialogueScreen = null
var _shop: ShopScreen = null
## 로그인 후 도착한 스냅샷 종류
var _snapshots: Dictionary = {}
## 안내 문구를 키로 들고 있는다. locale 이 바뀌면 다시 그려야 한다
var _notice_key := ""
var _notice_params: Dictionary = {}


func _ready() -> void:
	_config = ClientConfig.load_or_create()
	_store = get_node("/root/GameState") as GameStateStore
	_translator = get_node("/root/Translator") as TranslatorService
	_translator.set_locale(_config.locale)
	_translator.locale_changed.connect(_on_locale_changed)

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
	_dispatcher.action_rejected.connect(_on_action_rejected)
	_dispatcher.login_result_received.connect(_on_login_result)
	_dispatcher.logout_result_received.connect(_on_logout_result)

	_action_sender.request_timed_out.connect(_on_request_timed_out)

	_store.resync_required.connect(_on_resync_required)
	_store.snapshot_received.connect(_on_snapshot_received)

	_indicator.bind(_connection, _translator)
	_indicator.reconnect_requested.connect(_on_reconnect_requested)

	_locale_selector.bind(_translator)
	_locale_selector.locale_selected.connect(_on_locale_selected)

	_build_screens()
	_clear_notice()
	_connection.open(_config.game_url())


## 순서가 중요하다. `@onready` 변수는 노드가 트리에 들어가 `_ready` 가 돌아야
## 채워진다. `add_child` 보다 먼저 설정 메서드를 부르면 null 접근이 된다.
func _build_screens() -> void:
	_login = LOGIN_SCENE.instantiate()
	_screens.add_child(_login)
	_login.bind(_translator)
	_login.set_landing_url(_config.landing_url)
	_login.submitted.connect(_on_login_submitted)

	_main = MAIN_SCENE.instantiate()
	_screens.add_child(_main)
	_main.bind(_store, _translator, _action_sender)
	_main.logout_requested.connect(_on_logout_requested)
	_main.admin_requested.connect(_on_admin_requested)
	_main.notice_requested.connect(_set_notice)
	_main.inventory_requested.connect(_show_inventory)

	_inventory = INVENTORY_SCENE.instantiate()
	_screens.add_child(_inventory)
	_inventory.bind(_store, _translator)
	_inventory.closed.connect(_show_main)
	_inventory.action_requested.connect(_on_screen_action)
	_inventory.notice_requested.connect(_set_notice)

	_combat = COMBAT_SCENE.instantiate()
	_screens.add_child(_combat)
	_combat.bind(_store, _translator)
	_combat.action_requested.connect(_on_screen_action)
	_combat.notice_requested.connect(_set_notice)

	_dialogue = DIALOGUE_SCENE.instantiate()
	_screens.add_child(_dialogue)
	_dialogue.bind(_store, _translator)
	_dialogue.action_requested.connect(_on_screen_action)

	_shop = SHOP_SCENE.instantiate()
	_screens.add_child(_shop)
	_shop.bind(_store, _translator)
	_shop.action_requested.connect(_on_screen_action)
	_shop.closed.connect(_show_main)

	_store.container_contents_received.connect(_on_container_contents)
	_store.combat_changed.connect(_on_combat_changed)
	_store.dialogue_changed.connect(_on_dialogue_changed)
	_store.shop_changed.connect(_on_shop_changed)

	var saved := CredentialStore.load_credentials()
	if not saved.is_empty():
		_login.prefill(
			Protocol.as_string(saved.get("username")),
			Protocol.as_string(saved.get("password")),
			_config.auto_login)

	_show_login()


func _show_login() -> void:
	_show_only(_login)
	_snapshots = {}


func _show_main() -> void:
	_show_only(_main)
	_clear_notice()
	print("게임 화면 진입. 어드민 버튼 노출=%s" % str(
		Protocol.as_bool(_store.admin_channel.get("available"))))


func _show_inventory() -> void:
	_show_only(_inventory)
	_clear_notice()
	_inventory.on_opened()


func _show_combat() -> void:
	_show_only(_combat)
	_clear_notice()


func _show_only(screen: Control) -> void:
	for candidate: Control in [
			_login, _main, _inventory, _combat, _dialogue, _shop]:
		candidate.visible = candidate == screen


## 대화가 시작되면 대화 화면으로, 끝나면 탐험 화면으로 돌아간다.
## `is_active` 가 거짓이면 상태 저장소가 비우므로 비었는지로 판단한다.
func _on_dialogue_changed() -> void:
	if _store.dialogue.is_empty():
		if _dialogue.visible:
			_show_main()
		return
	if not _dialogue.visible:
		_show_only(_dialogue)
		_clear_notice()


## 상점 목록이 오면 상점 화면을 연다.
func _on_shop_changed() -> void:
	if _store.shop.is_empty() or _shop.visible:
		return
	_shop.clear_notice()
	_show_only(_shop)
	_clear_notice()


## 전투가 시작되면 전투 화면으로, 끝나면 탐험 화면으로 돌아간다.
func _on_combat_changed() -> void:
	if _store.combat.is_empty():
		return
	if Protocol.as_bool(_store.combat.get("is_over")):
		if _combat.visible:
			_show_main()
		return
	if not _combat.visible:
		_show_combat()


## 화면이 요청한 액션을 보낸다. 화면이 네트워크 계층을 알지 않게 한다.
func _on_screen_action(verb: String, target_id: String, params: Dictionary) -> void:
	_action_sender.send_action(verb, target_id, params)


## 컨테이너를 열면 내용이 인벤토리 화면에 있으므로 그리로 넘긴다.
func _on_container_contents(_container_id: String, _items: Array) -> void:
	if not _inventory.visible:
		_show_inventory()


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
		_login.show_message("ui.login.send_failed")


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
	_login.clear_message()
	_login.focus_first_empty()


## 거절 처리는 `RejectionPolicy` 가 정하고 실행만 여기서 한다.
##
## 낙관적 버튼 구성이므로 `NOT_APPLICABLE` 은 정상 동작이다. 오류로 표시하지
## 않는다. 버튼 제거는 대상을 아는 화면의 몫이라 Task 5·6 에서 채운다.
func _on_action_rejected(payload: Dictionary) -> void:
	var code := Protocol.as_string(payload.get("reason_code"), "UNKNOWN")
	var verb := Protocol.as_string(payload.get("verb"))
	var effect := RejectionPolicy.effect_for(code)

	match effect:
		RejectionPolicy.Effect.RESYNC_ROOM:
			_action_sender.send_action("look")
		RejectionPolicy.Effect.RETURN_TO_LOGIN:
			# 연결은 살아 있고 서버 세션만 사라졌다
			_store.reset_session()
			_show_login()
			_login.show_message("ui.login.session_expired")
		RejectionPolicy.Effect.SHOW_SHORTFALL:
			_shop.on_insufficient_funds()
		RejectionPolicy.Effect.LOG_CLIENT_BUG:
			push_warning("클라이언트 버그: %s 가 %s 로 거절됐습니다" % [verb, code])
		RejectionPolicy.Effect.REMOVE_BUTTON:
			_main.on_not_applicable(verb, Protocol.as_string(payload.get("target")))
		_:
			var key := RejectionPolicy.notice_key(code)
			if not key.is_empty():
				_set_notice(key, {"reason_code": code})


func _on_admin_requested() -> void:
	_set_notice("ui.notice.admin_pending")


func _on_request_timed_out(_seq: int, label: String) -> void:
	if label == LABEL_LOGIN:
		_login.show_message("ui.notice.request_timeout", {"label": label})
	elif label == LABEL_LOGOUT:
		_main.set_logout_busy(false)
		_set_notice("ui.notice.request_timeout", {"label": label})


func _on_protocol_unsupported(version: int) -> void:
	_set_notice("ui.notice.protocol_unsupported")
	push_warning("지원하지 않는 프로토콜 버전: %d" % version)


func _on_channel_mismatch(actual: String, expected: String) -> void:
	_set_notice("ui.notice.channel_mismatch",
		{"expected": expected, "actual": actual})


func _on_gateway_error(reason: String) -> void:
	_set_notice("ui.notice.gateway_error", {"reason": reason})


## locale 선택을 설정에 저장한다. 재접속을 요구하지 않는다.
func _on_locale_selected(locale: String) -> void:
	if not _translator.set_locale(locale):
		return
	_config.locale = locale
	_config.save()


func _on_locale_changed(_locale: String) -> void:
	_render_notice()


func _set_notice(key: String, params: Dictionary = {}) -> void:
	_notice_key = key
	_notice_params = params
	_render_notice()


func _clear_notice() -> void:
	_notice_key = ""
	_notice_params = {}
	_notice.text = ""


func _render_notice() -> void:
	_notice.text = ("" if _notice_key.is_empty()
		else _translator.t(_notice_key, _notice_params))


func _on_closed(code: int, reason: String) -> void:
	print("연결 종료 %d %s" % [code, reason])


## 엔티티 사본이 어긋났다. 방 전체를 다시 받는다.
func _on_resync_required(reason: String) -> void:
	push_warning("방 재동기화: %s" % reason)
	_action_sender.send_action("look")


func _on_reconnect_requested() -> void:
	_connection.open(_config.game_url())
