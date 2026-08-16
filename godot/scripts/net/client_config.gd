class_name ClientConfig
extends RefCounted

## 접속 설정. `user://client.cfg` 에 보관한다.
##
## 파일이 없으면 기본값으로 만든다. 사용자가 편집기 없이도 접속 대상을 바꿀 수
## 있어야 하므로 ProjectSettings 가 아니라 쓰기 가능한 위치를 쓴다.

const CONFIG_PATH := "user://client.cfg"
const SECTION_NETWORK := "network"
const SECTION_UI := "ui"

const SECTION_AUTH := "auth"

const DEFAULT_HOST := "localhost"
const DEFAULT_PORT := 3000
const DEFAULT_LOCALE := "en"

var host := DEFAULT_HOST
var port := DEFAULT_PORT
var locale := DEFAULT_LOCALE
var auto_login := false


static func load_or_create() -> ClientConfig:
	var config := ClientConfig.new()
	var file := ConfigFile.new()

	if file.load(CONFIG_PATH) != OK:
		config.save()
		return config

	config.host = Protocol.as_string(
		file.get_value(SECTION_NETWORK, "host", DEFAULT_HOST), DEFAULT_HOST)
	config.port = Protocol.as_int(
		file.get_value(SECTION_NETWORK, "port", DEFAULT_PORT), DEFAULT_PORT)
	config.locale = Protocol.as_string(
		file.get_value(SECTION_UI, "locale", DEFAULT_LOCALE), DEFAULT_LOCALE)
	config.auto_login = Protocol.as_bool(
		file.get_value(SECTION_AUTH, "auto_login", false))
	return config


func save() -> void:
	var file := ConfigFile.new()
	file.set_value(SECTION_NETWORK, "host", host)
	file.set_value(SECTION_NETWORK, "port", port)
	file.set_value(SECTION_UI, "locale", locale)
	file.set_value(SECTION_AUTH, "auto_login", auto_login)

	var status := file.save(CONFIG_PATH)
	if status != OK:
		push_warning("설정 저장 실패: %s (%d)" % [CONFIG_PATH, status])


## 게임 채널 접속 주소
func game_url() -> String:
	return "ws://%s:%d%s" % [host, port, Protocol.PATH_GAME]


## 어드민 채널 접속 주소. Task 11.1 이 쓴다.
func admin_url() -> String:
	return "ws://%s:%d%s" % [host, port, Protocol.PATH_ADMIN]
