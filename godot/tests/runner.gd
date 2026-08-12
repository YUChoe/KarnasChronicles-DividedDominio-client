extends SceneTree

## 테스트 러너.
##
## `godot --headless --path godot --script res://tests/runner.gd` 로 돌린다.
## `res://tests/cases/test_*.gd` 를 찾아 `test_` 메서드를 모두 부르고 실패 수를
## 종료 코드로 돌려준다.
##
## `--script` 경로의 종료 코드는 신뢰할 수 있다. 게임 실행이나 `--editor --quit`
## 의 종료 코드는 그렇지 않다.

const CASE_DIR := "res://tests/cases"


func _initialize() -> void:
	var paths := _case_paths()
	if paths.is_empty():
		print("테스트 파일이 없습니다: %s" % CASE_DIR)
		quit(1)
		return

	var total := 0
	var failures: Array[String] = []

	for path: String in paths:
		var script: Resource = load(path)
		if not (script is GDScript):
			print("건너뜀 (GDScript 아님): %s" % path)
			continue

		var case_script: GDScript = script
		var instance: Variant = case_script.new()
		if not (instance is TestCase):
			print("건너뜀 (TestCase 아님): %s" % path)
			continue

		var test_case: TestCase = instance
		var name := path.get_file()
		var methods := _test_methods(test_case)

		for method: String in methods:
			total += 1
			test_case.failures.clear()
			test_case.begin(method)
			test_case.before_each()
			test_case.call(method)

			if test_case.failures.is_empty():
				print("OK   %s :: %s" % [name, method])
			else:
				for message: String in test_case.failures:
					print("FAIL %s :: %s" % [name, message])
					failures.append("%s :: %s" % [name, message])

	print("")
	print("테스트 %d개, 실패 %d개" % [total, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _case_paths() -> Array[String]:
	var paths: Array[String] = []
	var dir := DirAccess.open(CASE_DIR)
	if dir == null:
		return paths

	for file_name: String in dir.get_files():
		if file_name.begins_with("test_") and file_name.ends_with(".gd"):
			paths.append(CASE_DIR.path_join(file_name))
	paths.sort()
	return paths


func _test_methods(test_case: TestCase) -> Array[String]:
	var names: Array[String] = []
	for entry: Variant in test_case.get_method_list():
		var method: Dictionary = Protocol.as_dict(entry)
		var method_name := Protocol.as_string(method.get("name"))
		if method_name.begins_with("test_"):
			names.append(method_name)
	names.sort()
	return names
