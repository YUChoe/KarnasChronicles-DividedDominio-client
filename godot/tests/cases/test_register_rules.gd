extends TestCase

## 회원가입 입력 검증.
##
## 규칙은 서버의 `server/accounts.py` 가 정한다. 화면이 먼저 걸러내는 것은 왕복을
## 줄이려는 것이므로 두 규칙이 갈라지면 사용자가 서버 거절만 보고 이유를 모르게
## 된다. 경계값을 여기에 고정한다.

const PREFIX := "ui.register."


func _key(username: String, password: String, confirm: String,
		email: String = "") -> String:
	return RegisterScreen.validation_key(username, password, confirm, email)


func test_올바른_입력은_빈_문자열이다() -> void:
	assert_eq(_key("harness", "test1234", "test1234"), "")


func test_이메일이_있어도_통과한다() -> void:
	assert_eq(_key("harness", "test1234", "test1234", "a@b.co"), "")


func test_필수_항목이_비면_거절한다() -> void:
	assert_eq(_key("", "test1234", "test1234"), PREFIX + "need_required")
	assert_eq(_key("harness", "", ""), PREFIX + "need_required")


func test_사용자명_길이_경계() -> void:
	assert_eq(_key("ab", "test1234", "test1234"), PREFIX + "username_length")
	assert_eq(_key("abc", "test1234", "test1234"), "")
	assert_eq(_key("a".repeat(20), "test1234", "test1234"), "")
	assert_eq(_key("a".repeat(21), "test1234", "test1234"),
		PREFIX + "username_length")


func test_사용자명은_ASCII_영숫자와_밑줄만_쓴다() -> void:
	assert_eq(_key("a_b9", "test1234", "test1234"), "")
	assert_eq(_key("나그네길", "test1234", "test1234"),
		PREFIX + "username_charset")
	assert_eq(_key("has space", "test1234", "test1234"),
		PREFIX + "username_charset")
	assert_eq(_key("dash-name", "test1234", "test1234"),
		PREFIX + "username_charset")


func test_비밀번호_길이_경계() -> void:
	assert_eq(_key("harness", "test123", "test123"), PREFIX + "password_length")
	assert_eq(_key("harness", "test1234", "test1234"), "")


## bcrypt 가 72바이트를 넘는 입력을 조용히 잘라낸다. 길이가 아니라 바이트다
func test_비밀번호_바이트_상한() -> void:
	assert_eq(_key("harness", "a".repeat(72), "a".repeat(72)), "")
	assert_eq(_key("harness", "a".repeat(73), "a".repeat(73)),
		PREFIX + "password_bytes")
	# 한글은 UTF-8 로 세 바이트다. 24자면 72바이트, 25자면 넘는다
	assert_eq(_key("harness", "가".repeat(24), "가".repeat(24)), "")
	assert_eq(_key("harness", "가".repeat(25), "가".repeat(25)),
		PREFIX + "password_bytes")


func test_확인란이_다르면_거절한다() -> void:
	assert_eq(_key("harness", "test1234", "test4321"),
		PREFIX + "password_mismatch")


func test_이메일_형식을_본다() -> void:
	assert_eq(_key("harness", "test1234", "test1234", "not-an-email"),
		PREFIX + "email_format")
	assert_eq(_key("harness", "test1234", "test1234", "a@b"),
		PREFIX + "email_format")
	assert_eq(_key("harness", "test1234", "test1234", "a b@c.co"),
		PREFIX + "email_format")


func test_계약이_정한_거절_사유가_모두_문구를_갖는다() -> void:
	var translator := TranslatorService.new()
	translator.load_translations()
	for reason: String in RegisterScreen.KNOWN_REASONS:
		var key := RegisterScreen.REJECTION_PREFIX + reason
		# 문구가 없으면 키가 그대로 나온다
		assert_true(translator.t(key) != key, key)
