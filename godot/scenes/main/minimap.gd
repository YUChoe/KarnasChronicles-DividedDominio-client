class_name Minimap
extends VBoxContainer

## 좌표 기반 미니맵.
##
## 서버는 텍스트 미니맵을 보내지 않고 `nearby_rooms` 의 좌표와 지형만 보낸다.
## 렌더링은 클라이언트 몫이다.
##
## 북쪽이 y 증가 방향이므로 화면에 그릴 때 y 축을 반전한다. 위쪽 행이 큰 y 다.
##
## 현재 위치는 `room.x`, `room.y` 와 비교해 판별한다. 서버가 현재 방을
## `nearby_rooms` 에 포함하는지에 의존하지 않는다.

const MARKER_CURRENT := "📍"
const CELL_EMPTY := "·"
const CELL_SIZE := 22

@onready var _title: Label = %MinimapTitle
@onready var _grid: GridContainer = %MinimapGrid

var _translator: TranslatorService = null


func bind(translator: TranslatorService) -> void:
	_translator = translator
	apply_texts()


func apply_texts() -> void:
	if _translator == null:
		return
	_title.text = _translator.t("ui.room.minimap")


## `nearby_rooms` 는 좌표와 지형만 담은 배열이다. 현재 방은 별도로 받는다.
func render(nearby_rooms: Array, current_x: int, current_y: int) -> void:
	for child: Node in _grid.get_children():
		child.queue_free()

	var terrain_at: Dictionary = {}
	var min_x := current_x
	var max_x := current_x
	var min_y := current_y
	var max_y := current_y

	for value: Variant in nearby_rooms:
		var room: Dictionary = Protocol.as_dict(value)
		var x := Protocol.as_int(room.get("x"))
		var y := Protocol.as_int(room.get("y"))
		terrain_at[Vector2i(x, y)] = Protocol.as_string(
			room.get("room_type"), Terrain.UNKNOWN)
		min_x = mini(min_x, x)
		max_x = maxi(max_x, x)
		min_y = mini(min_y, y)
		max_y = maxi(max_y, y)

	_grid.columns = max_x - min_x + 1

	# y 를 큰 값부터 그린다. 북쪽이 위다
	for y: int in range(max_y, min_y - 1, -1):
		for x: int in range(min_x, max_x + 1):
			_grid.add_child(_cell(Vector2i(x, y), terrain_at,
				x == current_x and y == current_y))


func _cell(at: Vector2i, terrain_at: Dictionary, is_current: bool) -> Label:
	var cell := Label.new()
	cell.custom_minimum_size = Vector2(CELL_SIZE, CELL_SIZE)
	cell.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

	if is_current:
		cell.text = MARKER_CURRENT
		cell.tooltip_text = "(%d, %d)" % [at.x, at.y]
		return cell

	if not terrain_at.has(at):
		cell.text = CELL_EMPTY
		return cell

	var room_type := Protocol.as_string(terrain_at[at], Terrain.UNKNOWN)
	cell.text = Terrain.icon_of(room_type)
	cell.tooltip_text = "%s (%d, %d)" % [room_type, at.x, at.y]
	return cell
