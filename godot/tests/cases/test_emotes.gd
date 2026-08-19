extends TestCase

## 감정 표현·빠른 대화 목록과 번역 키의 짝을 고정한다.
##
## 서버의 `EMOTE_IDS` 와 어긋나면 `INVALID_PARAMS` 로 거절된다. 목록 자체의
## 대조는 `scripts/check-contract-coverage.py` 가 두 저장소를 함께 읽어 한다.
## 여기서는 목록 안의 일관성과 번역 키를 본다.

var _translator: TranslatorService = null


func before_each() -> void:
	_translator = TranslatorService.new()
	_translator.load_translations()


## 그룹이 전체 목록을 빠짐없이, 겹치지 않게 덮는다. 화면은 그룹으로만 보여주므로
## 그룹에 없는 항목은 고를 수 없다
func test_그룹이_전체_목록을_덮는다() -> void:
	var seen: Array[String] = []
	for group: String in Emotes.GROUPS:
		for value: Variant in Emotes.ids_of(group):
			var emote_id := Protocol.as_string(value)
			assert_false(seen.has(emote_id), "중복: %s" % emote_id)
			seen.append(emote_id)

	assert_eq(seen.size(), Emotes.IDS.size())
	for emote_id: String in Emotes.IDS:
		assert_true(seen.has(emote_id), "그룹에 없음: %s" % emote_id)


func test_그룹마다_문구가_있다() -> void:
	for group: String in Emotes.GROUPS:
		var key := Emotes.group_label_key(group)
		assert_ne(_translator.t(key), key, "문구 없음: %s" % key)


func test_모르는_그룹은_빈_배열이다() -> void:
	assert_eq(Emotes.ids_of("no_such_group"), [])


## 기존 동작 열둘은 그대로 남아 있어야 한다. 빠른 대화를 더하면서 지우지 않았다
func test_기존_동작이_남아_있다() -> void:
	for emote_id: String in [
			"wave", "bow", "nod", "shake_head", "smile", "laugh",
			"cry", "sigh", "shrug", "clap", "dance", "salute"]:
		assert_true(Emotes.IDS.has(emote_id), emote_id)


func test_모든_감정_표현에_목록_문구가_있다() -> void:
	for emote_id: String in Emotes.IDS:
		var key := Emotes.label_key(emote_id)
		assert_ne(_translator.t(key), key, "문구 없음: %s" % key)


func test_모든_감정_표현에_서버_문장_키가_있다() -> void:
	# 서버가 emote.<id>.self 와 emote.<id>.other 를 보낸다
	for emote_id: String in Emotes.IDS:
		for suffix: String in ["self", "other"]:
			var key := "emote.%s.%s" % [emote_id, suffix]
			assert_ne(_translator.t(key), key, "번역 없음: %s" % key)


## 탭은 셋이다. 전투·이동·아이템·사회·시스템 탭은 없앴고 그 내용은 "전체" 에
## 남는다. 분류별 탭을 되살리려면 요구 사항을 다시 정해야 한다
func test_로그_필터가_셋이다() -> void:
	assert_eq(EventLog.FILTERS, [
		EventLog.CHANNEL_ALL, EventLog.CHANNEL_CHAT, EventLog.CHANNEL_PARTY,
	] as Array[String])


## 계약의 분류는 탭이 없어도 "전체" 에서 보여야 한다
func test_계약의_category_가_전체에_들어온다() -> void:
	for category: String in Protocol.EVENT_CATEGORIES:
		assert_true(EventLog.accepts(EventLog.CHANNEL_ALL, category), category)


## 채팅 탭이 대화까지 받는다. 사용자에게는 같은 일이다
func test_대화_탭이_채팅과_대화를_함께_받는다() -> void:
	assert_true(EventLog.accepts(EventLog.CHANNEL_CHAT, EventLog.CHANNEL_CHAT))
	assert_true(EventLog.accepts(
		EventLog.CHANNEL_CHAT, EventLog.CHANNEL_DIALOGUE))
	assert_false(EventLog.accepts(EventLog.CHANNEL_CHAT, "combat"))


## 채팅 입력은 대화와 파티 탭에서만 열린다
func test_채팅은_대화와_파티_탭에서만_열린다() -> void:
	assert_true(EventLog.allows_chat(EventLog.CHANNEL_CHAT))
	assert_true(EventLog.allows_chat(EventLog.CHANNEL_PARTY))
	assert_false(EventLog.allows_chat(EventLog.CHANNEL_ALL))


## 파티 탭은 아직 채울 것이 없다. 서버에 파티 기능이 없다
func test_파티_탭은_다른_분류를_받지_않는다() -> void:
	for category: String in Protocol.EVENT_CATEGORIES:
		assert_false(
			EventLog.accepts(EventLog.CHANNEL_PARTY, category), category)


func test_로그_필터마다_문구가_있다() -> void:
	for channel: String in EventLog.FILTERS:
		var key := "ui.log.%s" % channel
		assert_ne(_translator.t(key), key, "문구 없음: %s" % key)
