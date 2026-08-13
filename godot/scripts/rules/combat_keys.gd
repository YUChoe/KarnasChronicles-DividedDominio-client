class_name CombatKeys
extends RefCounted

## 전투 액션의 키보드 단축키.
##
## 숫자를 서버로 보내지 않는다. 대응하는 verb 로 바꿔 보낸다. 기존 서버의 숫자
## 치환(`1`→`attack`)이 클라이언트로 옮겨온 것이며, 프로토콜에는 숫자가 전혀
## 나타나지 않는다.
##
## 단축키는 버튼의 보조 수단이다. 문자 입력이 아니므로 버튼 기반 UI 원칙과
## 어긋나지 않는다.

const ATTACK := "attack"
const USE_ITEM := "use_item"
const FLEE := "flee"
const END_TURN := "end_turn"

## 표시 순서. 요구사항이 정한 짝이다.
const ORDER: Array[String] = [ATTACK, USE_ITEM, FLEE, END_TURN]

## verb → 단축키 숫자
const KEYS := {
	ATTACK: 1,
	USE_ITEM: 4,
	FLEE: 3,
	END_TURN: 9,
}

## 대상이 필요한 verb. 나머지는 대상 없이 보낸다.
const NEEDS_TARGET: Array[String] = [ATTACK, USE_ITEM]


static func key_of(verb: String) -> int:
	return Protocol.as_int(KEYS.get(verb), 0)


## 숫자를 verb 로 바꾼다. 짝이 없으면 빈 문자열이다.
static func verb_of(key: int) -> String:
	for verb: String in ORDER:
		if Protocol.as_int(KEYS.get(verb)) == key:
			return verb
	return ""


## `KEY_1` 같은 키 코드를 verb 로 바꾼다.
static func verb_of_keycode(keycode: int) -> String:
	match keycode:
		KEY_1, KEY_KP_1:
			return verb_of(1)
		KEY_3, KEY_KP_3:
			return verb_of(3)
		KEY_4, KEY_KP_4:
			return verb_of(4)
		KEY_9, KEY_KP_9:
			return verb_of(9)
	return ""
