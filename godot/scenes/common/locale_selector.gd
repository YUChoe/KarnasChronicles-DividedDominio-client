class_name LocaleSelector
extends HBoxContainer

## Locale 전환 UI.
##
## 선택은 접속 설정에 저장되고 다음 실행에 복원된다. 전환은 화면을 다시 그릴 뿐
## 재접속을 요구하지 않는다. 서버는 locale 을 번역에 쓰지 않는다.
##
## 언어 이름은 그 언어로 적는다. 현재 locale 이 무엇이든 자기 언어를 알아볼 수
## 있어야 하므로 이 목록만은 번역하지 않는다.

signal locale_selected(locale: String)

const LOCALE_LABELS := {
	"en": "English",
	"ko": "한국어",
}

@onready var _label: Label = %LocaleLabel
@onready var _options: OptionButton = %LocaleOptions

var _translator: TranslatorService = null
## 항목 인덱스 → locale
var _locales: Array[String] = []


func bind(translator: TranslatorService) -> void:
	_translator = translator
	_translator.locale_changed.connect(_on_locale_changed)

	_options.clear()
	_locales.clear()
	for locale: String in TranslatorService.SUPPORTED_LOCALES:
		_options.add_item(Protocol.as_string(LOCALE_LABELS.get(locale), locale))
		_locales.append(locale)

	_options.item_selected.connect(_on_item_selected)
	_select_current()
	apply_texts()


func apply_texts() -> void:
	if _translator == null:
		return
	_label.text = _translator.t("ui.locale.label")


func _select_current() -> void:
	var index := _locales.find(_translator.get_locale())
	if index >= 0:
		_options.selected = index


func _on_item_selected(index: int) -> void:
	if index < 0 or index >= _locales.size():
		return
	locale_selected.emit(_locales[index])


func _on_locale_changed(_locale: String) -> void:
	_select_current()
	apply_texts()
