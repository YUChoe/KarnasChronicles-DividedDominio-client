extends TestCase

## 거절 코드별 처리 방침 검증.


func test_계약의_코드_15종을_모두_안다() -> void:
	for code: String in Protocol.REJECTION_CODES:
		assert_true(RejectionPolicy.EFFECTS.has(code), "누락: %s" % code)


func test_적용_불가는_버튼만_지운다() -> void:
	assert_eq(RejectionPolicy.effect_for(Protocol.NOT_APPLICABLE),
		RejectionPolicy.Effect.REMOVE_BUTTON)


func test_적용_불가는_사용자에게_보이지_않는다() -> void:
	# 낙관적 버튼 구성의 정상 동작 범위다
	assert_false(RejectionPolicy.is_user_facing(Protocol.NOT_APPLICABLE))
	assert_eq(RejectionPolicy.notice_key(Protocol.NOT_APPLICABLE), "")


func test_대상_없음은_방을_재동기화한다() -> void:
	assert_eq(RejectionPolicy.effect_for(Protocol.NOT_FOUND),
		RejectionPolicy.Effect.RESYNC_ROOM)


func test_미인증은_로그인_화면으로_보낸다() -> void:
	assert_eq(RejectionPolicy.effect_for(Protocol.NOT_AUTHENTICATED),
		RejectionPolicy.Effect.RETURN_TO_LOGIN)


func test_클라이언트_버그_코드는_로그만_남긴다() -> void:
	assert_eq(RejectionPolicy.effect_for(Protocol.TARGET_REQUIRED),
		RejectionPolicy.Effect.LOG_CLIENT_BUG)
	assert_eq(RejectionPolicy.effect_for(Protocol.INVALID_PARAMS),
		RejectionPolicy.Effect.LOG_CLIENT_BUG)
	assert_eq(RejectionPolicy.notice_key(Protocol.INVALID_PARAMS), "")


func test_턴이_아니면_턴_대기를_표시한다() -> void:
	assert_eq(RejectionPolicy.effect_for(Protocol.NOT_YOUR_TURN),
		RejectionPolicy.Effect.SHOW_TURN_WAIT)


func test_화폐_부족은_안내를_표시한다() -> void:
	# 상점을 두지 않으므로 부족액을 그릴 자리가 없다
	assert_eq(RejectionPolicy.effect_for(Protocol.INSUFFICIENT_FUNDS),
		RejectionPolicy.Effect.SHOW_NOTICE)


func test_슬롯_사용_중은_교체를_제안한다() -> void:
	assert_eq(RejectionPolicy.effect_for(Protocol.SLOT_OCCUPIED),
		RejectionPolicy.Effect.CONFIRM_REPLACE)


func test_모르는_코드는_안내를_표시한다() -> void:
	assert_eq(RejectionPolicy.effect_for("SOMETHING_NEW"),
		RejectionPolicy.Effect.SHOW_NOTICE)
	assert_eq(RejectionPolicy.notice_key("SOMETHING_NEW"),
		"ui.rejection.unknown")


func test_사용자에게_보이는_코드는_번역_키가_있다() -> void:
	var translator := TranslatorService.new()
	translator.load_translations()

	for code: String in Protocol.REJECTION_CODES:
		var key := RejectionPolicy.notice_key(code)
		if key.is_empty():
			continue
		assert_ne(translator.t(key), key, "번역 키 없음: %s" % key)
