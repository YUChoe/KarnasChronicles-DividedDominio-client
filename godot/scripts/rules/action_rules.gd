class_name ActionRules
extends RefCounted

## 엔티티 속성 → 표시할 동사 목록.
##
## 서버는 가용 동사 목록을 보내지 않는다. 대상의 성질(`is_container`,
## `disposition` 등)만 알려주고 그 성질로 어떤 버튼을 만들지는 클라이언트가
## 정한다.
##
## 이것은 규칙 판정이 아니라 표시 규칙이다. 실제 적용 가능성은 서버가 판정하며
## 어긋나면 `NOT_APPLICABLE` 로 거절한다. 그 거절은 정상 동작 범위다.
##
## 서버가 보낸 속성만 판단 근거로 쓴다. 파생 계산을 하지 않는다.

const EXAMINE := "examine"
const ATTACK := "attack"
const TALK := "talk"
const SHOP_OPEN := "shop_open"
const GET := "get"
const OPEN := "open"
const READ := "read"
const DROP := "drop"
const USE := "use"
const EQUIP := "equip"
const UNEQUIP := "unequip"
const GIVE := "give"
const SHOP_SELL := "shop_sell"
const FOLLOW := "follow"
const FLEE := "flee"
const USE_ITEM := "use_item"
const END_TURN := "end_turn"

const KIND_MONSTER := "monster"
const KIND_OBJECT := "object"
const KIND_PLAYER := "player"

const DISPOSITION_HOSTILE := "hostile"


## 방 안의 엔티티에 적용할 동사.
##
## `context` 는 엔티티 밖의 조건을 담는다.
##   `has_inventory_items` — 내 인벤토리에 아이템이 있는가(플레이어 대상 `give`)
static func for_room_entity(entity: Dictionary, context: Dictionary = {}) -> Array[String]:
	match Protocol.as_string(entity.get("kind")):
		KIND_MONSTER:
			return for_monster(entity)
		KIND_OBJECT:
			return for_room_object(entity)
		KIND_PLAYER:
			return for_room_player(entity, context)
	push_warning("알 수 없는 kind: %s" % Protocol.as_string(entity.get("kind")))
	return []


## 몬스터. NPC 와 몬스터는 같은 테이블이며 `disposition` 으로 갈린다.
##
## `talk` 은 항상 표시한다. 서버가 대화 스크립트 없는 대상에게도 침묵 응답을
## 주기 때문이다. `can_talk` 은 버튼 표시 조건이 아니라 우선순위 판단용이다.
##
## 상인 구분이 없다. 모든 캐릭터와 거래할 수 있으므로 적대가 아닌 대상에게
## 거래 버튼을 표시한다.
static func for_monster(entity: Dictionary) -> Array[String]:
	if not Protocol.as_bool(entity.get("is_alive"), true):
		return [EXAMINE]

	var verbs: Array[String] = [EXAMINE, ATTACK, TALK]
	if Protocol.as_string(entity.get("disposition")) != DISPOSITION_HOSTILE:
		verbs.append(SHOP_OPEN)
	return verbs


## 방에 놓인 오브젝트
static func for_room_object(entity: Dictionary) -> Array[String]:
	var verbs: Array[String] = [EXAMINE, GET]
	if Protocol.as_bool(entity.get("is_container")):
		verbs.append(OPEN)
	if Protocol.as_bool(entity.get("is_readable")):
		verbs.append(READ)
	return verbs


## 같은 방의 다른 플레이어.
##
## 귓속말은 동사가 아니라 채팅 채널이므로 이 목록에 넣지 않는다. 대상 선택은
## 채팅 UI 가 담당한다(Task 5.7).
static func for_room_player(_entity: Dictionary, context: Dictionary = {}) -> Array[String]:
	var verbs: Array[String] = [EXAMINE, FOLLOW]
	if Protocol.as_bool(context.get("has_inventory_items")):
		verbs.append(GIVE)
	return verbs


## 인벤토리 아이템.
##
## `context` 키:
##   `has_other_players` — 같은 방에 다른 플레이어가 있는가(`give`)
##   `shop_open` — 상점 화면이 열려 있는가
##   `shop_sell_prices` — `template_id` → 매도가. 상점 응답에서 만든다
##
## 매도가가 아이템 엔티티에 없는 것은 가격이 `item_prices` 테이블의 템플릿
## 단위 값이기 때문이다. 실물 아이템의 속성이 아니다.
static func for_inventory_item(item: Dictionary, context: Dictionary = {}) -> Array[String]:
	var verbs: Array[String] = [EXAMINE, DROP]

	if Protocol.as_bool(item.get("is_usable")):
		verbs.append(USE)

	var equipped := Protocol.as_bool(item.get("is_equipped"))
	var slot := Protocol.as_string(item.get("equipment_slot"))
	if not slot.is_empty() and not equipped:
		verbs.append(EQUIP)
	if equipped:
		verbs.append(UNEQUIP)

	if Protocol.as_bool(item.get("is_readable")):
		verbs.append(READ)
	if Protocol.as_bool(context.get("has_other_players")):
		verbs.append(GIVE)
	if _can_sell(item, context):
		verbs.append(SHOP_SELL)
	if Protocol.as_bool(item.get("is_container")):
		verbs.append(OPEN)

	return verbs


## 전투 참가자에게 적용할 동사.
##
## 내 턴이 아니면 아무 버튼도 활성화하지 않는다.
static func for_combatant(
	combatant: Dictionary, is_enemy: bool, is_my_turn: bool
) -> Array[String]:
	if not is_my_turn or not is_enemy:
		return []
	if not Protocol.as_bool(combatant.get("is_alive"), true):
		return []
	return [ATTACK]


## 전투 액션 바. 대상이 없는 전투 동사다.
static func combat_bar(is_my_turn: bool) -> Array[String]:
	if not is_my_turn:
		return []
	return [FLEE, USE_ITEM, END_TURN]


static func _can_sell(item: Dictionary, context: Dictionary) -> bool:
	if not Protocol.as_bool(context.get("shop_open")):
		return false
	var template_id := Protocol.as_string(item.get("template_id"))
	if template_id.is_empty():
		return false
	var prices: Dictionary = Protocol.as_dict(context.get("shop_sell_prices"))
	return Protocol.as_int(prices.get(template_id)) > 0
