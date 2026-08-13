class_name AdminCodes
extends RefCounted

## 어드민 거절 코드별 안내 문구 키.
##
## 어드민 채널은 거절 응답에 번역 키를 쓰지 않는다. 사람이 직접 읽는 UI 가 아니라
## 도구를 경유하기 때문이며 `detail` 에 영문 설명이 온다. 그래서 코드별 안내는
## 클라이언트가 자체 보유한다.
##
## 게임 채널의 코드도 어드민 채널에 그대로 나타난다. 다만 게임에서 조용히 넘기는
## 코드(`NOT_APPLICABLE`, `NOT_FOUND` 등)는 어드민에서 반드시 보여야 한다.
## 낙관적 버튼 구성이 아니라 편집 도구이므로 실패를 삼키면 안 된다. 그래서 그
## 코드들은 어드민 전용 문구를 따로 둔다.

const PREFIX := "ui.admin.rejection."

## 어드민 패널이 자체 문구를 갖는 코드. 어드민 전용 다섯에 게임 채널이 조용히
## 넘기는 다섯을 더한 것이다.
const OWN_CODES: Array[String] = [
	Protocol.USERNAME_TAKEN,
	Protocol.REFERENCED,
	Protocol.PLAYER_NOT_ONLINE,
	Protocol.VALIDATION_FAILED,
	Protocol.SESSION_EXPIRED,
	Protocol.NOT_AUTHENTICATED,
	Protocol.NOT_FOUND,
	Protocol.NOT_APPLICABLE,
	Protocol.INVALID_PARAMS,
	Protocol.TARGET_REQUIRED,
]


## 코드에 맞는 번역 키. 나머지는 게임 채널 문구를 그대로 쓴다.
static func notice_key(reason_code: String) -> String:
	if OWN_CODES.has(reason_code):
		return PREFIX + reason_code

	if Protocol.REJECTION_CODES.has(reason_code):
		var game_key := RejectionPolicy.notice_key(reason_code)
		if not game_key.is_empty():
			return game_key

	# 모르는 코드는 어드민 문구를 쓴다. 게임 쪽 문구는 "액션" 이라고 말하는데
	# 어드민에서는 액션이 아닌 요청도 거절된다
	return PREFIX + "unknown"
