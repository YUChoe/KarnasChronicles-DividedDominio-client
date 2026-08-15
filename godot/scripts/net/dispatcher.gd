class_name Dispatcher
extends RefCounted

## 수신 프레임을 파싱하고 `type` 별로 분기한다.
##
## 상태에 반영되는 메시지는 `GameState` 로 넘기고, 화면이나 연결 계층이 직접
## 다뤄야 하는 메시지는 신호로 알린다. 계약에 없는 `type` 과 파싱 실패는 경고를
## 남기고 무시한다. 연결을 끊지 않는 것이 프로토콜 확장의 하위 호환 규칙이다.

## 상태 저장소. 생성 측이 autoload `GameState` 를 주입한다.
var state: GameStateStore = null

signal welcome_received(payload: Dictionary)
signal login_result_received(payload: Dictionary)
signal logout_result_received(payload: Dictionary)
signal pong_received(payload: Dictionary)
signal action_rejected(payload: Dictionary)
signal protocol_error(payload: Dictionary)
## 게이트웨이가 연결을 거부하거나 프레임을 되돌렸다. 용량 초과, 프레임 규약
## 위반, 상위 연결 실패가 여기로 온다.
signal gateway_error(reason: String)
## seq 를 가진 모든 응답. 액션 송신 측이 대기 항목을 해소하는 데 쓴다.
signal response_received(seq: int, message_type: String, payload: Dictionary)
## 계약에 없는 type 을 받았다. 확장 감지용이며 오류가 아니다.
signal unknown_type_received(message_type: String)


func handle_frame(text: String) -> void:
	var parsed: Variant = JSON.parse_string(text)
	if parsed == null:
		push_warning("JSON 파싱 실패: %s" % text.substr(0, 120))
		return
	if not (parsed is Dictionary):
		push_warning("최상위가 오브젝트가 아닙니다: %s" % text.substr(0, 120))
		return

	var payload: Dictionary = parsed
	var message_type := Protocol.as_string(payload.get("type"))
	if message_type.is_empty():
		push_warning("type 필드가 없습니다: %s" % text.substr(0, 120))
		return

	if Protocol.GATEWAY_TYPES.has(message_type):
		_route_gateway(message_type, payload)
		return

	if not _known_type(message_type):
		push_warning("계약에 없는 type 을 무시합니다: %s" % message_type)
		unknown_type_received.emit(message_type)
		return

	_route(message_type, payload)

	if payload.get("seq") != null:
		response_received.emit(
			Protocol.as_int(payload.get("seq"), 0), message_type, payload)


## 이 채널이 아는 type 인가. 어드민 디스패처가 목록을 바꾼다.
func _known_type(message_type: String) -> bool:
	return Protocol.SERVER_TYPES.has(message_type)


## 게이트웨이 프레임은 상태 저장소로 가지 않는다. 게임 상태가 아니다.
func _route_gateway(message_type: String, payload: Dictionary) -> void:
	if message_type != Protocol.GATEWAY_ERROR:
		return
	var reason := Protocol.as_string(payload.get("reason"), "unknown")
	push_warning("게이트웨이 오류: %s" % reason)
	gateway_error.emit(reason)


func _route(message_type: String, payload: Dictionary) -> void:
	if state == null:
		push_warning("상태 저장소가 없어 %s 를 버립니다" % message_type)
		return

	match message_type:
		Protocol.WELCOME:
			welcome_received.emit(payload)
		Protocol.LOGIN_RESULT:
			state.apply_login_result(payload)
			login_result_received.emit(payload)
		Protocol.LOGOUT_RESULT:
			state.apply_logout_result(payload)
			logout_result_received.emit(payload)
		Protocol.PONG:
			pong_received.emit(payload)
		Protocol.ROOM_INFO:
			state.apply_room_info(payload)
		Protocol.ENTITY_ENTER:
			state.apply_entity_enter(payload)
		Protocol.ENTITY_LEAVE:
			state.apply_entity_leave(payload)
		Protocol.ENTITY_UPDATE:
			state.apply_entity_update(payload)
		Protocol.PLAYER_STATE:
			state.apply_player_state(payload)
		Protocol.INVENTORY:
			state.apply_inventory(payload)
		Protocol.CONTAINER_CONTENTS:
			state.apply_container_contents(payload)
		Protocol.READABLE_CONTENT:
			state.apply_readable_content(payload)
		Protocol.COMBAT_STATE:
			state.apply_combat_state(payload)
		Protocol.DIALOGUE:
			state.apply_dialogue(payload)
		Protocol.WHO_RESULT:
			state.apply_who_result(payload)
		Protocol.CHAT:
			state.apply_chat(payload)
		Protocol.EVENT:
			state.apply_event(payload)
		Protocol.ACTION_REJECTED:
			action_rejected.emit(payload)
		Protocol.ERROR:
			push_warning("프로토콜 오류 %s: %s" % [
				Protocol.as_string(payload.get("reason_code")),
				Protocol.as_string(payload.get("detail")),
			])
			protocol_error.emit(payload)
