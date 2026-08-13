class_name AdminResources
extends RefCounted

## 리소스별 기본키와 쓰기 금지 컬럼.
##
## 계약의 `id` 는 기본키가 단일 컬럼인 리소스에만 성립한다. `item_prices` 는
## `template_id`, `factions` 는 사람이 정하는 `id`, `faction_relations` 는 두
## 컬럼의 복합키다.
##
## uuid 를 생성하는 리소스는 요청에 기본키를 담아도 서버가 무시하고 새로 만든다.
## 그렇지 않은 리소스는 `admin_create` 의 `values` 에 기본키를 담아야 한다.

## 리소스 → 기본키 컬럼 목록
const KEYS := {
	"players": ["id"],
	"rooms": ["id"],
	"room_connections": ["id"],
	"monsters": ["id"],
	"objects": ["id"],
	"item_prices": ["template_id"],
	"factions": ["id"],
	"faction_relations": ["faction_a_id", "faction_b_id"],
}

## 서버가 기본키를 생성하는 리소스
const GENERATED := {
	"players": true,
	"rooms": true,
	"room_connections": true,
	"monsters": true,
	"objects": true,
	"item_prices": false,
	"factions": false,
	"faction_relations": false,
}

## 어느 리소스에서도 쓸 수 없는 컬럼. 서버가 `VALIDATION_FAILED` 로 거절한다.
const FORBIDDEN_COLUMNS: Array[String] = [
	"created_at", "updated_at", "password_hash",
]


static func key_columns(resource: String) -> Array[String]:
	var out: Array[String] = []
	for value: Variant in Protocol.as_array(KEYS.get(resource)):
		out.append(Protocol.as_string(value))
	return out


static func generates_key(resource: String) -> bool:
	return Protocol.as_bool(GENERATED.get(resource))


## 이 컬럼을 `values` 에 담을 수 있는가.
##
## 기본키는 생성에서만 쓸 수 있고 수정에서는 금지된다. 생성이라도 서버가 키를
## 만드는 리소스면 담지 않는다.
static func writable(resource: String, column: String, creating: bool) -> bool:
	if FORBIDDEN_COLUMNS.has(column):
		return false
	if not key_columns(resource).has(column):
		return true
	return creating and not generates_key(resource)


## 행에서 기본키만 뽑아 `key` 오브젝트를 만든다.
##
## 응답의 `key` 는 항상 오브젝트다. 단일키 리소스도 `{"id": "..."}` 형태다.
static func key_of(resource: String, row: Dictionary) -> Dictionary:
	var key: Dictionary = {}
	for column: String in key_columns(resource):
		if row.has(column):
			key[column] = row[column]
	return key


## 기본키가 모두 채워졌는가. 하나라도 빠지면 서버가 거절한다.
static func has_full_key(resource: String, key: Dictionary) -> bool:
	var columns := key_columns(resource)
	if columns.is_empty():
		return false
	for column: String in columns:
		if not key.has(column):
			return false
		if Protocol.as_string(key[column]).is_empty():
			return false
	return true
