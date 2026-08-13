class_name AdminMapView
extends VBoxContainer

## 월드 맵 뷰.
##
## `admin_map_result` 의 좌표 배열로 격자를 그린다. 서버가 HTML 을 만들던 것을
## 대체하며 렌더링은 이곳이 담당한다.
##
## 좌표계는 게임 미니맵과 같다. 북쪽이 y 증가 방향이라 위쪽 행이 큰 y 다.
##
## 설명(`description_ko`, `description_en`)은 기본으로 담기지 않는다. 방 520개
## 기준으로 응답이 248KB 에 이르러 라인 상한 256KB 에 육박한다. 상세 설명은
## `admin_get` 으로 방 하나씩 읽는다.

signal refresh_requested()
signal room_selected(room_id: String)

const CELL_SIZE := 20
const AUTO_INTERVAL := 15.0

@onready var _refresh: Button = %MapRefresh
@onready var _auto: CheckBox = %MapAuto
@onready var _bounds: Label = %MapBounds
@onready var _grid: GridContainer = %MapGrid
@onready var _detail: Label = %MapDetail
@onready var _blocked: Label = %MapBlocked
@onready var _factions: Label = %MapFactions

var _translator: TranslatorService = null
var _rooms: Array = []
var _selected_id := ""
var _auto_elapsed := 0.0


func _ready() -> void:
	_refresh.pressed.connect(func() -> void: refresh_requested.emit())


func bind(translator: TranslatorService) -> void:
	_translator = translator
	_translator.locale_changed.connect(_on_locale_changed)
	apply_texts()


func apply_texts() -> void:
	if _translator == null:
		return
	_refresh.text = _translator.t("ui.admin.map_refresh")
	_auto.text = _translator.t("ui.admin.map_auto")
	_render()


func show_map(payload: Dictionary) -> void:
	_rooms = Protocol.as_array(payload.get("rooms"))

	var bounds: Dictionary = Protocol.as_dict(payload.get("bounds"))
	_bounds.text = _translator.t("ui.admin.map_bounds", {
		"min_x": Protocol.as_int(bounds.get("min_x")),
		"max_x": Protocol.as_int(bounds.get("max_x")),
		"min_y": Protocol.as_int(bounds.get("min_y")),
		"max_y": Protocol.as_int(bounds.get("max_y")),
		"count": _rooms.size(),
	})
	_render()


func clear() -> void:
	_rooms = []
	_selected_id = ""
	_bounds.text = ""
	_render()


## 자동 갱신은 켜고 끌 수 있다. 켜져 있을 때만 주기적으로 요청한다.
func _process(delta: float) -> void:
	if not is_visible_in_tree() or not _auto.button_pressed:
		_auto_elapsed = 0.0
		return

	_auto_elapsed += delta
	if _auto_elapsed < AUTO_INTERVAL:
		return
	_auto_elapsed = 0.0
	refresh_requested.emit()


func _render() -> void:
	for child: Node in _grid.get_children():
		child.queue_free()
	if _translator == null:
		return

	if _rooms.is_empty():
		_grid.columns = 1
		_detail.text = _translator.t("ui.admin.map_no_selection")
		_blocked.text = ""
		_factions.text = ""
		return

	var by_coord: Dictionary = {}
	var min_x := 0
	var max_x := 0
	var min_y := 0
	var max_y := 0
	var first := true

	for value: Variant in _rooms:
		var room: Dictionary = Protocol.as_dict(value)
		var x := Protocol.as_int(room.get("x"))
		var y := Protocol.as_int(room.get("y"))
		by_coord[Vector2i(x, y)] = room
		if first:
			min_x = x
			max_x = x
			min_y = y
			max_y = y
			first = false
			continue
		min_x = mini(min_x, x)
		max_x = maxi(max_x, x)
		min_y = mini(min_y, y)
		max_y = maxi(max_y, y)

	_grid.columns = max_x - min_x + 1

	# y 를 큰 값부터 그린다. 북쪽이 위다
	for y: int in range(max_y, min_y - 1, -1):
		for x: int in range(min_x, max_x + 1):
			_grid.add_child(_cell(Vector2i(x, y), by_coord))

	_render_detail()


func _cell(at: Vector2i, by_coord: Dictionary) -> Control:
	if not by_coord.has(at):
		var blank := Control.new()
		blank.custom_minimum_size = Vector2(CELL_SIZE, CELL_SIZE)
		return blank

	var room: Dictionary = Protocol.as_dict(by_coord[at])
	var room_id := Protocol.as_string(room.get("id"))
	var room_type := Protocol.as_string(room.get("room_type"), Terrain.UNKNOWN)

	var button := Button.new()
	button.custom_minimum_size = Vector2(CELL_SIZE, CELL_SIZE)
	button.toggle_mode = true
	button.button_pressed = room_id == _selected_id
	button.text = _marker(room)
	# 지형 색을 글자색으로 준다. 테마에 관계없이 구분이 남는다
	button.add_theme_color_override("font_color", Terrain.color_of(room_type))
	button.tooltip_text = "%s (%d, %d)" % [room_type, at.x, at.y]
	button.pressed.connect(_on_cell_pressed.bind(room_id))
	return button


## 사람이 있으면 사람, 몬스터가 있으면 몬스터, 아니면 지형을 보인다.
func _marker(room: Dictionary) -> String:
	if Protocol.as_int(room.get("player_count")) > 0:
		return "🧍"
	if Protocol.as_int(room.get("creature_count")) > 0:
		return "⚔"
	return Terrain.icon_of(
		Protocol.as_string(room.get("room_type"), Terrain.UNKNOWN))


func _render_detail() -> void:
	var room := _selected_room()
	if room.is_empty():
		_detail.text = _translator.t("ui.admin.map_no_selection")
		_blocked.text = ""
		_factions.text = ""
		return

	_detail.text = _translator.t("ui.admin.map_detail", {
		"x": Protocol.as_int(room.get("x")),
		"y": Protocol.as_int(room.get("y")),
		"room_type": Protocol.as_string(room.get("room_type"), Terrain.UNKNOWN),
		"creature_count": Protocol.as_int(room.get("creature_count")),
		"player_count": Protocol.as_int(room.get("player_count")),
		"item_count": Protocol.as_int(room.get("item_count")),
	})

	var blocked := Protocol.as_array(room.get("blocked_exits"))
	_blocked.text = ("" if blocked.is_empty()
		else _translator.t("ui.admin.map_blocked",
			{"exits": ", ".join(_as_strings(blocked))}))

	var factions: Dictionary = Protocol.as_dict(room.get("factions"))
	_factions.text = ("" if factions.is_empty()
		else _translator.t("ui.admin.map_factions",
			{"factions": _pairs(factions)}))


func _selected_room() -> Dictionary:
	for value: Variant in _rooms:
		var room: Dictionary = Protocol.as_dict(value)
		if Protocol.as_string(room.get("id")) == _selected_id:
			return room
	return {}


func _as_strings(values: Array) -> Array[String]:
	var out: Array[String] = []
	for value: Variant in values:
		out.append(Protocol.as_string(value))
	return out


func _pairs(values: Dictionary) -> String:
	var parts: Array[String] = []
	for key: Variant in values:
		parts.append("%s %d" % [
			Protocol.as_string(key), Protocol.as_int(values[key])])
	return "  ".join(parts)


func _on_cell_pressed(room_id: String) -> void:
	_selected_id = room_id
	_render()
	room_selected.emit(room_id)


func _on_locale_changed(_locale: String) -> void:
	apply_texts()
