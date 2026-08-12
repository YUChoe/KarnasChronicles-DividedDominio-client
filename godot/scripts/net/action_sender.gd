class_name ActionSender
extends Node

## 요청 송신과 seq 대응.
##
## `seq` 는 연결이 소유하고 이곳은 발신 항목을 기록해 응답과 짝지운다. 응답이
## 오기 전까지 해당 버튼을 비활성화해야 하므로 대기 목록을 신호로 알린다.
##
## 응답이 정해진 시간 안에 오지 않으면 대기를 풀고 경고를 표시한다. 서버가
## 응답을 빠뜨렸거나 연결이 조용히 끊긴 경우다.

## 응답 대기 상한
const RESPONSE_TIMEOUT := 10.0

## 요청을 보냈다. 화면은 해당 버튼을 비활성화한다.
signal request_sent(seq: int, label: String)
## 응답이 왔다. 화면은 버튼을 다시 활성화한다.
signal request_settled(seq: int, label: String, message_type: String)
## 응답이 오지 않았다. 화면은 버튼을 되살리고 경고를 표시한다.
signal request_timed_out(seq: int, label: String)

var connection: Connection = null

## seq → {"label": String, "elapsed": float}
var _pending: Dictionary = {}


func set_dispatcher(dispatcher: Dispatcher) -> void:
	if not dispatcher.response_received.is_connected(_on_response_received):
		dispatcher.response_received.connect(_on_response_received)


## 대기 중인 요청이 있는지. 화면이 중복 송신을 막는 데 쓴다.
func is_pending(seq: int) -> bool:
	return _pending.has(seq)


func pending_count() -> int:
	return _pending.size()


## 게임 액션. 실패하면 0 을 돌려준다.
func send_action(verb: String, target: String = "", params: Dictionary = {}) -> int:
	var fields: Dictionary = {"verb": verb}
	if not target.is_empty():
		fields["target"] = target
	if not params.is_empty():
		fields["params"] = params
	return send_request(Protocol.ACTION, fields, verb)


## seq 를 붙여 보내고 대기 목록에 넣는다. `label` 은 화면이 버튼을 되찾는 열쇠다.
func send_request(message_type: String, fields: Dictionary, label: String) -> int:
	if connection == null:
		push_warning("연결이 없어 %s 를 보내지 않았습니다" % message_type)
		return 0

	var seq := connection.next_seq()
	var payload: Dictionary = {"type": message_type, "seq": seq}
	for key: Variant in fields:
		payload[key] = fields[key]

	if not connection.send(payload):
		return 0

	_pending[seq] = {"label": label, "elapsed": 0.0}
	request_sent.emit(seq, label)
	return seq


## 연결이 끊기면 대기 목록을 비운다. 응답이 올 수 없다.
func clear_pending() -> void:
	for seq: Variant in _pending.keys():
		var entry: Dictionary = Protocol.as_dict(_pending[seq])
		request_timed_out.emit(
			Protocol.as_int(seq), Protocol.as_string(entry.get("label")))
	_pending.clear()


func _process(delta: float) -> void:
	if _pending.is_empty():
		return

	var expired: Array = []
	for seq: Variant in _pending:
		var entry: Dictionary = Protocol.as_dict(_pending[seq])
		var elapsed := float(entry.get("elapsed", 0.0)) + delta
		entry["elapsed"] = elapsed
		_pending[seq] = entry
		if elapsed >= RESPONSE_TIMEOUT:
			expired.append(seq)

	for seq: Variant in expired:
		var entry: Dictionary = Protocol.as_dict(_pending[seq])
		_pending.erase(seq)
		request_timed_out.emit(
			Protocol.as_int(seq), Protocol.as_string(entry.get("label")))


func _on_response_received(seq: int, message_type: String, _payload: Dictionary) -> void:
	if not _pending.has(seq):
		return
	var entry: Dictionary = Protocol.as_dict(_pending[seq])
	_pending.erase(seq)
	request_settled.emit(seq, Protocol.as_string(entry.get("label")), message_type)
