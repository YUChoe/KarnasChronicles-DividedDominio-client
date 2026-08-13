class_name AdminPlayerDetail
extends VBoxContainer

## 플레이어 상세.
##
## 전용 메시지가 없다. `players` 행은 `admin_get` 으로, 인벤토리는 `objects` 를
## `location_id` 와 `location_type` 으로 걸러 `admin_list` 로 받는다.
##
## `game_objects.location_type` 은 `inventory` 와 `INVENTORY` 처럼 대소문자가 섞여
## 저장돼 있다. 서버가 대소문자 무시로 비교하므로 소문자로 보낸다.

signal row_requested(player_id: String)
signal inventory_requested(player_id: String)

const RESOURCE_PLAYERS := "players"
const RESOURCE_OBJECTS := "objects"
const LOCATION_INVENTORY := "inventory"

@onready var _title: Label = %PlayerTitle
@onready var _input: LineEdit = %PlayerInput
@onready var _load: Button = %PlayerLoad
@onready var _row_title: Label = %PlayerRowTitle
@onready var _row: GridContainer = %PlayerRow
@onready var _inventory_title: Label = %PlayerInventoryTitle
@onready var _inventory: VBoxContainer = %PlayerItems
@onready var _empty: Label = %PlayerEmpty

var _translator: TranslatorService = null
var _player_id := ""


func _ready() -> void:
	_load.pressed.connect(_on_load_pressed)
	_input.text_submitted.connect(func(_t: String) -> void: _on_load_pressed())


func bind(translator: TranslatorService) -> void:
	_translator = translator
	_translator.locale_changed.connect(_on_locale_changed)
	apply_texts()


func apply_texts() -> void:
	if _translator == null:
		return
	_title.text = _translator.t("ui.admin.player_title")
	_input.placeholder_text = _translator.t("ui.admin.player_id")
	_load.text = _translator.t("ui.admin.player_load")
	_row_title.text = _translator.t("ui.admin.player_stats")
	_inventory_title.text = _translator.t("ui.admin.player_inventory")
	if _row.get_child_count() == 0:
		_empty.text = _translator.t("ui.admin.player_empty")


## 표에서 플레이어 행을 골랐다. 입력란만 채우고 조회하지 않는다. 다른 탭을 보는
## 중에 요청을 보내면 헛돈다.
func set_player(player_id: String) -> void:
	if player_id.is_empty():
		return
	_player_id = player_id
	_input.text = player_id


func load_player(player_id: String) -> void:
	if player_id.is_empty():
		return
	_player_id = player_id
	_input.text = player_id
	row_requested.emit(player_id)
	inventory_requested.emit(player_id)


func current_player() -> String:
	return _player_id


## `admin_get_result` 를 받아 행을 보인다.
func show_row(payload: Dictionary) -> void:
	if Protocol.as_string(payload.get("resource")) != RESOURCE_PLAYERS:
		return

	for child: Node in _row.get_children():
		child.queue_free()

	var row: Dictionary = Protocol.as_dict(payload.get("row"))
	_empty.visible = row.is_empty()
	if row.is_empty():
		return

	for key: Variant in row:
		var name := Label.new()
		name.custom_minimum_size = Vector2(180, 0)
		name.text = Protocol.as_string(key)
		_row.add_child(name)

		var value := Label.new()
		value.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		value.text = _value_text(row[key])
		_row.add_child(value)


## `admin_list_result` 의 `objects` 응답을 인벤토리로 보인다.
func show_inventory(payload: Dictionary) -> void:
	if Protocol.as_string(payload.get("resource")) != RESOURCE_OBJECTS:
		return

	for child: Node in _inventory.get_children():
		child.queue_free()

	var rows := Protocol.as_array(payload.get("rows"))
	if rows.is_empty():
		var empty := Label.new()
		empty.text = _translator.t("ui.admin.player_no_items")
		_inventory.add_child(empty)
		return

	for value: Variant in rows:
		var row: Dictionary = Protocol.as_dict(value)
		var line := Label.new()
		line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		line.text = "%s  %s  %s" % [
			Protocol.as_string(row.get("id")),
			Protocol.as_string(row.get("name_en")),
			Protocol.as_string(row.get("location_type")),
		]
		_inventory.add_child(line)


## 인벤토리 조회에 쓸 필터. 조립 쪽이 그대로 보낸다.
static func inventory_filter(player_id: String) -> Dictionary:
	return {"location_id": player_id, "location_type": LOCATION_INVENTORY}


func _value_text(value: Variant) -> String:
	if value == null:
		return ""
	if value is String:
		return value
	if value is Array or value is Dictionary:
		return JSON.stringify(value)
	return str(value)


func _on_load_pressed() -> void:
	load_player(_input.text.strip_edges())


func _on_locale_changed(_locale: String) -> void:
	apply_texts()
