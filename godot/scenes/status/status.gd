class_name StatusScreen
extends VBoxContainer

## 상태 화면.
##
## `player_state` 가 필요한 값을 모두 담는다. 별도 요청 없이 상태 저장소를 본다.
##
## 레벨은 없다. 서버에 level 개념이 없고 `Player` 와 `Monster` 모두 필드가 없다.
## 상대적 강함은 능력치와 HP 로 나타낸다.

signal closed()
signal action_requested(verb: String, target_id: String, params: Dictionary)

## `players` 테이블의 `stat_strength` 계열 6개 컬럼에 대응한다.
const STATS: Array[String] = [
	"strength", "dexterity", "constitution",
	"intelligence", "wisdom", "charisma",
]

@onready var _title: Label = %StatusTitle
@onready var _close: Button = %StatusClose
@onready var _identity: Label = %IdentityLabel
@onready var _faction: Label = %FactionLabel
@onready var _hp: Label = %HpLabel
@onready var _stamina: Label = %StaminaLabel
@onready var _stats_title: Label = %StatsTitle
@onready var _stats: GridContainer = %StatRows
@onready var _bonuses_title: Label = %BonusesTitle
@onready var _bonuses: Label = %BonusesLabel
@onready var _effects_title: Label = %EffectsTitle
@onready var _effects: Label = %EffectsLabel
@onready var _rename_label: Label = %RenameLabel
@onready var _rename_edit: LineEdit = %RenameEdit
@onready var _rename_button: Button = %RenameButton
@onready var _notice: Label = %StatusNotice

var _state: GameStateStore = null
var _translator: TranslatorService = null


func _ready() -> void:
	_close.pressed.connect(func() -> void: closed.emit())
	_rename_button.pressed.connect(_on_rename_pressed)
	_rename_edit.text_submitted.connect(func(_text: String) -> void: _on_rename_pressed())


func bind(state: GameStateStore, translator: TranslatorService) -> void:
	_state = state
	_translator = translator

	_state.player_changed.connect(_refresh)
	_translator.locale_changed.connect(_on_locale_changed)

	apply_texts()


func apply_texts() -> void:
	if _translator == null:
		return
	_title.text = _translator.t("ui.status.title")
	_close.text = _translator.t("ui.status.close")
	_stats_title.text = _translator.t("ui.status.stats")
	_bonuses_title.text = _translator.t("ui.status.bonuses")
	_effects_title.text = _translator.t("ui.status.effects")
	_rename_label.text = _translator.t("ui.status.rename")
	_rename_button.text = _translator.t("ui.status.rename")
	_rename_edit.placeholder_text = _translator.t("ui.status.rename_placeholder")
	_refresh()


## 화면에 들어올 때 최신 상태를 요청한다.
func on_opened() -> void:
	_notice.text = ""
	action_requested.emit("request_state", "", {})


## 이름 변경이 거절됐다. 서버가 보낸 문구를 그대로 보인다.
func show_rejection(payload: Dictionary) -> void:
	if _translator == null:
		return
	var message: Dictionary = Protocol.as_dict(payload.get("message"))
	var text := _translator.render(message)
	# 거절에 번역 키가 없으면 코드별 안내로 떨어진다
	if text.is_empty():
		var key := RejectionPolicy.notice_key(
			Protocol.as_string(payload.get("reason_code")))
		text = "" if key.is_empty() else _translator.t(key)
	_notice.text = text


func _refresh() -> void:
	if _state == null or _translator == null:
		return

	var player := _state.player
	_identity.text = _translator.t("ui.status.identity", {
		"display_name": Protocol.as_string(player.get("display_name"), "?"),
		"username": Protocol.as_string(player.get("username"), "?"),
	})

	var faction := Protocol.as_string(player.get("faction_id"))
	_faction.text = (_translator.t("ui.status.no_faction") if faction.is_empty()
		else _translator.t("ui.status.faction", {"faction": faction}))

	_hp.text = _translator.t("ui.status.hp", {
		"hp": Protocol.as_int(player.get("hp")),
		"max_hp": Protocol.as_int(player.get("max_hp")),
	})
	_stamina.text = _translator.t("ui.status.stamina", {
		"stamina": Protocol.as_int(player.get("stamina")),
		"max_stamina": Protocol.as_int(player.get("max_stamina")),
	})

	_refresh_stats(Protocol.as_dict(player.get("stats")))
	_bonuses.text = _pairs_text(Protocol.as_dict(player.get("equipment_bonuses")))
	_effects.text = _pairs_text(Protocol.as_dict(player.get("temporary_effects")))


func _refresh_stats(stats: Dictionary) -> void:
	for child: Node in _stats.get_children():
		child.queue_free()

	for stat: String in STATS:
		var name := Label.new()
		name.custom_minimum_size = Vector2(110, 0)
		name.text = _translator.t("ui.stat.%s" % stat)
		_stats.add_child(name)

		var value := Label.new()
		value.text = str(Protocol.as_int(stats.get(stat)))
		_stats.add_child(value)


## 장비 보너스와 임시 효과는 자유 형태 dict 다. 서버가 형태를 고정하지 않으므로
## 키와 값을 그대로 나열한다.
func _pairs_text(values: Dictionary) -> String:
	if values.is_empty():
		return _translator.t("ui.status.none")

	var parts: Array[String] = []
	for key: Variant in values:
		parts.append("%s %s" % [Protocol.as_string(key), str(values[key])])
	return "  ".join(parts)


func _on_rename_pressed() -> void:
	var name := _rename_edit.text.strip_edges()
	if name.is_empty():
		return
	_notice.text = ""
	_rename_edit.text = ""
	action_requested.emit("changename", "", {"display_name": name})


func _on_locale_changed(_locale: String) -> void:
	apply_texts()
