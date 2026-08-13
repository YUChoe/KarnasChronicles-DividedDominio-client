class_name EntityButton
extends Button

## 방 안의 엔티티 하나를 나타내는 버튼.
##
## uuid 를 사용자에게 노출하지 않는다. 전송에만 쓴다.
##
## 아이콘은 초기 구현용 이모지다. 몬스터는 `disposition`, 오브젝트는 `category`
## 로 고른다. 최종적으로 스프라이트로 교체하되 이 매핑 구조는 유지한다.

signal selected(entity_id: String)

const DISPOSITION_ICONS := {
	"friendly": "👤",
	"neutral": "🐾",
	"hostile": "⚔",
}
const CATEGORY_ICONS := {
	"weapon": "🗡",
	"armor": "🛡",
	"consumable": "🍞",
	"misc": "📦",
}
const ICON_PLAYER := "🧍"
const ICON_CONTAINER := "📦"
const ICON_CURRENCY := "💰"
const ICON_FALLBACK := "❔"

var entity_id := ""

var _entity: Dictionary = {}
var _translator: TranslatorService = null


func _ready() -> void:
	pressed.connect(func() -> void: selected.emit(entity_id))


## 엔티티를 담는다. 트리에 넣은 뒤 부른다.
func setup(entity: Dictionary, translator: TranslatorService) -> void:
	_entity = entity
	_translator = translator
	entity_id = Protocol.as_string(entity.get("id"))
	refresh()


func refresh() -> void:
	if _translator == null:
		return

	var label := _translator.pick(_entity.get("name"))
	if label.is_empty():
		label = entity_id

	var stack := Protocol.as_int(_entity.get("stack_count"), 1)
	if stack > 1:
		label = "%s ×%d" % [label, stack]

	text = "%s %s" % [_icon(), label]
	tooltip_text = _translator.pick(_entity.get("description"))


func _icon() -> String:
	match Protocol.as_string(_entity.get("kind")):
		ActionRules.KIND_PLAYER:
			return ICON_PLAYER
		ActionRules.KIND_MONSTER:
			return Protocol.as_string(
				DISPOSITION_ICONS.get(
					Protocol.as_string(_entity.get("disposition"))),
				ICON_FALLBACK)
		ActionRules.KIND_OBJECT:
			return _object_icon()
	return ICON_FALLBACK


func _object_icon() -> String:
	if Protocol.as_int(_entity.get("stack_count"), 1) > 1:
		# 현재 stack_count 가 1을 넘는 것은 화폐뿐이다
		return ICON_CURRENCY
	if Protocol.as_bool(_entity.get("is_container")):
		return ICON_CONTAINER
	return Protocol.as_string(
		CATEGORY_ICONS.get(Protocol.as_string(_entity.get("category"))),
		ICON_FALLBACK)
