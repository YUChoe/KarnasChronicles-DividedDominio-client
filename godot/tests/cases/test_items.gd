extends TestCase

## 아이템 표시 규칙 검증.


func _item(overrides: Dictionary = {}) -> Dictionary:
	var item: Dictionary = {
		"id": "i1",
		"kind": "object",
		"category": "consumable",
		"weight": 0.3,
		"stack_count": 1,
		"template_id": "health_potion",
	}
	for key: Variant in overrides:
		item[key] = overrides[key]
	return item


func test_카테고리_네_종을_그대로_쓴다() -> void:
	for category: String in ["weapon", "armor", "consumable", "misc"]:
		assert_eq(Items.category_of(_item({"category": category})), category)


func test_목록에_없는_카테고리는_기타로_본다() -> void:
	# 실제 데이터에 currency 와 readable 이 있는데 필터 네 값에는 없다
	assert_eq(Items.category_of(_item({"category": "currency"})), "misc")
	assert_eq(Items.category_of(_item({"category": "readable"})), "misc")
	assert_eq(Items.category_of(_item({"category": ""})), "misc")


func test_총_무게는_개당_무게_곱하기_수량() -> void:
	assert_eq(Items.total_weight(_item({"weight": 0.5, "stack_count": 4})), 2.0)


func test_수량이_없으면_1_로_본다() -> void:
	assert_eq(Items.stack_count(_item({"stack_count": 0})), 1)
	assert_eq(Items.stack_count({}), 1)


func test_수량_지정은_스택이_1_을_넘을_때만_가능하다() -> void:
	assert_false(Items.supports_quantity(_item()))
	assert_true(Items.supports_quantity(_item({"stack_count": 15})))


func test_같은_템플릿끼리_묶는다() -> void:
	var groups := Items.group([
		_item({"id": "a"}),
		_item({"id": "b"}),
		_item({"id": "c", "template_id": "bread", "weight": 0.2}),
	])
	assert_eq(groups.size(), 2)
	assert_eq(Protocol.as_int(groups[0].get("count")), 2)
	assert_eq(Protocol.as_int(groups[1].get("count")), 1)


func test_묶음의_대표는_첫_항목이다() -> void:
	var groups := Items.group([_item({"id": "a"}), _item({"id": "b"})])
	var first: Dictionary = Protocol.as_dict(groups[0].get("item"))
	assert_eq(Protocol.as_string(first.get("id")), "a")


func test_묶음_무게는_합이다() -> void:
	var groups := Items.group([
		_item({"id": "a", "weight": 0.5}),
		_item({"id": "b", "weight": 0.5}),
	])
	assert_eq(float(groups[0].get("weight")), 1.0)


func test_template_id_가_없으면_묶지_않는다() -> void:
	var groups := Items.group([
		_item({"id": "a", "template_id": null}),
		_item({"id": "b", "template_id": null}),
	])
	assert_eq(groups.size(), 2)


func test_슬롯_목록에_번역_키가_모두_있다() -> void:
	var translator := TranslatorService.new()
	translator.load_translations()
	for slot: String in Items.SLOTS:
		var key := "ui.slot.%s" % slot
		assert_ne(translator.t(key), key, "문구 없음: %s" % key)


func test_필터마다_번역_키가_있다() -> void:
	var translator := TranslatorService.new()
	translator.load_translations()
	for category: String in Items.CATEGORIES:
		var key := "ui.filter.%s" % category
		assert_ne(translator.t(key), key, "문구 없음: %s" % key)
