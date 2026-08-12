class_name TestCase
extends RefCounted

## 테스트 기반 클래스.
##
## gdUnit4 나 GUT 를 쓰지 않는 이유를 남긴다. 둘 다 저장소 밖에서 내려받아
## `addons/` 에 넣어야 하는데, 지금 필요한 검증(번역 치환, 액션 규칙, 메시지
## 디스패치)은 씬 트리도 목(mock)도 필요 없는 순수 로직이다. 러너와 단언 몇
## 개면 충분하고, 그 편이 Godot 판올림과 얽히지 않는다.
##
## 목이나 매개변수화 테스트가 필요해지면 그때 다시 판단한다.
##
## `test_` 로 시작하는 메서드를 러너가 찾아 부른다. 각 메서드 전에 `before_each`
## 가 불린다.

var failures: Array[String] = []

var _current := ""


func before_each() -> void:
	pass


func begin(method: String) -> void:
	_current = method


func fail(message: String) -> void:
	failures.append("%s: %s" % [_current, message])


func assert_eq(actual: Variant, expected: Variant, note: String = "") -> void:
	if actual == expected:
		return
	fail("%s기대 %s, 실제 %s" % [
		"" if note.is_empty() else note + " — ", str(expected), str(actual)])


func assert_ne(actual: Variant, unexpected: Variant, note: String = "") -> void:
	if actual != unexpected:
		return
	fail("%s%s 가 아니어야 합니다" % [
		"" if note.is_empty() else note + " — ", str(unexpected)])


func assert_true(value: bool, note: String = "") -> void:
	if value:
		return
	fail("%s참이어야 합니다" % ["" if note.is_empty() else note + " — "])


func assert_false(value: bool, note: String = "") -> void:
	if not value:
		return
	fail("%s거짓이어야 합니다" % ["" if note.is_empty() else note + " — "])


func assert_contains(haystack: String, needle: String, note: String = "") -> void:
	if haystack.contains(needle):
		return
	fail("%s'%s' 안에 '%s' 가 없습니다" % [
		"" if note.is_empty() else note + " — ", haystack, needle])
