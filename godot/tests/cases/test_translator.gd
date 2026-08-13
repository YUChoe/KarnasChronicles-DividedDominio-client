extends TestCase

## 번역 치환 검증. 서버 없이 돌아간다.

var _translator: TranslatorService = null


func before_each() -> void:
	_translator = TranslatorService.new()
	_translator.load_translations()


func test_리소스를_읽는다() -> void:
	assert_true(_translator.key_count() > 400,
		"키 %d개" % _translator.key_count())


func test_기본_locale_은_en() -> void:
	assert_eq(_translator.get_locale(), "en")


func test_키를_문장으로_바꾼다() -> void:
	assert_eq(_translator.t("ui.login.title"), "Sign in")


func test_locale_을_바꾸면_문장이_바뀐다() -> void:
	assert_true(_translator.set_locale("ko"))
	assert_eq(_translator.t("ui.login.title"), "로그인")


func test_같은_locale_로_바꾸면_거짓을_돌려준다() -> void:
	assert_false(_translator.set_locale("en"))


func test_지원하지_않는_locale_은_거부한다() -> void:
	assert_false(_translator.set_locale("fr"))
	assert_eq(_translator.get_locale(), "en")


func test_params_를_치환한다() -> void:
	var text := _translator.t("ui.connection.reconnecting",
		{"seconds": 4, "attempt": 3})
	assert_eq(text, "Reconnecting in 4s (attempt 3)")


func test_언어별_dict_params_는_현재_locale_을_고른다() -> void:
	_translator.set_locale("ko")
	var params: Dictionary = {
		"target": {"en": "Ash Raider", "ko": "재의 약탈자"},
		"damage": 12,
	}
	var text := _translator.t("combat.hit", params)
	assert_contains(text, "재의 약탈자")
	assert_contains(text, "12")


func test_언어별_dict_params_는_영어에서_영어를_고른다() -> void:
	var params: Dictionary = {
		"target": {"en": "Ash Raider", "ko": "재의 약탈자"},
		"damage": 12,
	}
	assert_contains(_translator.t("combat.hit", params), "Ash Raider")


func test_키가_없으면_키를_돌려준다() -> void:
	assert_eq(_translator.t("no.such.key"), "no.such.key")


func test_현재_locale_번역이_없으면_en_으로_떨어진다() -> void:
	_translator.set_locale("ko")
	# 한국어 값이 없는 키를 직접 넣어 폴백만 확인한다
	_translator._messages["fixture.en_only"] = {"en": "English only"}
	assert_eq(_translator.t("fixture.en_only"), "English only")


func test_pick_은_현재_locale_값을_고른다() -> void:
	var name: Dictionary = {"en": "Town Merchant", "ko": "마을 상인"}
	assert_eq(_translator.pick(name), "Town Merchant")
	_translator.set_locale("ko")
	assert_eq(_translator.pick(name), "마을 상인")


func test_pick_은_현재_locale_이_없으면_en_을_고른다() -> void:
	_translator.set_locale("ko")
	assert_eq(_translator.pick({"en": "Only English"}), "Only English")


func test_pick_은_스칼라를_그대로_돌려준다() -> void:
	assert_eq(_translator.pick("plain"), "plain")
	assert_eq(_translator.pick(42), "42")
	assert_eq(_translator.pick(null), "")


func test_render_는_서버_메시지를_문장으로_바꾼다() -> void:
	var message: Dictionary = {
		"key": "ui.connection.reconnecting",
		"params": {"seconds": 1, "attempt": 1},
	}
	assert_eq(_translator.render(message), "Reconnecting in 1s (attempt 1)")


func test_render_는_키가_없으면_빈_문자열을_돌려준다() -> void:
	assert_eq(_translator.render({}), "")


func test_한국어_조사는_번역_값의_완성형을_그대로_쓴다() -> void:
	# 종성 판별로 조사를 고르지 않는다. 번역 값이 완성형을 담는다.
	_translator.set_locale("ko")
	_translator._messages["fixture.particle"] = {
		"en": "You picked up {item}.",
		"ko": "{item}을(를) 획득했습니다.",
	}
	var text := _translator.t("fixture.particle", {"item": "빵"})
	assert_eq(text, "빵을(를) 획득했습니다.")


func test_서버_리소스_키도_읽힌다() -> void:
	assert_ne(_translator.t("auth.login_failed"), "auth.login_failed")


func test_text_of_는_키_페이로드를_문장으로_바꾼다() -> void:
	assert_eq(_translator.text_of({
		"key": "ui.connection.reconnecting",
		"params": {"seconds": 2, "attempt": 1},
	}), "Reconnecting in 2s (attempt 1)")


func test_text_of_는_언어별_dict_를_고른다() -> void:
	# 대화 대사가 아직 이 형태로 온다
	_translator.set_locale("ko")
	assert_eq(_translator.text_of({"en": "Hello", "ko": "안녕"}), "안녕")


func test_text_of_는_문자열을_그대로_돌려준다() -> void:
	assert_eq(_translator.text_of("plain"), "plain")
