extends TestCase

## 전투 단축키 매핑 검증.
##
## 숫자는 서버로 가지 않는다. verb 로 바뀌어야 한다.


func test_요구사항의_짝을_지킨다() -> void:
	assert_eq(CombatKeys.key_of("attack"), 1)
	assert_eq(CombatKeys.key_of("use_item"), 4)
	assert_eq(CombatKeys.key_of("flee"), 3)
	assert_eq(CombatKeys.key_of("end_turn"), 9)


func test_숫자를_verb_로_바꾼다() -> void:
	assert_eq(CombatKeys.verb_of(1), "attack")
	assert_eq(CombatKeys.verb_of(4), "use_item")
	assert_eq(CombatKeys.verb_of(3), "flee")
	assert_eq(CombatKeys.verb_of(9), "end_turn")


func test_짝이_없는_숫자는_빈_문자열이다() -> void:
	assert_eq(CombatKeys.verb_of(2), "")
	assert_eq(CombatKeys.verb_of(0), "")


func test_키_코드를_verb_로_바꾼다() -> void:
	assert_eq(CombatKeys.verb_of_keycode(KEY_1), "attack")
	assert_eq(CombatKeys.verb_of_keycode(KEY_KP_9), "end_turn")
	assert_eq(CombatKeys.verb_of_keycode(KEY_A), "")


func test_표시_순서가_넷이다() -> void:
	assert_eq(CombatKeys.ORDER.size(), 4)


func test_대상이_필요한_verb_는_둘이다() -> void:
	assert_true(CombatKeys.NEEDS_TARGET.has("attack"))
	assert_true(CombatKeys.NEEDS_TARGET.has("use_item"))
	assert_false(CombatKeys.NEEDS_TARGET.has("flee"))
	assert_false(CombatKeys.NEEDS_TARGET.has("end_turn"))


func test_모든_전투_액션에_문구가_있다() -> void:
	var translator := TranslatorService.new()
	translator.load_translations()
	for verb: String in CombatKeys.ORDER:
		var key := "ui.combat.%s" % verb
		assert_ne(translator.t(key), key, "문구 없음: %s" % key)


func test_규칙_표의_전투_바와_같은_동사다() -> void:
	# ActionRules.combat_bar 는 대상이 없는 셋을 돌려준다
	var bar := ActionRules.combat_bar(true)
	for verb: String in bar:
		assert_true(CombatKeys.ORDER.has(verb), "단축키 없음: %s" % verb)
