extends TestCase

## 액션 규칙 표 검증. 엔티티 속성 조합으로 기대 버튼 목록을 확인한다.


func _monster(overrides: Dictionary = {}) -> Dictionary:
	var entity: Dictionary = {
		"id": "m1",
		"kind": "monster",
		"is_alive": true,
		"disposition": "neutral",
		"can_talk": false,
	}
	for key: Variant in overrides:
		entity[key] = overrides[key]
	return entity


func _object(overrides: Dictionary = {}) -> Dictionary:
	var entity: Dictionary = {
		"id": "o1",
		"kind": "object",
		"is_container": false,
		"is_readable": false,
		"is_usable": false,
		"is_equipped": false,
		"equipment_slot": null,
		"template_id": "health_potion",
	}
	for key: Variant in overrides:
		entity[key] = overrides[key]
	return entity


func _player(overrides: Dictionary = {}) -> Dictionary:
	var entity: Dictionary = {"id": "p1", "kind": "player"}
	for key: Variant in overrides:
		entity[key] = overrides[key]
	return entity


# 몬스터 (방)

func test_몬스터는_조사_공격_대화를_받는다() -> void:
	assert_eq(ActionRules.for_room_entity(_monster()),
		["examine", "attack", "talk", "shop_open"])


func test_적대_몬스터는_거래를_받지_않는다() -> void:
	assert_eq(ActionRules.for_room_entity(_monster({"disposition": "hostile"})),
		["examine", "attack", "talk"])


func test_죽은_몬스터는_조사만_받는다() -> void:
	assert_eq(ActionRules.for_room_entity(_monster({"is_alive": false})),
		["examine"])


func test_can_talk_이_거짓이어도_대화를_받는다() -> void:
	# 서버가 스크립트 없는 대상에게도 침묵 응답을 준다
	var verbs := ActionRules.for_room_entity(_monster({"can_talk": false}))
	assert_true(verbs.has("talk"))


# 오브젝트 (방)

func test_방_오브젝트는_조사와_줍기를_받는다() -> void:
	assert_eq(ActionRules.for_room_entity(_object()), ["examine", "get"])


func test_방_컨테이너는_열기를_받는다() -> void:
	assert_eq(ActionRules.for_room_entity(_object({"is_container": true})),
		["examine", "get", "open"])


func test_방_읽을거리는_읽기를_받는다() -> void:
	assert_eq(ActionRules.for_room_entity(_object({"is_readable": true})),
		["examine", "get", "read"])


# 오브젝트 (인벤토리)

func test_인벤토리_아이템은_조사와_버리기를_받는다() -> void:
	assert_eq(ActionRules.for_inventory_item(_object()), ["examine", "drop"])


func test_사용_가능한_아이템은_사용을_받는다() -> void:
	assert_eq(ActionRules.for_inventory_item(_object({"is_usable": true})),
		["examine", "drop", "use"])


func test_장착_슬롯이_있고_미장착이면_장착을_받는다() -> void:
	assert_eq(
		ActionRules.for_inventory_item(_object({"equipment_slot": "chest"})),
		["examine", "drop", "equip"])


func test_장착_중이면_해제를_받고_장착을_받지_않는다() -> void:
	var verbs := ActionRules.for_inventory_item(
		_object({"equipment_slot": "chest", "is_equipped": true}))
	assert_true(verbs.has("unequip"))
	assert_false(verbs.has("equip"))


func test_같은_방에_다른_플레이어가_있으면_건네기를_받는다() -> void:
	var verbs := ActionRules.for_inventory_item(
		_object(), {"has_other_players": true})
	assert_true(verbs.has("give"))


func test_상점이_닫혀_있으면_판매를_받지_않는다() -> void:
	var verbs := ActionRules.for_inventory_item(_object(), {
		"shop_open": false,
		"shop_sell_prices": {"health_potion": 20},
	})
	assert_false(verbs.has("shop_sell"))


func test_상점이_열려_있고_매도가가_있으면_판매를_받는다() -> void:
	var verbs := ActionRules.for_inventory_item(_object(), {
		"shop_open": true,
		"shop_sell_prices": {"health_potion": 20},
	})
	assert_true(verbs.has("shop_sell"))


func test_매도가가_0_이면_판매를_받지_않는다() -> void:
	var verbs := ActionRules.for_inventory_item(_object(), {
		"shop_open": true,
		"shop_sell_prices": {"health_potion": 0},
	})
	assert_false(verbs.has("shop_sell"))


func test_template_id_가_없으면_판매를_받지_않는다() -> void:
	var verbs := ActionRules.for_inventory_item(_object({"template_id": null}), {
		"shop_open": true,
		"shop_sell_prices": {"health_potion": 20},
	})
	assert_false(verbs.has("shop_sell"))


# 플레이어 (방)

func test_플레이어는_조사와_따라가기를_받는다() -> void:
	assert_eq(ActionRules.for_room_entity(_player()), ["examine", "follow"])


func test_인벤토리에_아이템이_있으면_건네기를_받는다() -> void:
	assert_eq(
		ActionRules.for_room_entity(_player(), {"has_inventory_items": true}),
		["examine", "follow", "give"])


func test_귓속말은_동사_목록에_없다() -> void:
	# 귓속말은 채팅 채널이지 액션이 아니다
	var verbs := ActionRules.for_room_entity(_player())
	assert_false(verbs.has("whisper"))


# 전투

func test_내_턴에_살아_있는_적은_공격을_받는다() -> void:
	assert_eq(ActionRules.for_combatant({"is_alive": true}, true, true),
		["attack"])


func test_내_턴이_아니면_아무것도_받지_않는다() -> void:
	assert_eq(ActionRules.for_combatant({"is_alive": true}, true, false), [])


func test_우리_편은_공격을_받지_않는다() -> void:
	assert_eq(ActionRules.for_combatant({"is_alive": true}, false, true), [])


func test_죽은_적은_공격을_받지_않는다() -> void:
	assert_eq(ActionRules.for_combatant({"is_alive": false}, true, true), [])


func test_전투_액션_바는_내_턴에만_열린다() -> void:
	assert_eq(ActionRules.combat_bar(true), ["flee", "use_item", "end_turn"])
	assert_eq(ActionRules.combat_bar(false), [])


# 알 수 없는 kind

func test_알_수_없는_kind_는_빈_목록을_돌려준다() -> void:
	assert_eq(ActionRules.for_room_entity({"kind": "unknown"}), [])
