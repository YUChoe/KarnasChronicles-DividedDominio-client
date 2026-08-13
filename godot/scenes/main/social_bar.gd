class_name SocialBar
extends VBoxContainer

## 대상이 없는 사회 동작.
##
## `who`, `players_here`, `unfollow`, `emote` 는 엔티티를 대상으로 하지 않으므로
## 규칙 테이블이 아니라 화면 버튼으로 배치한다.
##
## `emote` 는 목록 선택만 제공한다. 서버가 `emote_id` 를 12개로 제한하고 그
## 밖의 값을 `INVALID_PARAMS` 로 거절한다.

signal verb_requested(verb: String)
signal emote_requested(emote_id: String)

@onready var _who: Button = %WhoButton
@onready var _here: Button = %PlayersHereButton
@onready var _unfollow: Button = %UnfollowButton
@onready var _emotes: OptionButton = %EmoteOptions
@onready var _emote_send: Button = %EmoteButton

var _translator: TranslatorService = null


func _ready() -> void:
	_who.pressed.connect(func() -> void: verb_requested.emit("who"))
	_here.pressed.connect(func() -> void: verb_requested.emit("players_here"))
	_unfollow.pressed.connect(func() -> void: verb_requested.emit("unfollow"))
	_emote_send.pressed.connect(_on_emote_pressed)


func bind(translator: TranslatorService) -> void:
	_translator = translator
	_translator.locale_changed.connect(_on_locale_changed)

	_emotes.clear()
	for emote_id: String in Emotes.IDS:
		_emotes.add_item("")

	apply_texts()


func apply_texts() -> void:
	if _translator == null:
		return
	_who.text = _translator.t("ui.social.who")
	_here.text = _translator.t("ui.social.players_here")
	_unfollow.text = _translator.t("ui.social.unfollow")
	_emote_send.text = _translator.t("ui.social.emote")

	for index: int in range(Emotes.IDS.size()):
		_emotes.set_item_text(index,
			_translator.t(Emotes.label_key(Emotes.IDS[index])))


## 따라가는 대상이 있을 때만 중단 버튼을 노출한다.
func set_following(following: bool) -> void:
	_unfollow.visible = following


func _on_emote_pressed() -> void:
	var index := _emotes.selected
	if index < 0 or index >= Emotes.IDS.size():
		return
	emote_requested.emit(Emotes.IDS[index])


func _on_locale_changed(_locale: String) -> void:
	apply_texts()
