class_name CredentialStore
extends RefCounted

## 자동 로그인용 자격 정보 보관.
##
## 요구사항이 평문 보관을 금지한다. `FileAccess.open_encrypted_with_pass` 로
## 암호화해 쓰고, 열쇠는 설치마다 무작위로 만들어 별도 파일에 둔다.
##
## 이것이 지키는 범위를 분명히 해 둔다. 파일을 눈으로 열어 보는 수준과 백업이나
## 동기화 폴더에 자격 정보가 그대로 흘러가는 것을 막는다. 같은 사용자 권한으로
## 로컬 파일에 접근할 수 있는 공격자는 열쇠 파일도 읽을 수 있으므로 막지 못한다.
## 그 수준의 보호는 OS 키체인이 필요하고 Godot 이 접근 수단을 제공하지 않는다.

const STORE_PATH := "user://credentials.dat"
const KEY_PATH := "user://install.key"
const KEY_BYTES := 32


## 저장된 자격이 있으면 `{"username": ..., "password": ...}`, 없으면 빈 dict.
static func load_credentials() -> Dictionary:
	if not FileAccess.file_exists(STORE_PATH):
		return {}

	var file := FileAccess.open_encrypted_with_pass(
		STORE_PATH, FileAccess.READ, _install_key())
	if file == null:
		push_warning("자격 정보를 열 수 없습니다. 지웁니다.")
		clear()
		return {}

	var text := file.get_as_text()
	file.close()

	var parsed: Variant = JSON.parse_string(text)
	var data := Protocol.as_dict(parsed)
	if not data.has("username") or not data.has("password"):
		return {}
	return data


static func save_credentials(username: String, password: String) -> void:
	var file := FileAccess.open_encrypted_with_pass(
		STORE_PATH, FileAccess.WRITE, _install_key())
	if file == null:
		push_warning("자격 정보를 저장할 수 없습니다.")
		return

	file.store_string(JSON.stringify({
		"username": username,
		"password": password,
	}))
	file.close()


static func clear() -> void:
	if FileAccess.file_exists(STORE_PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(STORE_PATH))


## 설치마다 다른 무작위 열쇠. 없으면 만든다.
static func _install_key() -> String:
	if FileAccess.file_exists(KEY_PATH):
		var reader := FileAccess.open(KEY_PATH, FileAccess.READ)
		if reader != null:
			var stored := reader.get_as_text().strip_edges()
			reader.close()
			if not stored.is_empty():
				return stored

	var crypto := Crypto.new()
	var key := crypto.generate_random_bytes(KEY_BYTES).hex_encode()

	var writer := FileAccess.open(KEY_PATH, FileAccess.WRITE)
	if writer == null:
		push_warning("열쇠 파일을 만들 수 없습니다.")
		return key
	writer.store_string(key)
	writer.close()
	return key
