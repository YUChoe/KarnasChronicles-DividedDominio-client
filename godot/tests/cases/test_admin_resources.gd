extends TestCase

## 리소스 기본키와 쓰기 규칙, 액션 명세를 고정한다.


func test_리소스_여덟에_모두_기본키가_있다() -> void:
	for resource: String in Protocol.ADMIN_RESOURCES:
		assert_false(AdminResources.key_columns(resource).is_empty(), resource)


func test_복합키_리소스는_두_컬럼이다() -> void:
	assert_eq(AdminResources.key_columns("faction_relations"),
		["faction_a_id", "faction_b_id"])


func test_item_prices_는_template_id_가_기본키다() -> void:
	assert_eq(AdminResources.key_columns("item_prices"), ["template_id"])


func test_uuid_생성_리소스는_다섯이다() -> void:
	var generated := 0
	for resource: String in Protocol.ADMIN_RESOURCES:
		if AdminResources.generates_key(resource):
			generated += 1
	assert_eq(generated, 5)


func test_기본키는_수정에서_쓸_수_없다() -> void:
	assert_false(AdminResources.writable("factions", "id", false))
	assert_false(AdminResources.writable("faction_relations", "faction_a_id", false))


func test_서버가_만드는_키는_생성에서도_쓸_수_없다() -> void:
	assert_false(AdminResources.writable("rooms", "id", true))


func test_사람이_정하는_키는_생성에서_쓸_수_있다() -> void:
	assert_true(AdminResources.writable("factions", "id", true))
	assert_true(AdminResources.writable("item_prices", "template_id", true))


func test_금지_컬럼은_어디서도_쓸_수_없다() -> void:
	for column: String in ["created_at", "updated_at", "password_hash"]:
		assert_false(AdminResources.writable("players", column, true), column)
		assert_false(AdminResources.writable("players", column, false), column)


func test_일반_컬럼은_쓸_수_있다() -> void:
	assert_true(AdminResources.writable("rooms", "description_ko", false))
	assert_true(AdminResources.writable("players", "display_name", false))


func test_행에서_기본키만_뽑는다() -> void:
	var key := AdminResources.key_of("faction_relations", {
		"faction_a_id": "ash_knights",
		"faction_b_id": "wild",
		"relation": "hostile",
	})
	assert_eq(key, {"faction_a_id": "ash_knights", "faction_b_id": "wild"})


func test_기본키가_하나라도_빠지면_불완전하다() -> void:
	assert_false(AdminResources.has_full_key("faction_relations",
		{"faction_a_id": "ash_knights"}))
	assert_false(AdminResources.has_full_key("factions", {"id": ""}))
	assert_true(AdminResources.has_full_key("factions", {"id": "wild"}))


# 실시간 액션

func test_액션이_열넷이다() -> void:
	assert_eq(AdminActions.ORDER.size(), 14)


func test_모든_액션에_params_명세가_있다() -> void:
	for action: String in AdminActions.ORDER:
		assert_true(AdminActions.PARAMS.has(action), action)


func test_인자가_없는_액션이_셋이다() -> void:
	var empty := 0
	for action: String in AdminActions.ORDER:
		if AdminActions.params_of(action).is_empty():
			empty += 1
	assert_eq(empty, 3)


func test_좌표_params_는_정수로_보낸다() -> void:
	var params := AdminActions.build_params("spawn_monster", {
		"template_id": "template_small_rat", "x": "0", "y": "7",
	})
	assert_eq(params, {"template_id": "template_small_rat", "x": 0, "y": 7})


func test_빈_입력은_담지_않는다() -> void:
	var params := AdminActions.build_params("kick", {
		"target_player": "nagne", "reason": "",
	})
	assert_eq(params, {"target_player": "nagne"})


func test_명세에_없는_입력은_버린다() -> void:
	var params := AdminActions.build_params("validate_world", {"x": "1"})
	assert_true(params.is_empty())


func test_접속_중이어야_하는_액션은_둘이다() -> void:
	assert_eq(AdminActions.NEEDS_ONLINE_PLAYER, ["goto", "kick"])


func test_인벤토리_필터는_두_조건이다() -> void:
	assert_eq(AdminPlayerDetail.inventory_filter("p1"),
		{"location_id": "p1", "location_type": "inventory"})
