extends TestCase

## 어드민 거절 코드와 안내 문구의 짝을 고정한다.

var _translator: TranslatorService = null


func before_each() -> void:
	_translator = TranslatorService.new()
	_translator.load_translations()


func test_어드민_전용_코드가_다섯이다() -> void:
	assert_eq(Protocol.ADMIN_REJECTION_CODES.size(), 5)


func test_어드민_전용_코드는_어드민_문구를_쓴다() -> void:
	for code: String in Protocol.ADMIN_REJECTION_CODES:
		assert_eq(AdminCodes.notice_key(code), "ui.admin.rejection." + code)


func test_게임_채널_코드도_문구가_있다() -> void:
	for code: String in Protocol.REJECTION_CODES:
		var key := AdminCodes.notice_key(code)
		assert_false(key.is_empty(), code)
		assert_ne(_translator.t(key), key, "문구 없음: %s" % key)


func test_어드민_전용_코드에_문구가_있다() -> void:
	for code: String in Protocol.ADMIN_REJECTION_CODES:
		var key := AdminCodes.notice_key(code)
		assert_ne(_translator.t(key), key, "문구 없음: %s" % key)


func test_게임에서_조용히_넘기는_코드도_어드민에서는_보인다() -> void:
	# 편집 도구이므로 실패를 삼키면 안 된다
	for code: String in [
			Protocol.NOT_APPLICABLE, Protocol.NOT_FOUND,
			Protocol.NOT_AUTHENTICATED, Protocol.INVALID_PARAMS,
			Protocol.TARGET_REQUIRED]:
		assert_eq(RejectionPolicy.notice_key(code), "", "게임 채널: %s" % code)
		assert_eq(AdminCodes.notice_key(code), "ui.admin.rejection." + code)


func test_모르는_코드는_어드민_unknown_으로_떨어진다() -> void:
	assert_eq(AdminCodes.notice_key("SOMETHING_NEW"),
		"ui.admin.rejection.unknown")


func test_리소스가_여덟이다() -> void:
	assert_eq(Protocol.ADMIN_RESOURCES.size(), 8)


func test_어드민_응답_타입이_모두_목록에_있다() -> void:
	for message_type: String in [
			Protocol.ADMIN_LOGIN_RESULT,
			Protocol.ACCOUNT_CREATE_RESULT, Protocol.ADMIN_LIST_RESULT,
			Protocol.ADMIN_GET_RESULT, Protocol.ADMIN_MUTATE_RESULT,
			Protocol.ADMIN_STATS_RESULT, Protocol.ADMIN_MAP_RESULT,
			Protocol.ADMIN_ACTION_RESULT, Protocol.ADMIN_REJECTED]:
		assert_true(Protocol.ADMIN_SERVER_TYPES.has(message_type), message_type)


func test_게임_전용_타입은_어드민_목록에_없다() -> void:
	for message_type: String in [
			Protocol.LOGIN_RESULT, Protocol.ROOM_INFO, Protocol.INVENTORY,
			Protocol.COMBAT_STATE, Protocol.CHAT]:
		assert_false(
			Protocol.ADMIN_SERVER_TYPES.has(message_type), message_type)
