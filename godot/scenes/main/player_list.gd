class_name PlayerList
extends PanelContainer

## `who_result` 표시.
##
## 귓속말 대상의 Entity_UUID 를 확보하는 경로다. uuid 를 화면에 적지 않고 행을
## 눌러 대상으로 고르게 한다.
##
## 서버가 좌표를 보내지 않는다. 플레이어 위치를 다른 플레이어에게 노출하지 않기
## 위한 조치이므로 표시할 좌표가 없다.

signal whisper_requested(player_id: String)

@onready var _title: Label = %PlayersTitle
@onready var _rows: VBoxContainer = %PlayerRows
@onready var _empty: Label = %PlayersEmpty
@onready var _close: Button = %PlayersClose

var _translator: TranslatorService = null
var _players: Array = []


func _ready() -> void:
	_close.pressed.connect(func() -> void: visible = false)
	visible = false


func bind(translator: TranslatorService) -> void:
	_translator = translator
	_translator.locale_changed.connect(_on_locale_changed)
	apply_texts()


func apply_texts() -> void:
	if _translator == null:
		return
	_title.text = _translator.t("ui.players.title")
	_empty.text = _translator.t("ui.players.empty")
	_close.text = _translator.t("ui.players.close")
	_rebuild()


func show_players(players: Array) -> void:
	_players = players
	_rebuild()
	visible = true


func _rebuild() -> void:
	for child: Node in _rows.get_children():
		child.queue_free()

	_empty.visible = _players.is_empty()
	if _translator == null:
		return

	for value: Variant in _players:
		var player: Dictionary = Protocol.as_dict(value)
		var id := Protocol.as_string(player.get("id"))
		if id.is_empty():
			continue

		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)

		var name_label := Label.new()
		name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		name_label.text = _row_text(player)
		row.add_child(name_label)

		var button := Button.new()
		button.text = _translator.t("ui.players.whisper")
		button.pressed.connect(_on_whisper_pressed.bind(id))
		row.add_child(button)

		_rows.add_child(row)


func _row_text(player: Dictionary) -> String:
	var display_name := Protocol.as_string(player.get("display_name"))
	var username := Protocol.as_string(player.get("username"), "?")
	var faction := Protocol.as_string(player.get("faction_id"))
	var label := username if display_name.is_empty() else "%s (%s)" % [
		display_name, username]
	return label if faction.is_empty() else "%s  %s" % [label, faction]


func _on_whisper_pressed(player_id: String) -> void:
	whisper_requested.emit(player_id)
	visible = false


func _on_locale_changed(_locale: String) -> void:
	apply_texts()
