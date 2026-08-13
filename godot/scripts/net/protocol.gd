class_name Protocol
extends RefCounted

## 프로토콜 계약 상수.
##
## 서버 저장소 `docs/protocol/` 이 유일한 기준이다. 계약이 바뀌면 이 파일을
## 먼저 고친다. 계약에 없는 `type` 은 무시하고 경고를 남긴다는 규칙이 하위
## 호환을 보장하므로, 목록에 없다는 이유로 연결을 끊지 않는다.

## 지원하는 `welcome.protocol_version` 목록
const SUPPORTED_VERSIONS: Array[int] = [1]

const CHANNEL_GAME := "game"
const CHANNEL_ADMIN := "admin"

## WebSocket 업그레이드 경로
const PATH_GAME := "/ws"
const PATH_ADMIN := "/admin"

# 클라이언트 → 서버
const LOGIN := "login"
const LOGOUT := "logout"
const ACTION := "action"
const CHAT := "chat"
const PING := "ping"
const CLIENT_INFO := "client_info"

const CLIENT_TYPES: Array[String] = [
	LOGIN, LOGOUT, ACTION, CHAT, PING, CLIENT_INFO,
]

# 서버 → 클라이언트
const WELCOME := "welcome"
const LOGIN_RESULT := "login_result"
const LOGOUT_RESULT := "logout_result"
const PONG := "pong"
const ROOM_INFO := "room_info"
const ENTITY_ENTER := "entity_enter"
const ENTITY_LEAVE := "entity_leave"
const ENTITY_UPDATE := "entity_update"
const PLAYER_STATE := "player_state"
const INVENTORY := "inventory"
const CONTAINER_CONTENTS := "container_contents"
const COMBAT_STATE := "combat_state"
const DIALOGUE := "dialogue"
const SHOP := "shop"
const WHO_RESULT := "who_result"
const EVENT := "event"
const ACTION_REJECTED := "action_rejected"
const ERROR := "error"

const SERVER_TYPES: Array[String] = [
	WELCOME, LOGIN_RESULT, LOGOUT_RESULT, PONG,
	ROOM_INFO, ENTITY_ENTER, ENTITY_LEAVE, ENTITY_UPDATE,
	PLAYER_STATE, INVENTORY, CONTAINER_CONTENTS, COMBAT_STATE,
	DIALOGUE, SHOP, WHO_RESULT, CHAT, EVENT,
	ACTION_REJECTED, ERROR,
]

# 어드민 채널. 클라이언트 → 서버
const ADMIN_LOGIN := "admin_login"
const SERVICE_LOGIN := "service_login"
const ACCOUNT_CREATE := "account_create"
const ADMIN_LIST := "admin_list"
const ADMIN_GET := "admin_get"
const ADMIN_CREATE := "admin_create"
const ADMIN_UPDATE := "admin_update"
const ADMIN_DELETE := "admin_delete"
const ADMIN_STATS := "admin_stats"
const ADMIN_MAP := "admin_map"
const ADMIN_ACTION := "admin_action"

# 어드민 채널. 서버 → 클라이언트
const ADMIN_LOGIN_RESULT := "admin_login_result"
const SERVICE_LOGIN_RESULT := "service_login_result"
const ACCOUNT_CREATE_RESULT := "account_create_result"
const ADMIN_LIST_RESULT := "admin_list_result"
const ADMIN_GET_RESULT := "admin_get_result"
## 생성·수정·삭제가 응답 타입을 공유한다
const ADMIN_MUTATE_RESULT := "admin_mutate_result"
const ADMIN_STATS_RESULT := "admin_stats_result"
const ADMIN_MAP_RESULT := "admin_map_result"
const ADMIN_ACTION_RESULT := "admin_action_result"
const ADMIN_REJECTED := "admin_rejected"

const ADMIN_SERVER_TYPES: Array[String] = [
	WELCOME, PONG, ERROR,
	ADMIN_LOGIN_RESULT, SERVICE_LOGIN_RESULT, ACCOUNT_CREATE_RESULT,
	ADMIN_LIST_RESULT, ADMIN_GET_RESULT, ADMIN_MUTATE_RESULT,
	ADMIN_STATS_RESULT, ADMIN_MAP_RESULT, ADMIN_ACTION_RESULT,
	ADMIN_REJECTED,
]

## 어드민 리소스 8종과 대상 테이블
const ADMIN_RESOURCES: Array[String] = [
	"players", "rooms", "room_connections", "monsters",
	"objects", "item_prices", "factions", "faction_relations",
]

## 어드민 채널에만 있는 사유 코드. 게임 채널의 코드에 더해진다.
const USERNAME_TAKEN := "USERNAME_TAKEN"
const REFERENCED := "REFERENCED"
const PLAYER_NOT_ONLINE := "PLAYER_NOT_ONLINE"
const VALIDATION_FAILED := "VALIDATION_FAILED"
const SESSION_EXPIRED := "SESSION_EXPIRED"

const ADMIN_REJECTION_CODES: Array[String] = [
	USERNAME_TAKEN, REFERENCED, PLAYER_NOT_ONLINE,
	VALIDATION_FAILED, SESSION_EXPIRED,
]

## 게이트웨이가 자체 생성하는 프레임.
##
## MUD 서버가 아니라 게이트웨이가 만든다. `docs/protocol/` 에 정의돼 있지 않아
## 계약의 빈 자리다. 다만 `gateway_error` 는 풀 용량 초과와 프레임 규약 위반을
## 알리는 실제 신호이므로 무시하면 사용자가 원인을 알 수 없다.
const GATEWAY_CONNECTED := "gateway_connected"
const GATEWAY_ERROR := "gateway_error"

const GATEWAY_TYPES: Array[String] = [GATEWAY_CONNECTED, GATEWAY_ERROR]

## `action_rejected` 의 사유 코드. entities.md 의 표와 같은 순서다.
const NOT_AUTHENTICATED := "NOT_AUTHENTICATED"
const NOT_FOUND := "NOT_FOUND"
const NOT_APPLICABLE := "NOT_APPLICABLE"
const PERMISSION_DENIED := "PERMISSION_DENIED"
const WRONG_STATE := "WRONG_STATE"
const NOT_YOUR_TURN := "NOT_YOUR_TURN"
const OUT_OF_RANGE := "OUT_OF_RANGE"
const INSUFFICIENT_FUNDS := "INSUFFICIENT_FUNDS"
const INSUFFICIENT_QUANTITY := "INSUFFICIENT_QUANTITY"
const INVENTORY_FULL := "INVENTORY_FULL"
const SLOT_OCCUPIED := "SLOT_OCCUPIED"
const COOLDOWN := "COOLDOWN"
const TARGET_REQUIRED := "TARGET_REQUIRED"
const INVALID_PARAMS := "INVALID_PARAMS"
const INTERNAL_ERROR := "INTERNAL_ERROR"

const REJECTION_CODES: Array[String] = [
	NOT_AUTHENTICATED, NOT_FOUND, NOT_APPLICABLE, PERMISSION_DENIED,
	WRONG_STATE, NOT_YOUR_TURN, OUT_OF_RANGE, INSUFFICIENT_FUNDS,
	INSUFFICIENT_QUANTITY, INVENTORY_FULL, SLOT_OCCUPIED, COOLDOWN,
	TARGET_REQUIRED, INVALID_PARAMS, INTERNAL_ERROR,
]

## `error` 전용 코드. 계약 위반에만 쓰이며 게임 로직 거절과 구분된다.
const MALFORMED_MESSAGE := "MALFORMED_MESSAGE"

## `event.category` 값. 로그 채널 분류에 쓴다.
const EVENT_CATEGORIES: Array[String] = [
	"combat", "movement", "item", "social", "system", "dialogue",
]

## 채팅 채널
const CHAT_ROOM := "room"
const CHAT_WHISPER := "whisper"


## 값이 Dictionary 면 그대로, 아니면 빈 Dictionary 를 돌려준다.
##
## `JSON.parse_string` 결과가 Variant 이므로 상태 저장소로 넘기기 전에 이곳에서
## 형을 확정한다. 서버가 계약을 어겨도 클라이언트가 죽지 않게 한다.
static func as_dict(value: Variant) -> Dictionary:
	if value is Dictionary:
		return value
	return {}


## 값이 Array 면 그대로, 아니면 빈 Array 를 돌려준다.
static func as_array(value: Variant) -> Array:
	if value is Array:
		return value
	return []


## 값이 String 이면 그대로, 아니면 기본값을 돌려준다.
static func as_string(value: Variant, fallback: String = "") -> String:
	if value is String:
		return value
	return fallback


## 값이 정수로 해석되면 그 값을, 아니면 기본값을 돌려준다.
##
## JSON 숫자는 소수점이 없어도 float 으로 파싱되는 경우가 있어 둘 다 받는다.
static func as_int(value: Variant, fallback: int = 0) -> int:
	if value is int:
		return value
	if value is float:
		return int(value)
	return fallback


## 값이 bool 이면 그대로, 아니면 기본값을 돌려준다.
static func as_bool(value: Variant, fallback: bool = false) -> bool:
	if value is bool:
		return value
	return fallback
