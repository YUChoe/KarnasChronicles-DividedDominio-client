class_name Items
extends RefCounted

## 아이템 표시 규칙.
##
## 서버는 아이템을 묶지 않고 개별 엔티티로 보낸다. 체력 물약 4개는 uuid 가 다른
## 엔티티 4개다. 묶어 보이는 것은 클라이언트의 표시 규칙이며 액션의 `target` 은
## 언제나 개별 uuid 다.

## 카테고리 필터. 요구사항이 정한 네 값이다.
const CATEGORY_MISC := "misc"
const CATEGORIES: Array[String] = ["weapon", "armor", "consumable", CATEGORY_MISC]

## 장착 슬롯 표시 순서.
##
## 서버는 슬롯 이름을 확정하지 않는다. 허용값이 16종이고 `weapon`, `armor`,
## `accessory`, 대문자 `RING` 같은 레거시가 섞여 있어서다. 클라이언트가 표시할
## 목록을 들고 없는 키를 빈 슬롯으로 처리한다. 목록 밖의 슬롯에 장착된 것이
## 있으면 그 슬롯도 뒤에 덧붙여 보인다.
const SLOTS: Array[String] = [
	"head", "shoulder", "chest", "right_arm", "left_arm",
	"right_hand", "left_hand", "waist", "legs", "feet", "back", "ring",
]


## 목록에 없는 카테고리는 기타로 본다.
##
## 실제 데이터에 `currency` 와 `readable` 이 있는데 요구사항의 필터 네 값에는
## 없다. 그대로 두면 어느 필터에도 걸리지 않아 사라진다.
static func category_of(item: Dictionary) -> String:
	var category := Protocol.as_string(item.get("category"))
	return category if CATEGORIES.has(category) else CATEGORY_MISC


## 개당 무게 × 수량
static func total_weight(item: Dictionary) -> float:
	var weight := float(item.get("weight", 0.0))
	return weight * float(stack_count(item))


static func stack_count(item: Dictionary) -> int:
	return maxi(1, Protocol.as_int(item.get("stack_count"), 1))


## 수량 params 를 쓸 수 있는 아이템인가.
##
## `stack_count` 가 1을 넘는 것은 현재 화폐뿐이다. 그 밖의 아이템은 개별 uuid 로
## 처리하므로 수량 선택이 의미가 없다.
static func supports_quantity(item: Dictionary) -> bool:
	return stack_count(item) > 1


## 같은 `template_id` 끼리 묶는다. 묶음의 대표는 첫 항목이고 액션은 그 uuid 로
## 보낸다. `template_id` 가 없으면 묶지 않는다.
##
## 돌려주는 각 항목은 `{"item": Dictionary, "count": int, "weight": float}` 다.
static func group(items: Array) -> Array[Dictionary]:
	var groups: Array[Dictionary] = []
	var index_of: Dictionary = {}

	for value: Variant in items:
		var item: Dictionary = Protocol.as_dict(value)
		var template_id := Protocol.as_string(item.get("template_id"))
		var count := stack_count(item)
		var weight := total_weight(item)

		if template_id.is_empty() or not index_of.has(template_id):
			if not template_id.is_empty():
				index_of[template_id] = groups.size()
			groups.append({"item": item, "count": count, "weight": weight})
			continue

		var at := Protocol.as_int(index_of[template_id])
		var group_entry: Dictionary = groups[at]
		group_entry["count"] = Protocol.as_int(group_entry.get("count")) + count
		group_entry["weight"] = float(group_entry.get("weight", 0.0)) + weight
		groups[at] = group_entry

	return groups
