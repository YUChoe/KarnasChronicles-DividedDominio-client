class_name SocialBar
extends VBoxContainer

## 대상이 없는 사회 동작.
##
## `unfollow` 와 `emote` 는 엔티티를 대상으로 하지 않으므로 규칙 테이블이 아니라
## 화면 버튼으로 배치한다.
##
## `emote` 는 목록 선택만 제공한다. 서버가 `emote_id` 를 정해진 목록으로 제한하고
## 그 밖의 값을 `INVALID_PARAMS` 로 거절한다.
##
## 항목이 56개라 한 목록에 담으면 고르기 어렵다. 그룹을 먼저 고르고 그 안에서
## 고른다. 그룹은 `Emotes.GROUPS` 가 정한다.

signal verb_requested(verb: String)
signal emote_requested(emote_id: String)

@onready var _unfollow: Button = %UnfollowButton
@onready var _groups: OptionButton = %GroupOptions
@onready var _emotes: OptionButton = %EmoteOptions
@onready var _emote_send: Button = %EmoteButton

var _translator: TranslatorService = null


func _ready() -> void:
	_unfollow.pressed.connect(func() -> void: verb_requested.emit("unfollow"))
	_emote_send.pressed.connect(_on_emote_pressed)
	_groups.item_selected.connect(_on_group_selected)


func bind(translator: TranslatorService) -> void:
	_translator = translator
	_translator.locale_changed.connect(_on_locale_changed)

	_groups.clear()
	for group: String in Emotes.GROUPS:
		_groups.add_item("")
	_groups.selected = 0

	_rebuild_emotes()
	apply_texts()


func apply_texts() -> void:
	if _translator == null:
		return
	_unfollow.text = _translator.t("ui.social.unfollow")
	_emote_send.text = _translator.t("ui.social.emote")

	for index: int in range(Emotes.GROUPS.size()):
		_groups.set_item_text(index,
			_translator.t(Emotes.group_label_key(Emotes.GROUPS[index])))

	var ids := _current_ids()
	for index: int in range(ids.size()):
		_emotes.set_item_text(index,
			_translator.t(Emotes.label_key(Protocol.as_string(ids[index]))))


## 따라가는 대상이 있을 때만 중단 버튼을 노출한다.
func set_following(following: bool) -> void:
	_unfollow.visible = following


## 고른 그룹의 항목. 그룹 선택이 없으면 첫 그룹이다.
func _current_ids() -> Array:
	var index := maxi(0, _groups.selected)
	if index >= Emotes.GROUPS.size():
		return []
	return Emotes.ids_of(Emotes.GROUPS[index])


func _rebuild_emotes() -> void:
	_emotes.clear()
	for _id: Variant in _current_ids():
		_emotes.add_item("")
	if _emotes.item_count > 0:
		_emotes.selected = 0


func _on_group_selected(_index: int) -> void:
	_rebuild_emotes()
	apply_texts()


func _on_emote_pressed() -> void:
	var ids := _current_ids()
	var index := _emotes.selected
	if index < 0 or index >= ids.size():
		return
	emote_requested.emit(Protocol.as_string(ids[index]))


func _on_locale_changed(_locale: String) -> void:
	apply_texts()
