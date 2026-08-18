extends TestCase

## 감정 표현 목록과 번역 키의 짝을 고정한다.
##
## 서버의 `EMOTE_IDS` 와 어긋나면 `INVALID_PARAMS` 로 거절된다. 목록을 늘릴 때
## 번역 키를 빠뜨리는 것도 막는다.

var _translator: TranslatorService = null


func before_each() -> void:
	_translator = TranslatorService.new()
	_translator.load_translations()


func test_감정_표현이_12종이다() -> void:
	assert_eq(Emotes.IDS.size(), 12)


func test_서버_목록과_같다() -> void:
	# commands/actions/social.py 의 EMOTE_IDS 와 같은 순서다
	assert_eq(Emotes.IDS, [
		"wave", "bow", "nod", "shake_head", "smile", "laugh",
		"cry", "sigh", "shrug", "clap", "dance", "salute",
	])


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


## 파티 탭은 아직 채울 것이 없다. 서버에 파티 기능이 없다
func test_파티_탭은_다른_분류를_받지_않는다() -> void:
	for category: String in Protocol.EVENT_CATEGORIES:
		assert_false(
			EventLog.accepts(EventLog.CHANNEL_PARTY, category), category)


func test_로그_필터마다_문구가_있다() -> void:
	for channel: String in EventLog.FILTERS:
		var key := "ui.log.%s" % channel
		assert_ne(_translator.t(key), key, "문구 없음: %s" % key)
