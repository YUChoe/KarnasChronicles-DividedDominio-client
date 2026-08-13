class_name AdminStatsView
extends VBoxContainer

## 통계와 실시간 액션.
##
## `admin_stats_result` 는 `AdminManager` 의 반환값을 그대로 담는다. 서버가
## 가공하지 않으므로 화면도 가공하지 않고 `counts` 만 표로 보인다. 나머지 항목
## (`rooms`, `objects`, `players`, `engine`, `timestamp`)은 형태가 자유로워 원본
## 그대로 나열한다.
##
## 실시간 액션 14종은 `AdminActions` 의 명세로 입력란을 만든다.

signal stats_requested()
signal action_requested(action: String, params: Dictionary)

@onready var _stats_title: Label = %StatsTitle
@onready var _refresh: Button = %StatsRefresh
@onready var _counts: GridContainer = %StatsCounts
@onready var _raw: Label = %StatsRaw
@onready var _action_title: Label = %ActionTitle
@onready var _actions: OptionButton = %ActionOptions
@onready var _params: GridContainer = %ActionParams
@onready var _hint: Label = %ActionHint
@onready var _run: Button = %ActionRun
@onready var _result: Label = %ActionResult

var _translator: TranslatorService = null
## params 이름 → 입력란
var _inputs: Dictionary = {}


func _ready() -> void:
	_refresh.pressed.connect(func() -> void: stats_requested.emit())
	_run.pressed.connect(_on_run_pressed)
	_actions.item_selected.connect(_on_action_selected)


func bind(translator: TranslatorService) -> void:
	_translator = translator
	_translator.locale_changed.connect(_on_locale_changed)

	_actions.clear()
	for action: String in AdminActions.ORDER:
		_actions.add_item(action)

	apply_texts()
	_rebuild_params()


func apply_texts() -> void:
	if _translator == null:
		return
	_stats_title.text = _translator.t("ui.admin.stats_title")
	_refresh.text = _translator.t("ui.admin.stats_refresh")
	_action_title.text = _translator.t("ui.admin.action_title")
	_run.text = _translator.t("ui.admin.action_run")
	if _counts.get_child_count() == 0:
		_raw.text = _translator.t("ui.admin.stats_empty")
	_rebuild_params()


func show_stats(payload: Dictionary) -> void:
	for child: Node in _counts.get_children():
		child.queue_free()

	var counts: Dictionary = Protocol.as_dict(payload.get("counts"))
	for key: Variant in counts:
		var name := Label.new()
		name.custom_minimum_size = Vector2(140, 0)
		name.text = Protocol.as_string(key)
		_counts.add_child(name)

		var value := Label.new()
		value.text = str(Protocol.as_int(counts[key]))
		_counts.add_child(value)

	# `counts` 밖의 항목은 형태가 자유롭다. 원본을 그대로 보인다
	var rest := payload.duplicate()
	rest.erase("type")
	rest.erase("seq")
	rest.erase("counts")
	_raw.text = "" if rest.is_empty() else JSON.stringify(rest, "  ")


func show_action_result(payload: Dictionary) -> void:
	if _translator == null:
		return
	var data: Dictionary = Protocol.as_dict(payload.get("data"))
	_result.text = _translator.t("ui.admin.action_result", {
		"action": Protocol.as_string(payload.get("action")),
		"data": "" if data.is_empty() else JSON.stringify(data),
	})


func clear_result() -> void:
	_result.text = ""


func current_action() -> String:
	var index := maxi(0, _actions.selected)
	if index >= AdminActions.ORDER.size():
		return AdminActions.ORDER[0]
	return AdminActions.ORDER[index]


func _rebuild_params() -> void:
	for child: Node in _params.get_children():
		child.queue_free()
	_inputs.clear()
	if _translator == null:
		return

	var action := current_action()
	var names := AdminActions.params_of(action)

	if names.is_empty():
		_hint.text = _translator.t("ui.admin.action_no_params")
	elif AdminActions.NEEDS_ONLINE_PLAYER.has(action):
		_hint.text = _translator.t("ui.admin.action_needs_online")
	else:
		_hint.text = ""

	for name: String in names:
		var label := Label.new()
		label.text = name
		_params.add_child(label)

		var edit := LineEdit.new()
		edit.custom_minimum_size = Vector2(200, 0)
		_params.add_child(edit)
		_inputs[name] = edit


func _on_action_selected(_index: int) -> void:
	clear_result()
	_rebuild_params()


func _on_run_pressed() -> void:
	var action := current_action()
	var inputs: Dictionary = {}
	for name: Variant in _inputs:
		var edit: LineEdit = _inputs[name]
		inputs[Protocol.as_string(name)] = edit.text
	clear_result()
	action_requested.emit(action, AdminActions.build_params(action, inputs))


func _on_locale_changed(_locale: String) -> void:
	apply_texts()
