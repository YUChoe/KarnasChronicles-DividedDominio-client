extends TestCase

## 접속 대상 구성 검증.
##
## 배포한 실행 파일이 localhost 를 보거나, 상용에 평문 `ws` 로 붙는 사고를
## 막으려는 것이다. 파일을 읽고 쓰는 경로는 검증하지 않는다. 프로파일 표와 주소
## 조립만 본다.


func test_프로파일이_둘이다() -> void:
	assert_eq(ClientConfig.PROFILES.size(), 2)
	assert_true(ClientConfig.PROFILES.has(ClientConfig.PROFILE_DEV))
	assert_true(ClientConfig.PROFILES.has(ClientConfig.PROFILE_PRODUCTION))


func test_개발_프로파일은_같은_기계의_게이트웨이다() -> void:
	var config := ClientConfig.new()
	assert_true(config.apply_profile(ClientConfig.PROFILE_DEV))
	assert_eq(config.game_url(), "ws://localhost:3000/ws")
	assert_eq(config.admin_url(), "ws://localhost:3000/admin")


func test_상용_프로파일은_TLS_다() -> void:
	var config := ClientConfig.new()
	assert_true(config.apply_profile(ClientConfig.PROFILE_PRODUCTION))
	assert_true(config.secure)
	assert_eq(config.game_url(), "wss://mud.noizze.net/ws")
	assert_eq(config.admin_url(), "wss://mud.noizze.net/admin")


func test_모르는_프로파일은_거짓을_돌려주고_값을_바꾸지_않는다() -> void:
	var config := ClientConfig.new()
	config.apply_profile(ClientConfig.PROFILE_PRODUCTION)
	assert_false(config.apply_profile("staging"))
	assert_eq(config.host, "mud.noizze.net")


## 스킴 기본 포트는 주소에 적지 않는다. 로그에 그대로 나오기 때문이다
func test_기본_포트는_주소에서_생략한다() -> void:
	assert_eq(ClientConfig.url_for("example.com", 443, true, "/ws"),
		"wss://example.com/ws")
	assert_eq(ClientConfig.url_for("example.com", 80, false, "/ws"),
		"ws://example.com/ws")


func test_기본이_아닌_포트는_적는다() -> void:
	assert_eq(ClientConfig.url_for("example.com", 8443, true, "/ws"),
		"wss://example.com:8443/ws")
	assert_eq(ClientConfig.url_for("localhost", 3000, false, "/admin"),
		"ws://localhost:3000/admin")


## 443 을 평문으로 쓰면 포트가 생략되지 않아야 한다. 스킴 기본과 다르다
func test_평문_443_은_포트를_적는다() -> void:
	assert_eq(ClientConfig.url_for("example.com", 443, false, "/ws"),
		"ws://example.com:443/ws")


func test_경로는_계약_상수를_쓴다() -> void:
	var config := ClientConfig.new()
	config.apply_profile(ClientConfig.PROFILE_DEV)
	assert_true(config.game_url().ends_with(Protocol.PATH_GAME))
	assert_true(config.admin_url().ends_with(Protocol.PATH_ADMIN))
