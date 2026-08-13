class_name RejectionPolicy
extends RefCounted

## 거절 사유 코드별 처리 방침.
##
## 낙관적 버튼 구성이므로 `NOT_APPLICABLE` 은 정상 동작 범위다. 클라이언트의
## 버튼 추론이 서버 규칙과 어긋났다는 뜻이며 조용히 버튼을 지운다. 오류로
## 표시하지 않는다.
##
## 여기서는 무엇을 할지만 정하고 실제 처리는 화면과 조립 지점이 한다. 규칙과
## 실행을 나눠야 서버 없이 이 표를 검증할 수 있다.

enum Effect {
	## 해당 버튼을 지운다. 오류로 표시하지 않는다
	REMOVE_BUTTON,
	## `look` verb 로 방 정보를 재동기화한다
	RESYNC_ROOM,
	## 로그인 화면으로 전환한다
	RETURN_TO_LOGIN,
	## 안내를 표시한다
	SHOW_NOTICE,
	## 턴 대기를 표시한다
	SHOW_TURN_WAIT,
	## 상점 UI 에 부족액을 표시한다
	SHOW_SHORTFALL,
	## 수량 입력 상한을 조정한다
	ADJUST_QUANTITY,
	## 교체 확인을 제안한다
	CONFIRM_REPLACE,
	## 남은 시간을 표시한다
	SHOW_COOLDOWN,
	## 클라이언트 버그다. 로그만 남긴다
	LOG_CLIENT_BUG,
}

const EFFECTS := {
	Protocol.NOT_APPLICABLE: Effect.REMOVE_BUTTON,
	Protocol.NOT_FOUND: Effect.RESYNC_ROOM,
	Protocol.NOT_AUTHENTICATED: Effect.RETURN_TO_LOGIN,
	Protocol.PERMISSION_DENIED: Effect.SHOW_NOTICE,
	Protocol.WRONG_STATE: Effect.SHOW_NOTICE,
	Protocol.NOT_YOUR_TURN: Effect.SHOW_TURN_WAIT,
	Protocol.OUT_OF_RANGE: Effect.SHOW_NOTICE,
	Protocol.INSUFFICIENT_FUNDS: Effect.SHOW_SHORTFALL,
	Protocol.INSUFFICIENT_QUANTITY: Effect.ADJUST_QUANTITY,
	Protocol.INVENTORY_FULL: Effect.SHOW_NOTICE,
	Protocol.SLOT_OCCUPIED: Effect.CONFIRM_REPLACE,
	Protocol.COOLDOWN: Effect.SHOW_COOLDOWN,
	Protocol.TARGET_REQUIRED: Effect.LOG_CLIENT_BUG,
	Protocol.INVALID_PARAMS: Effect.LOG_CLIENT_BUG,
	Protocol.INTERNAL_ERROR: Effect.SHOW_NOTICE,
}

const NOTICE_PREFIX := "ui.rejection."

## 사용자에게 보일 문구가 없는 코드. 처리만 하고 말한다.
const SILENT_CODES: Array[String] = [
	Protocol.NOT_APPLICABLE,
	Protocol.NOT_FOUND,
	Protocol.NOT_AUTHENTICATED,
	Protocol.TARGET_REQUIRED,
	Protocol.INVALID_PARAMS,
]


## 모르는 코드는 안내를 표시한다. 조용히 삼키면 원인을 알 수 없다.
static func effect_for(reason_code: String) -> Effect:
	if EFFECTS.has(reason_code):
		return EFFECTS[reason_code]
	push_warning("알 수 없는 거절 코드: %s" % reason_code)
	return Effect.SHOW_NOTICE


## 사용자에게 오류로 보여야 하는 코드인가.
static func is_user_facing(reason_code: String) -> bool:
	return not SILENT_CODES.has(reason_code)


## 안내 문구의 번역 키. 문구가 없는 코드면 빈 문자열이다.
static func notice_key(reason_code: String) -> String:
	if not is_user_facing(reason_code):
		return ""
	if EFFECTS.has(reason_code):
		return NOTICE_PREFIX + reason_code
	return NOTICE_PREFIX + "unknown"
