extends TestCase

## 품질 기준을 테스트로 고정한다.
##
## 한 번 점검하고 끝내면 새로 추가되는 코드가 다시 어긋난다. 파일 길이, 자유 문자
## 입력이 놓인 자리, 영국 영어 철자를 러너가 매번 확인한다.

## 스크립트 하나의 길이 상한
const MAX_LINES := 500

## 자유 문자 입력이 허용된 게임 화면.
##
## 계약이 정한 자리는 채팅 메시지, 로그인의 사용자명과 비밀번호, `changename` 의
## 새 이름, 어드민 패널의 폼 값이다. 어드민은 편집 도구이므로 별도로 다룬다.
const GAME_INPUT_SCENES: Array[String] = [
	"res://scenes/login/login.tscn",
	"res://scenes/main/chat_bar.tscn",
	"res://scenes/status/status.tscn",
]

## 미국 철자. 영국 철자를 써야 한다.
const AMERICAN_WORDS := {
	"color": "colour",
	"colors": "colours",
	"behavior": "behaviour",
	"behaviors": "behaviours",
	"honor": "honour",
	"favor": "favour",
	"favorite": "favourite",
	"neighbor": "neighbour",
	"armor": "armour",
	"armors": "armours",
	"center": "centre",
	"centers": "centres",
	"meter": "metre",
	"theater": "theatre",
	"defense": "defence",
	"offense": "offence",
	"license": "licence",
	"organize": "organise",
	"organized": "organised",
	"recognize": "recognise",
	"realize": "realise",
	"customize": "customise",
	"apologize": "apologise",
	"traveler": "traveller",
	"travelers": "travellers",
	"canceled": "cancelled",
	"canceling": "cancelling",
	"jewelry": "jewellery",
}


# 12.2 구조

func test_스크립트가_500행을_넘지_않는다() -> void:
	for path: String in _scripts():
		var text := FileAccess.get_file_as_string(path)
		var lines := text.split("\n").size()
		assert_true(lines <= MAX_LINES, "%s %d행" % [path, lines])


func test_스크립트가_하나라도_있다() -> void:
	# 경로가 틀리면 위 검사가 조용히 통과한다
	assert_true(_scripts().size() > 30, "%d개" % _scripts().size())


# 12.1 입력 제약

func test_게임_화면의_자유_입력은_정해진_자리에만_있다() -> void:
	var found: Array[String] = []
	for path: String in _scenes():
		if path.begins_with("res://scenes/admin/"):
			continue
		if _has_text_input(path):
			found.append(path)
	found.sort()

	var expected := GAME_INPUT_SCENES.duplicate()
	expected.sort()
	assert_eq(found, expected)


func test_명령어_입력창이_없다() -> void:
	# 명령어 입력을 뜻하는 노드 이름이 없어야 한다
	for path: String in _scenes():
		var text := FileAccess.get_file_as_string(path)
		for needle: String in ["CommandEdit", "CommandInput", "CommandLine"]:
			assert_false(text.contains(needle), "%s %s" % [path, needle])


func test_어드민_밖에서_uuid_를_직접_입력하지_않는다() -> void:
	# 플레이어 조회는 어드민 도구다. 게임 화면에는 uuid 입력이 없다
	for path: String in GAME_INPUT_SCENES:
		var text := FileAccess.get_file_as_string(path)
		assert_false(text.contains("uuid"), path)


# 12.4 영국 영어

func test_UI_영어_문구가_영국_철자를_쓴다() -> void:
	var data := _ui_strings()
	assert_true(data.size() > 100, "%d개" % data.size())

	for key: Variant in data:
		var entry: Dictionary = Protocol.as_dict(data[key])
		var english := Protocol.as_string(entry.get("en"))
		for word: String in _words(english):
			assert_false(AMERICAN_WORDS.has(word),
				"%s: %s → %s" % [Protocol.as_string(key), word,
					Protocol.as_string(AMERICAN_WORDS.get(word))])


func test_모든_UI_키에_두_언어가_있다() -> void:
	for key: Variant in _ui_strings():
		var entry: Dictionary = Protocol.as_dict(_ui_strings()[key])
		for locale: String in TranslatorService.SUPPORTED_LOCALES:
			assert_true(entry.has(locale),
				"%s 에 %s 없음" % [Protocol.as_string(key), locale])


func _ui_strings() -> Dictionary:
	var text := FileAccess.get_file_as_string(
		"res://resources/translations/ui.json")
	var parsed: Variant = JSON.parse_string(text)
	return Protocol.as_dict(parsed)


## 영문자만 남겨 소문자 단어로 쪼갠다.
##
## `{name}` 자리표시자는 뺀다. 이름이 서버 필드명을 그대로 따르므로 철자 규칙의
## 대상이 아니다. `{defense}` 는 `Combatant.defense` 를 가리킨다.
func _words(text: String) -> Array[String]:
	var out: Array[String] = []
	var current := ""
	var in_placeholder := false
	for index: int in range(text.length()):
		var ch := text[index]
		if ch == "{":
			in_placeholder = true
			continue
		if ch == "}":
			in_placeholder = false
			continue
		if in_placeholder:
			continue
		if (ch >= "a" and ch <= "z") or (ch >= "A" and ch <= "Z"):
			current += ch
			continue
		if not current.is_empty():
			out.append(current.to_lower())
			current = ""
	if not current.is_empty():
		out.append(current.to_lower())
	return out


func _has_text_input(path: String) -> bool:
	var text := FileAccess.get_file_as_string(path)
	return text.contains('type="LineEdit"') or text.contains('type="TextEdit"')


func _scripts() -> Array[String]:
	return _collect("res://scripts", ".gd") + _collect("res://scenes", ".gd")


func _scenes() -> Array[String]:
	return _collect("res://scenes", ".tscn")


func _collect(root: String, suffix: String) -> Array[String]:
	var out: Array[String] = []
	var dir := DirAccess.open(root)
	if dir == null:
		return out

	for name: String in dir.get_files():
		if name.ends_with(suffix):
			out.append(root.path_join(name))
	for name: String in dir.get_directories():
		out.append_array(_collect(root.path_join(name), suffix))
	return out
