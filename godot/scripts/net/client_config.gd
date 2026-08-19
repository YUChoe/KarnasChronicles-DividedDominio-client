class_name ClientConfig
extends RefCounted

## 접속 설정. `user://client.cfg` 에 보관한다.
##
## 파일이 없으면 기본값으로 만든다. 사용자가 편집기 없이도 접속 대상을 바꿀 수
## 있어야 하므로 ProjectSettings 가 아니라 쓰기 가능한 위치를 쓴다.
##
## 접속 대상은 프로파일로 고른다. `dev` 는 같은 기계의 게이트웨이, `production`
## 은 배포된 도메인이다. 프로파일이 host·port·secure 를 덮으므로 환경을 바꾸는
## 일이 한 줄 편집이 된다. 셋을 직접 정하려면 `custom` 을 쓴다.
##
## 기본 프로파일은 실행 형태로 정한다. 편집기에서 돌리거나 개발 빌드면 `dev`,
## 그 밖에는 `production` 이다. 배포한 실행 파일이 localhost 를 보는 사고를
## 막는다. 개발 빌드는 내보내기 프리셋 `Windows Desktop Dev` 가 만들며 기능
## 태그 `devbuild` 로 자신을 밝힌다.
##
## 파일에 적힌 프로파일은 그것을 쓴 빌드가 지금 도는 빌드와 같은 종류일 때만
## 따른다. 프로파일을 고르는 UI 가 없으므로 저장된 값은 사용자의 선택이 아니라
## 이전 실행이 남긴 메아리다. 편집기로 한 번 돌린 기계에서 상용 실행 파일이
## localhost 를 보는 일이 실제로 있었다.
##
## 명령줄로도 바꿀 수 있다. 한 빌드로 두 환경을 오갈 때 쓴다.
##
##     "Echoes of the Fallen Age.exe" --profile=dev
##     godot --path godot -- --profile=production

const CONFIG_PATH := "user://client.cfg"
const SECTION_NETWORK := "network"
const SECTION_UI := "ui"

const SECTION_AUTH := "auth"

const PROFILE_DEV := "dev"
const PROFILE_PRODUCTION := "production"
## host·port·secure 를 파일 값 그대로 쓴다
const PROFILE_CUSTOM := "custom"

## 프로파일별 접속 대상.
##
## `secure` 가 참이면 `wss` 다. nginx 가 TLS 를 끝내고 평문으로 게이트웨이에
## 넘긴다. 클라이언트가 보는 것은 nginx 쪽이므로 여기서는 참이어야 한다.
const PROFILES := {
	PROFILE_DEV: {"host": "localhost", "port": 3000, "secure": false},
	PROFILE_PRODUCTION: {"host": "mud.noizze.net", "port": 443, "secure": true},
}

## 개발 빌드가 자신을 밝히는 기능 태그. 내보내기 프리셋의 `custom_features` 다
const FEATURE_DEV := "devbuild"

## 빌드 종류. 저장된 설정을 따를지 가르는 기준이다
const FLAVOUR_DEV := "dev"
const FLAVOUR_PRODUCTION := "production"
const FLAVOUR_WEB := "web"

const DEFAULT_LOCALE := "en"

var profile := PROFILE_DEV
var host := "localhost"
var port := 3000
var secure := false
var locale := DEFAULT_LOCALE
var auto_login := false


## 지금 도는 빌드의 종류.
static func build_flavour() -> String:
	if OS.has_feature("editor") or OS.has_feature(FEATURE_DEV):
		return FLAVOUR_DEV
	if OS.has_feature("web"):
		return FLAVOUR_WEB
	return FLAVOUR_PRODUCTION


## 편집기이거나 개발 빌드면 개발, 그 밖에는 상용이다.
static func default_profile() -> String:
	if ClientConfig.build_flavour() == FLAVOUR_DEV:
		return PROFILE_DEV
	return PROFILE_PRODUCTION


## 명령줄에서 `--profile=<이름>` 을 찾는다. 없거나 모르는 이름이면 빈 문자열.
##
## 엔진이 삼키는 인자가 있어 `--` 앞뒤를 모두 본다.
static func profile_from_cmdline() -> String:
	var args := OS.get_cmdline_args() + OS.get_cmdline_user_args()

	for arg: String in args:
		if not arg.begins_with("--profile="):
			continue
		var name := arg.substr("--profile=".length())
		if name == PROFILE_CUSTOM or PROFILES.has(name):
			return name
		push_warning("모르는 프로파일: %s" % name)

	return ""


static func load_or_create() -> ClientConfig:
	var config := ClientConfig.new()
	var file := ConfigFile.new()
	var loaded := file.load(CONFIG_PATH) == OK

	if loaded:
		config.locale = Protocol.as_string(
			file.get_value(SECTION_UI, "locale", DEFAULT_LOCALE), DEFAULT_LOCALE)
		config.auto_login = Protocol.as_bool(
			file.get_value(SECTION_AUTH, "auto_login", false))

	# 같은 종류의 빌드가 쓴 설정만 따른다. 상용 실행 파일이 편집기 실행의
	# 잔재를 물려받으면 배포한 클라이언트가 localhost 를 본다
	var flavour := ClientConfig.build_flavour()
	var stored := ""
	if Protocol.as_string(
			file.get_value(SECTION_NETWORK, "flavour", "")) == flavour:
		stored = Protocol.as_string(
			file.get_value(SECTION_NETWORK, "profile", ""))

	var chosen := ClientConfig.profile_from_cmdline()

	if chosen.is_empty():
		chosen = stored
	if chosen.is_empty():
		chosen = ClientConfig.default_profile()

	config.profile = chosen

	if chosen == PROFILE_CUSTOM:
		# 파일 값이 진실이다. 프로파일에 없는 대상에 붙을 때 쓴다
		config.host = Protocol.as_string(
			file.get_value(SECTION_NETWORK, "host", "localhost"), "localhost")
		config.port = Protocol.as_int(
			file.get_value(SECTION_NETWORK, "port", 3000), 3000)
		config.secure = Protocol.as_bool(
			file.get_value(SECTION_NETWORK, "secure", false))
	else:
		config.apply_profile(chosen)

	# 다른 빌드가 쓴 파일이면 지금 값으로 덮는다. 다음 실행에 같은 판정을
	# 되풀이하지 않는다
	if not loaded or stored.is_empty():
		config.save()

	return config


## 프로파일의 접속 대상을 host·port·secure 에 옮긴다.
func apply_profile(name: String) -> bool:
	if not PROFILES.has(name):
		push_warning("모르는 프로파일: %s" % name)
		return false

	var target: Dictionary = PROFILES[name]
	profile = name
	host = Protocol.as_string(target.get("host"), host)
	port = Protocol.as_int(target.get("port"), port)
	secure = Protocol.as_bool(target.get("secure"))
	return true


func save() -> void:
	var file := ConfigFile.new()
	file.set_value(SECTION_NETWORK, "flavour", ClientConfig.build_flavour())
	file.set_value(SECTION_NETWORK, "profile", profile)
	# 프로파일이 덮어쓰는 값이지만 함께 적는다. 파일만 보고도 어디에 붙는지
	# 알 수 있어야 한다. custom 일 때만 이 값들이 읽힌다
	file.set_value(SECTION_NETWORK, "host", host)
	file.set_value(SECTION_NETWORK, "port", port)
	file.set_value(SECTION_NETWORK, "secure", secure)
	file.set_value(SECTION_UI, "locale", locale)
	file.set_value(SECTION_AUTH, "auto_login", auto_login)

	var status := file.save(CONFIG_PATH)
	if status != OK:
		push_warning("설정 저장 실패: %s (%d)" % [CONFIG_PATH, status])


## 접속 주소를 만든다. 스킴 기본 포트는 적지 않는다.
##
## `wss://host:443/ws` 도 동작하지만 로그와 오류 메시지에 그대로 나오므로
## 사람이 읽는 자리에서 잡음이 된다.
static func url_for(
	target_host: String, target_port: int, target_secure: bool, path: String
) -> String:
	var scheme := "wss" if target_secure else "ws"
	var default_port := 443 if target_secure else 80

	if target_port == default_port:
		return "%s://%s%s" % [scheme, target_host, path]

	return "%s://%s:%d%s" % [scheme, target_host, target_port, path]


## 게임 채널 접속 주소
func game_url() -> String:
	return ClientConfig.url_for(host, port, secure, Protocol.PATH_GAME)


## 어드민 채널 접속 주소. Task 11.1 이 쓴다.
func admin_url() -> String:
	return ClientConfig.url_for(host, port, secure, Protocol.PATH_ADMIN)
