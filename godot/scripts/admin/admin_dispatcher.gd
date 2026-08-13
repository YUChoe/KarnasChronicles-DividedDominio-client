class_name AdminDispatcher
extends Dispatcher

## 어드민 채널 메시지 분기.
##
## 게임 디스패처를 상속해 프레임 파싱, 거부 규칙, `seq` 대응을 재사용한다.
## 아는 타입 목록과 분기만 바꾼다.
##
## 어드민 메시지는 게임 상태 저장소로 가지 않는다. 데이터를 편집하는 도구이므로
## 화면이 응답을 직접 받는다.

signal admin_login_result(payload: Dictionary)
signal service_login_result(payload: Dictionary)
signal account_create_result(payload: Dictionary)
signal list_result(payload: Dictionary)
signal get_result(payload: Dictionary)
signal mutate_result(payload: Dictionary)
signal stats_result(payload: Dictionary)
signal map_result(payload: Dictionary)
signal action_result(payload: Dictionary)
## 어드민 거절. 번역 키가 없고 `detail` 에 영문 설명이 온다.
signal rejected(payload: Dictionary)


func _known_type(message_type: String) -> bool:
	return Protocol.ADMIN_SERVER_TYPES.has(message_type)


func _route(message_type: String, payload: Dictionary) -> void:
	match message_type:
		Protocol.WELCOME:
			welcome_received.emit(payload)
		Protocol.PONG:
			pong_received.emit(payload)
		Protocol.ADMIN_LOGIN_RESULT:
			admin_login_result.emit(payload)
		Protocol.SERVICE_LOGIN_RESULT:
			service_login_result.emit(payload)
		Protocol.ACCOUNT_CREATE_RESULT:
			account_create_result.emit(payload)
		Protocol.ADMIN_LIST_RESULT:
			list_result.emit(payload)
		Protocol.ADMIN_GET_RESULT:
			get_result.emit(payload)
		Protocol.ADMIN_MUTATE_RESULT:
			mutate_result.emit(payload)
		Protocol.ADMIN_STATS_RESULT:
			stats_result.emit(payload)
		Protocol.ADMIN_MAP_RESULT:
			map_result.emit(payload)
		Protocol.ADMIN_ACTION_RESULT:
			action_result.emit(payload)
		Protocol.ADMIN_REJECTED:
			push_warning("어드민 거절 %s: %s" % [
				Protocol.as_string(payload.get("reason_code")),
				Protocol.as_string(payload.get("detail")),
			])
			rejected.emit(payload)
		Protocol.ERROR:
			push_warning("어드민 프로토콜 오류 %s: %s" % [
				Protocol.as_string(payload.get("reason_code")),
				Protocol.as_string(payload.get("detail")),
			])
			protocol_error.emit(payload)
