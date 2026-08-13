class_name Terrain
extends RefCounted

## 지형 22종의 아이콘과 색상.
##
## 목록에 없는 값은 `unknown` 으로 처리한다. 서버가 지형을 추가해도 클라이언트가
## 깨지지 않게 하려는 것이다.
##
## 이모지는 초기 구현용이다. 최종적으로 스프라이트로 교체하되 매핑 구조는
## 유지한다. 그래서 아이콘과 색상을 한 자리에 모아 둔다.
##
## 현재 데이터베이스의 방 520개가 모두 `room_type = 'unknown'` 이다. 컬럼은
## 있으나 채워지지 않았고 서버가 값을 설정하는 경로는 어드민 `create_room` 뿐이다.
## 따라서 이 매핑은 당분간 전부 `unknown` 으로 그려진다. 클라이언트 문제가
## 아니며 데이터가 채워지면 그대로 동작한다.

const UNKNOWN := "unknown"

## `hedge` 가 `grassland` 와 같은 아이콘인 것은 design.md 의 표를 따른 것이다.
const TYPES := {
	"forest": {"icon": "🌲", "color": "2e7d32"},
	"grassland": {"icon": "🌿", "color": "7cb342"},
	"coast": {"icon": "🏖️", "color": "d6c187"},
	"road": {"icon": "🛤️", "color": "8d6e63"},
	"castle": {"icon": "🏰", "color": "78909c"},
	"field": {"icon": "🌾", "color": "c0a83a"},
	"pasture": {"icon": "🐄", "color": "9ccc65"},
	"wilderness": {"icon": "🌳", "color": "33691e"},
	"town": {"icon": "🏘️", "color": "bcaaa4"},
	"water": {"icon": "💧", "color": "1e88e5"},
	"hedge": {"icon": "🌿", "color": "558b2f"},
	"trail": {"icon": "🚶", "color": "a1887f"},
	"cave": {"icon": "🕳️", "color": "424242"},
	"crypt": {"icon": "💀", "color": "5d4037"},
	"building": {"icon": "🏛️", "color": "b0bec5"},
	"harbour": {"icon": "⚓", "color": "0277bd"},
	"cliff": {"icon": "🧗", "color": "6d4c41"},
	"stable": {"icon": "🐴", "color": "a1662f"},
	"ruins": {"icon": "🏚️", "color": "757575"},
	"gate": {"icon": "🚪", "color": "8d6e63"},
	"farmland": {"icon": "🌱", "color": "9e9d24"},
	UNKNOWN: {"icon": "❓", "color": "616161"},
}


static func type_count() -> int:
	return TYPES.size()


static func is_known(room_type: String) -> bool:
	return TYPES.has(room_type)


static func icon_of(room_type: String) -> String:
	return Protocol.as_string(_entry(room_type).get("icon"), "❓")


static func color_of(room_type: String) -> Color:
	return Color.html(Protocol.as_string(_entry(room_type).get("color"), "616161"))


static func _entry(room_type: String) -> Dictionary:
	if TYPES.has(room_type):
		return Protocol.as_dict(TYPES[room_type])
	return Protocol.as_dict(TYPES[UNKNOWN])
