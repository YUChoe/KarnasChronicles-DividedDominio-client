extends TestCase

## 지형 매핑 검증.


func test_지형이_22종이다() -> void:
	assert_eq(Terrain.type_count(), 22)


func test_알려진_지형은_전용_아이콘을_받는다() -> void:
	assert_eq(Terrain.icon_of("forest"), "🌲")
	assert_eq(Terrain.icon_of("castle"), "🏰")
	assert_eq(Terrain.icon_of("gate"), "🚪")


func test_모르는_지형은_unknown_으로_떨어진다() -> void:
	assert_false(Terrain.is_known("swamp"))
	assert_eq(Terrain.icon_of("swamp"), Terrain.icon_of(Terrain.UNKNOWN))


func test_빈_문자열도_unknown_으로_떨어진다() -> void:
	assert_eq(Terrain.icon_of(""), "❓")


func test_모든_지형에_아이콘과_색상이_있다() -> void:
	for room_type: Variant in Terrain.TYPES:
		var name := Protocol.as_string(room_type)
		assert_false(Terrain.icon_of(name).is_empty(), name)
		assert_ne(Terrain.color_of(name), Color(0, 0, 0, 0), name)


func test_색상은_hex_에서_만들어진다() -> void:
	assert_eq(Terrain.color_of("forest"), Color.html("2e7d32"))


func test_unknown_이_목록에_있다() -> void:
	assert_true(Terrain.is_known(Terrain.UNKNOWN))
