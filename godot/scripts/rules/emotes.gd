class_name Emotes
extends RefCounted

## 감정 표현 목록.
##
## 서버가 `emote_id` 를 이 12개로 제한한다(`commands/actions/social.py` 의
## `EMOTE_IDS`). 목록에 없는 값은 `INVALID_PARAMS` 로 거절되므로 클라이언트는
## 목록 선택만 제공하고 자유 문자 입력을 받지 않는다.
##
## 서버가 목록을 늘리면 이 상수와 `ui.emote.*` 번역 키를 함께 늘린다. 테스트가
## 둘의 짝을 확인한다.

const IDS: Array[String] = [
	"wave",
	"bow",
	"nod",
	"shake_head",
	"smile",
	"laugh",
	"cry",
	"sigh",
	"shrug",
	"clap",
	"dance",
	"salute",
]

const LABEL_PREFIX := "ui.emote."


static func label_key(emote_id: String) -> String:
	return LABEL_PREFIX + emote_id
