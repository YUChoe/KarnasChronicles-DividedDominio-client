class_name AdminCrudForm
extends VBoxContainer

## 리소스 CRUD 폼.
##
## 표에서 고른 행을 채워 수정하거나 빈 폼으로 생성한다. 컬럼 목록은 표가 받은
## 행에서 온다. 리소스마다 컬럼이 다르고 서버가 스키마를 따로 알려주지 않기
## 때문이다. 그래서 새 행 폼도 한 번 조회한 뒤에야 만들 수 있다.
##
## 기본키 처리가 리소스마다 다르다. uuid 를 생성하는 리소스는 키 입력을 숨기고,
## 그렇지 않은 리소스는 생성 시 키를 받는다. 수정에서는 어느 경우든 키를 값에
## 담지 않는다. 서버가 `VALIDATION_FAILED` 로 거절한다.

signal create_requested(resource: String, values: Dictionary)
signal update_requested(resource: String, key: Dictionary, values: Dictionary)
signal delete_requested(resource: String, key: Dictionary)

@onready var _title: Label = %FormTitle
@onready var _new: Button = %FormNew
@onready var _save: Button = %FormSave
@onready var _delete: Button = %FormDelete
@onready var _fields: GridContainer = %FormFields
@onready var _notice: Label = %FormNotice
@onready var _references: VBoxContainer = %FormReferences

var _translator: TranslatorService = null
var _resource := ""
## 컬럼 → 입력란
var _inputs: Dictionary = {}
var _columns: Array[String] = []
## 수정 대상의 기본키. 비어 있으면 생성 모드다
var _key: Dictionary = {}
## 삭제는 두 번 눌러야 실행된다
var _delete_armed := false


func _ready() -> void:
	_new.pressed.connect(_on_new_pressed)
	_save.pressed.connect(_on_save_pressed)
	_delete.pressed.connect(_on_delete_pressed)


func bind(translator: TranslatorService) -> void:
	_translator = translator
	_translator.locale_changed.connect(_on_locale_changed)
	apply_texts()


func apply_texts() -> void:
	if _translator == null:
		return
	_new.text = _translator.t("ui.admin.form_new")
	_delete.text = _translator.t("ui.admin.form_delete")
	_refresh_title()
	_refresh_save_label()


## 표가 리소스를 바꿨다. 컬럼과 값을 비운다.
func set_resource(resource: String) -> void:
	_resource = resource
	_columns.clear()
	_key = {}
	_rebuild({})
	_clear_notice()


## 표에서 행을 골랐다. 수정 모드로 채운다.
func show_row(resource: String, row: Dictionary) -> void:
	_resource = resource
	_columns = _column_order(row)
	_key = AdminResources.key_of(resource, row)
	_rebuild(row)
	_clear_notice()


func show_saved() -> void:
	_clear_notice()
	_notice.text = _translator.t("ui.admin.form_saved")


func show_deleted() -> void:
	_key = {}
	_rebuild({})
	_clear_notice()
	_notice.text = _translator.t("ui.admin.form_deleted")


## `REFERENCED` 거절의 참조 목록을 보인다. 무엇이 막고 있는지 알려야 한다.
func show_references(references: Array) -> void:
	_clear_notice()
	if references.is_empty():
		return

	var title := Label.new()
	title.text = _translator.t("ui.admin.references")
	_references.add_child(title)

	for value: Variant in references:
		var entry: Dictionary = Protocol.as_dict(value)
		var line := Label.new()
		line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		line.text = _translator.t("ui.admin.reference_row", {
			"resource": Protocol.as_string(entry.get("resource")),
			"columns": ", ".join(_as_strings(
				Protocol.as_array(entry.get("columns")))),
			"count": Protocol.as_int(entry.get("count")),
		})

		var samples := Protocol.as_array(entry.get("samples"))
		if not samples.is_empty():
			line.text += "  " + _translator.t("ui.admin.reference_samples",
				{"samples": _sample_text(samples)})
		_references.add_child(line)


func _sample_text(samples: Array) -> String:
	var parts: Array[String] = []
	for value: Variant in samples:
		var sample: Dictionary = Protocol.as_dict(value)
		var pairs: Array[String] = []
		for key: Variant in sample:
			pairs.append("%s=%s" % [
				Protocol.as_string(key), str(sample[key])])
		parts.append("(%s)" % ", ".join(pairs))
	return " ".join(parts)


func _as_strings(values: Array) -> Array[String]:
	var out: Array[String] = []
	for value: Variant in values:
		out.append(Protocol.as_string(value))
	return out


## 행마다 키가 다를 수 있으므로 처음 나온 순서를 지킨다.
func _column_order(row: Dictionary) -> Array[String]:
	var order: Array[String] = []
	for key: Variant in row:
		var name := Protocol.as_string(key)
		if not name.is_empty() and not order.has(name):
			order.append(name)
	return order


func _rebuild(row: Dictionary) -> void:
	for child: Node in _fields.get_children():
		child.queue_free()
	_inputs.clear()
	if _translator == null:
		return

	var creating := _key.is_empty()

	for column: String in _columns:
		if not AdminResources.writable(_resource, column, creating):
			continue

		var label := Label.new()
		label.text = column
		_fields.add_child(label)

		var edit := LineEdit.new()
		edit.custom_minimum_size = Vector2(240, 0)
		edit.text = _value_text(row.get(column))
		_fields.add_child(edit)
		_inputs[column] = edit

	_refresh_title()
	_refresh_save_label()
	_delete.disabled = creating
	_delete_armed = false


func _value_text(value: Variant) -> String:
	if value == null:
		return ""
	if value is String:
		return value
	if value is Array or value is Dictionary:
		# 배열과 오브젝트는 JSON 으로 보여 주고 그대로 되돌려 보낸다
		return JSON.stringify(value)
	if value is bool:
		return "true" if value else "false"
	return str(value)


func _refresh_title() -> void:
	if _translator == null:
		return
	if _columns.is_empty():
		_title.text = _translator.t("ui.admin.form_no_row")
		return
	_title.text = _translator.t("ui.admin.form_title" if not _key.is_empty()
		else "ui.admin.form_new")


func _refresh_save_label() -> void:
	if _translator == null:
		return
	_save.text = _translator.t("ui.admin.form_update" if not _key.is_empty()
		else "ui.admin.form_create")
	_save.disabled = _columns.is_empty()


## 입력값을 되돌려 보낼 형태로 만든다.
##
## JSON 으로 보인 값은 JSON 으로 되돌린다. 그 밖에는 문자열로 보낸다. 정수와
## boolean 컬럼의 형 변환은 서버가 컬럼 타입을 알고 처리한다.
func _collect_values() -> Dictionary:
	var values: Dictionary = {}
	for column: Variant in _inputs:
		var name := Protocol.as_string(column)
		var edit: LineEdit = _inputs[column]
		var text := edit.text
		if text.is_empty():
			continue

		if text.begins_with("[") or text.begins_with("{"):
			var parsed: Variant = JSON.parse_string(text)
			if parsed != null:
				values[name] = parsed
				continue
		values[name] = text
	return values


func _clear_notice() -> void:
	_notice.text = ""
	for child: Node in _references.get_children():
		child.queue_free()


func _on_new_pressed() -> void:
	if _columns.is_empty():
		return
	_key = {}
	_rebuild({})
	_clear_notice()
	if AdminResources.generates_key(_resource):
		_notice.text = _translator.t("ui.admin.form_key_generated")


func _on_save_pressed() -> void:
	if _columns.is_empty():
		return
	_clear_notice()
	var values := _collect_values()

	if not _key.is_empty():
		update_requested.emit(_resource, _key, values)
		return

	# 서버가 키를 만들지 않는 리소스는 키가 모두 채워져야 한다
	if not AdminResources.generates_key(_resource):
		var key := AdminResources.key_of(_resource, values)
		if not AdminResources.has_full_key(_resource, key):
			_notice.text = _translator.t("ui.admin.form_key_missing")
			return

	create_requested.emit(_resource, values)


func _on_delete_pressed() -> void:
	if _key.is_empty():
		return
	if not _delete_armed:
		_delete_armed = true
		_clear_notice()
		_notice.text = _translator.t("ui.admin.form_confirm_delete")
		return
	_delete_armed = false
	_clear_notice()
	delete_requested.emit(_resource, _key)


func _on_locale_changed(_locale: String) -> void:
	apply_texts()
