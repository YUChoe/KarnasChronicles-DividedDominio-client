class_name TranslatorService
extends Node

## 번역 계층. autoload 이름은 `Translator` 다.
##
## 서버는 문장을 만들지 않고 `message_key` 와 `params` 만 보낸다. 키를 문장으로
## 바꾸는 것은 클라이언트 책임이다.
##
## Godot 내장 번역(`tr()`, `.po`)을 쓰지 않는다. 서버 리소스가 키 → locale →
## 문장 구조이고 서버가 보내는 `params` 값이 언어별 dict 인 경우가 있어 커스텀
## 계층이 어차피 필요하다. 그렇다면 리소스를 그대로 재사용하는 편이 싸다.
##
## GDScript `String.format` 이 `{name}` 자리표시자를 지원하므로 번역 값을 문법
## 변환 없이 쓴다. Python 포맷 스펙(`{v:>10}`)과 `{{` 이스케이프는 지원하지
## 않으며 이관 시 전수 검사로 0건임을 확인했다.
##
## 클래스 이름이 autoload 이름과 다른 것은 Godot 이 충돌을 막기 때문이다. 다른
## 스크립트는 autoload 식별자를 직접 쓰지 않고 이 타입으로 주입받는다.

## locale 이 바뀌었다. 화면은 이 신호로 텍스트를 다시 그린다. 재접속하지 않는다.
signal locale_changed(locale: String)

const TRANSLATION_DIR := "res://resources/translations"
const FALLBACK_LOCALE := "en"
## 클라이언트 UI 가 지원하는 locale. 서버의 `supported_locales` 와는 별개다.
const SUPPORTED_LOCALES: Array[String] = ["en", "ko"]

## 키 → {locale → 문장}
var _messages: Dictionary = {}
var _locale := FALLBACK_LOCALE


func _ready() -> void:
	load_translations()


func get_locale() -> String:
	return _locale


## 지원하지 않는 locale 은 무시한다. 같은 값이면 신호를 내지 않는다.
func set_locale(locale: String) -> bool:
	if not SUPPORTED_LOCALES.has(locale):
		push_warning("지원하지 않는 locale: %s" % locale)
		return false
	if locale == _locale:
		return false
	_locale = locale
	locale_changed.emit(locale)
	return true


func key_count() -> int:
	return _messages.size()


## 번역 리소스를 읽는다. autoload 는 `_ready` 에서 호출하고 테스트는 직접 부른다.
func load_translations(directory: String = TRANSLATION_DIR) -> int:
	_messages = {}

	var dir := DirAccess.open(directory)
	if dir == null:
		push_warning("번역 디렉터리를 열 수 없습니다: %s" % directory)
		return 0

	for file_name: String in dir.get_files():
		if not file_name.ends_with(".json"):
			continue
		_merge_file(directory.path_join(file_name))

	return _messages.size()


## 키를 현재 locale 문장으로 바꾼다.
##
## 키가 없으면 키 문자열을 그대로 돌려준다. 서버가 새 키를 쓰기 시작했는데
## 클라이언트가 갱신되지 않은 상황에서 화면이 비지 않게 한다.
func t(key: String, params: Dictionary = {}) -> String:
	if not _messages.has(key):
		push_warning("번역 키 없음: %s" % key)
		return key

	var by_locale: Dictionary = Protocol.as_dict(_messages[key])
	var text := Protocol.as_string(
		by_locale.get(_locale, by_locale.get(FALLBACK_LOCALE, key)), key)

	if params.is_empty():
		return text
	return text.format(resolve_params(params))


## `{"key": ..., "params": {...}}` 형태의 서버 메시지를 문장으로 바꾼다.
##
## `event.message`, `login_result.message`, 대화 대사가 모두 이 형태다.
func render(message: Dictionary) -> String:
	var key := Protocol.as_string(message.get("key"))
	if key.is_empty():
		return ""
	return t(key, Protocol.as_dict(message.get("params")))


## 키 페이로드와 언어별 dict 를 모두 받아 문장으로 만든다.
##
## 대화 대사가 과도기 형태다. 계약은 `{"key": ..., "params": ...}` 를 규정하지만
## 서버는 아직 `lines` 와 `choices[].text` 에 언어별 dict 를 담는다. 서버
## `server-json-protocol` Task 10 이 키 방식으로 바꾼다. 그때까지 양쪽을 받는다.
func text_of(value: Variant) -> String:
	if value is Dictionary and (value as Dictionary).has("key"):
		return render(value)
	return pick(value)


## 언어별 dict 에서 현재 locale 값을 고른다. 스칼라면 문자열로 바꿔 돌려준다.
##
## 엔티티 이름과 설명, 방 설명이 모두 `{"en": ..., "ko": ...}` 형태다. 서버가
## 지원하는 언어가 클라이언트보다 적으면 `en` 으로 떨어진다.
func pick(value: Variant) -> String:
	if value is Dictionary:
		var by_locale: Dictionary = value
		return Protocol.as_string(
			by_locale.get(_locale, by_locale.get(FALLBACK_LOCALE, "")))
	if value is String:
		return value
	if value == null:
		return ""
	return str(value)


## params 값이 언어별 dict 면 현재 locale 값을 고르고 스칼라면 그대로 둔다.
func resolve_params(params: Dictionary) -> Dictionary:
	var out: Dictionary = {}
	for key: Variant in params:
		var value: Variant = params[key]
		if value is Dictionary and (value as Dictionary).has(FALLBACK_LOCALE):
			out[key] = pick(value)
		else:
			out[key] = value
	return out


func _merge_file(path: String) -> void:
	var text := FileAccess.get_file_as_string(path)
	if text.is_empty():
		push_warning("번역 파일이 비었거나 읽을 수 없습니다: %s" % path)
		return

	var parsed: Variant = JSON.parse_string(text)
	if not (parsed is Dictionary):
		push_warning("번역 파일 형식 오류: %s" % path)
		return

	var data: Dictionary = parsed
	for key: Variant in data:
		var key_text := Protocol.as_string(key)
		if _messages.has(key_text):
			push_warning("번역 키 중복: %s (%s)" % [key_text, path])
		_messages[key_text] = Protocol.as_dict(data[key])
