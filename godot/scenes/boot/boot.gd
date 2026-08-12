extends Node

## 조립 지점.
##
## 연결, 디스패처, 액션 송신, 상태 저장소를 엮는다. 각 부품은 서로를 직접 찾지
## 않고 이곳에서 주입받는다. autoload 식별자를 직접 참조하는 곳은 여기뿐이다.
##
## 지금은 연결 상태만 보여준다. Task 3 이 로그인 화면을 얹으면 이 씬이 화면
## 전환의 뿌리가 된다.

const NOTICE_UNSUPPORTED := "This client is out of date. Please update to continue."
const NOTICE_CHANNEL := "Wrong channel: expected %s but the server reported %s. Check the connection settings."
const NOTICE_READY := "Connected to %s. Login arrives in Task 3."
const NOTICE_GATEWAY := "The gateway refused the connection: %s"

@onready var _connection: Connection = $Connection
@onready var _action_sender: ActionSender = $ActionSender
@onready var _indicator: ConnectionIndicator = %ConnectionIndicator
@onready var _notice: Label = %Notice

var _config: ClientConfig = null
var _dispatcher: Dispatcher = null


func _ready() -> void:
	_config = ClientConfig.load_or_create()

	var store := get_node("/root/GameState") as GameStateStore

	_dispatcher = Dispatcher.new()
	_dispatcher.state = store

	_connection.set_dispatcher(_dispatcher)
	_connection.locale = _config.locale

	_action_sender.connection = _connection
	_action_sender.set_dispatcher(_dispatcher)

	_connection.state_changed.connect(_on_state_changed.bind(store))
	_connection.protocol_unsupported.connect(_on_protocol_unsupported)
	_connection.channel_mismatch.connect(_on_channel_mismatch)
	_connection.closed.connect(_on_closed)
	_dispatcher.gateway_error.connect(_on_gateway_error)

	store.resync_required.connect(_on_resync_required)

	_indicator.bind(_connection)
	_indicator.reconnect_requested.connect(_on_reconnect_requested)

	_notice.text = ""
	_connection.open(_config.game_url())


func _on_state_changed(state: Connection.State, store: GameStateStore) -> void:
	store.set_connection_state(int(state), _connection.get_reconnect_attempt())
	print("연결 상태: %s" % Connection.State.keys()[int(state)])

	if state == Connection.State.READY:
		_notice.text = NOTICE_READY % _config.game_url()
	elif state == Connection.State.DISCONNECTED:
		# 응답이 올 수 없으므로 대기 중인 버튼을 되살린다
		_action_sender.clear_pending()


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
