class_name Emotes
extends RefCounted

## 감정 표현과 빠른 대화 목록.
##
## 서버가 `emote_id` 를 이 목록으로 제한한다(`commands/actions/social.py` 의
## `EMOTE_IDS`). 목록에 없는 값은 `INVALID_PARAMS` 로 거절되므로 클라이언트는
## 목록 선택만 제공하고 자유 문자 입력을 받지 않는다.
##
## 빠른 대화는 말로 읽힌다. 로그에 `{이름}: 문장` 으로 나오며 채팅 줄과 같은
## 모양이다. 로그 탭이 "전체" 일 때 채팅 입력이 감춰지므로 그 자리를 이것이
## 채운다. 문장이 번역 키라 서로 다른 언어를 쓰는 사람끼리도 통한다.
##
## Wolfenstein: Enemy Territory 의 quick chat 을 옮긴 것이다. 총기·폭약·차량·
## 병과에 해당하는 항목은 대응물이 없어 뺐다.
##
## 서버가 목록을 늘리면 이 상수와 번역 키를 함께 늘린다. 테스트가 짝을 본다.

## 화면이 묶어 보여주는 순서
const GROUPS: Array[String] = [
	"action",
	"report",
	"request",
	"order",
	"reply",
	"role",
]

## 그룹 → 항목
const BY_GROUP := {
	"action": ["wave", "bow", "nod", "shake_head", "smile", "laugh", "cry", "sigh", "shrug", "clap", "dance", "salute"],
	"report": ["path_cleared", "enemy_weakened", "all_clear", "incoming", "fire_set", "holding", "advancing", "under_attack", "traps_cleared", "enemy_disguised"],
	"request": ["need_healing", "need_arrows", "need_help", "need_smith", "cover_me", "hold", "where_to", "need_scout"],
	"order": ["follow_me", "lets_go", "make_way", "clear_path", "defend_here", "disarm_trap", "reinforce_attack", "reinforce_defence"],
	"reply": ["yes", "no", "thanks", "welcome", "sorry", "oops", "hail", "farewell", "well_struck", "cheer", "well_fought", "acknowledged", "declined", "done"],
	"role": ["i_will_fight", "i_will_heal", "i_will_scout", "i_will_carry"],
}

## 전체 목록. 그룹 순서를 따른다
const IDS: Array[String] = [
	# action
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
	# report
	"path_cleared",
	"enemy_weakened",
	"all_clear",
	"incoming",
	"fire_set",
	"holding",
	"advancing",
	"under_attack",
	"traps_cleared",
	"enemy_disguised",
	# request
	"need_healing",
	"need_arrows",
	"need_help",
	"need_smith",
	"cover_me",
	"hold",
	"where_to",
	"need_scout",
	# order
	"follow_me",
	"lets_go",
	"make_way",
	"clear_path",
	"defend_here",
	"disarm_trap",
	"reinforce_attack",
	"reinforce_defence",
	# reply
	"yes",
	"no",
	"thanks",
	"welcome",
	"sorry",
	"oops",
	"hail",
	"farewell",
	"well_struck",
	"cheer",
	"well_fought",
	"acknowledged",
	"declined",
	"done",
	# role
	"i_will_fight",
	"i_will_heal",
	"i_will_scout",
	"i_will_carry",
]

const LABEL_PREFIX := "ui.emote."
const GROUP_LABEL_PREFIX := "ui.emote.group."


static func label_key(emote_id: String) -> String:
	return LABEL_PREFIX + emote_id


static func group_label_key(group: String) -> String:
	return GROUP_LABEL_PREFIX + group


## 그룹의 항목. 모르는 그룹이면 빈 배열이다.
static func ids_of(group: String) -> Array:
	return BY_GROUP.get(group, [])
