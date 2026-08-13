class_name AdminResourceTable
extends VBoxContainer

## 리소스 테이블.
##
## 8개 리소스의 행을 DB 컬럼 그대로 보인다. 게임 채널의 엔티티 스키마와 달리
## 언어별 dict 로 묶지 않고 `name_en`, `name_ko` 처럼 원본 컬럼명을 유지한다.
## 어드민은 데이터를 편집하는 도구이므로 원본 구조가 그대로 보여야 한다.
##
## `page` 는 1부터 시작하고 `page_size` 기본값은 50, 상한은 200 이다. 한 라인의
## 상한이 256KB 라 열어 두면 응답이 프레이밍 한계를 넘는다.
##
## `filter` 는 컬럼별 동등 비교만 지원한다. 키가 SQL 에 직접 들어가므로 서버가
## 실제 컬럼과 대조한 뒤에만 쓰고, 없는 컬럼이면 `INVALID_PARAMS` 로 거절한다.

signal query_requested(
	resource: String, page: int, filter: Dictionary, sort: Dictionary)
signal row_selected(resource: String, row: Dictionary)

const PAGE_SIZE := 50

@onready var _resource_label: Label = %ResourceLabel
@onready var _resources: OptionButton = %ResourceOptions
@onready var _filter_edit: LineEdit = %FilterEdit
@onready var _sort_edit: LineEdit = %SortEdit
@onready var _sort_desc: CheckBox = %SortDesc
@onready var _apply: Button = %ApplyButton
@onready var _page_label: Label = %PageLabel
@onready var _prev: Button = %PrevButton
@onready var _next: Button = %NextButton
@onready var _grid: GridContainer = %TableGrid
@onready var _empty: Label = %TableEmpty

var _translator: TranslatorService = null
var _page := 1
var _total := 0
var _rows: Array = []
## 표시 순서를 고정하기 위한 컬럼 목록
var _columns: Array[String] = []


func _ready() -> void:
	_apply.pressed.connect(_on_apply_pressed)
	_prev.pressed.connect(_on_prev_pressed)
	_next.pressed.connect(_on_next_pressed)
	_resources.item_selected.connect(_on_resource_selected)


func bind(translator: TranslatorService) -> void:
	_translator = translator
	_translator.locale_changed.connect(_on_locale_changed)

	_resources.clear()
	for resource: String in Protocol.ADMIN_RESOURCES:
		_resources.add_item(resource)

	apply_texts()


func apply_texts() -> void:
	if _translator == null:
		return
	_resource_label.text = _translator.t("ui.admin.table_resource")
	_filter_edit.placeholder_text = _translator.t("ui.admin.table_filter")
	_sort_edit.placeholder_text = _translator.t("ui.admin.table_sort")
	_sort_desc.text = _translator.t("ui.admin.table_sort_desc")
	_apply.text = _translator.t("ui.admin.table_apply")
	_prev.text = _translator.t("ui.admin.table_prev")
	_next.text = _translator.t("ui.admin.table_next")
	_empty.text = _translator.t("ui.admin.table_empty")
	_render()


func current_resource() -> String:
	var index := maxi(0, _resources.selected)
	if index >= Protocol.ADMIN_RESOURCES.size():
		return Protocol.ADMIN_RESOURCES[0]
	return Protocol.ADMIN_RESOURCES[index]


## 첫 조회. 화면에 들어올 때 부른다.
func request_first_page() -> void:
	_page = 1
	_emit_query()


func show_result(payload: Dictionary) -> void:
	if Protocol.as_string(payload.get("resource")) != current_resource():
		return

	_page = maxi(1, Protocol.as_int(payload.get("page"), 1))
	_total = Protocol.as_int(payload.get("total"))
	_rows = Protocol.as_array(payload.get("rows"))
	_columns = _column_order()
	_render()


func clear() -> void:
	_rows = []
	_total = 0
	_page = 1
	_columns.clear()
	_render()


## 컬럼 순서를 첫 행의 키 순서로 고정한다. 행마다 키가 다를 수 있으므로 모든
## 행의 키를 합치되 처음 나온 순서를 지킨다.
func _column_order() -> Array[String]:
	var order: Array[String] = []
	for value: Variant in _rows:
		var row: Dictionary = Protocol.as_dict(value)
		for key: Variant in row:
			var name := Protocol.as_string(key)
			if not name.is_empty() and not order.has(name):
				order.append(name)
	return order


func _render() -> void:
	for child: Node in _grid.get_children():
		child.queue_free()
	if _translator == null:
		return

	_empty.visible = _rows.is_empty()
	var pages := maxi(1, ceili(float(_total) / float(PAGE_SIZE)))
	_page_label.text = _translator.t("ui.admin.table_page", {
		"page": _page, "pages": pages, "total": _total,
	})
	_prev.disabled = _page <= 1
	_next.disabled = _page >= pages

	if _rows.is_empty():
		_grid.columns = 1
		return

	_grid.columns = _columns.size()

	for name: String in _columns:
		var header := Label.new()
		header.text = name
		_grid.add_child(header)

	for value: Variant in _rows:
		var row: Dictionary = Protocol.as_dict(value)
		for name: String in _columns:
			_grid.add_child(_cell(row, name))


func _cell(row: Dictionary, column: String) -> Control:
	var button := Button.new()
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.text = _cell_text(row.get(column))
	button.tooltip_text = "%s = %s" % [column, button.text]
	button.pressed.connect(func() -> void:
		row_selected.emit(current_resource(), row))
	return button


func _cell_text(value: Variant) -> String:
	if value == null:
		return ""
	if value is String:
		return value
	if value is bool:
		return "true" if value else "false"
	return str(value)


## `컬럼=값` 한 쌍만 받는다. 계약이 동등 비교만 지원한다.
func _parse_filter() -> Dictionary:
	var text := _filter_edit.text.strip_edges()
	if text.is_empty() or not text.contains("="):
		return {}

	var parts := text.split("=", true, 1)
	var column := parts[0].strip_edges()
	var value := parts[1].strip_edges()
	if column.is_empty():
		return {}
	return {column: value}


func _parse_sort() -> Dictionary:
	var field := _sort_edit.text.strip_edges()
	if field.is_empty():
		return {}
	return {
		"field": field,
		"order": "desc" if _sort_desc.button_pressed else "asc",
	}


func _emit_query() -> void:
	query_requested.emit(
		current_resource(), _page, _parse_filter(), _parse_sort())


func _on_apply_pressed() -> void:
	_page = 1
	_emit_query()


func _on_prev_pressed() -> void:
	_page = maxi(1, _page - 1)
	_emit_query()


func _on_next_pressed() -> void:
	_page += 1
	_emit_query()


func _on_resource_selected(_index: int) -> void:
	_page = 1
	clear()
	_emit_query()


func _on_locale_changed(_locale: String) -> void:
	apply_texts()
