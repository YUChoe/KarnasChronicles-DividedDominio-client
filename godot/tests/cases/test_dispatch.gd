extends TestCase

## 메시지 디스패치와 상태 반영 검증.
##
## 프로토콜 계약의 예시 페이로드를 픽스처로 쓴다. 서버 구현과의 정합성을 함께
## 확인하려는 것이다. 값은 서버 저장소 `docs/protocol/server-to-client.md` 와
## `entities.md` 의 예시에서 가져왔다.

var _state: GameStateStore = null
var _dispatcher: Dispatcher = null


func before_each() -> void:
	_state = GameStateStore.new()
	_dispatcher = Dispatcher.new()
	_dispatcher.state = _state


func _send(payload: Dictionary) -> void:
	_dispatcher.handle_frame(JSON.stringify(payload))


func _room_info() -> Dictionary:
	return {
		"type": "room_info",
		"seq": null,
		"room": {
			"id": "0a1b2c3d-0000-0000-0000-000000000001",
			"x": 0,
			"y": 7,
			"room_type": "gate",
			"description": {
				"en": "A wide plaza before the gate.",
				"ko": "성문 앞 넓은 광장이다.",
			},
			"exits": ["north", "east", "south"],
			"blocked_exits": ["west"],
			"has_passage": true,
		},
		"time_of_day": "day",
		"entities": [
			{
				"id": "49a55ff4-0000-0000-0000-000000000002",
				"kind": "monster",
				"name": {"en": "Ash Raider", "ko": "재의 약탈자"},
				"description": {"en": "...", "ko": "..."},
				"hp": 30,
				"max_hp": 30,
				"disposition": "hostile",
				"is_alive": true,
				"can_talk": false,
			},
		],
		"nearby_rooms": [
			{"x": -2, "y": 9, "room_type": "forest"},
			{"x": -1, "y": 9, "room_type": "forest"},
		],
	}


# 스냅샷

func test_room_info_가_방과_엔티티를_채운다() -> void:
	_send(_room_info())
	assert_eq(Protocol.as_int(_state.room.get("x")), 0)
	assert_eq(Protocol.as_int(_state.room.get("y")), 7)
	assert_eq(_state.time_of_day, "day")
	assert_eq(_state.nearby_rooms.size(), 2)
	assert_eq(_state.entities.size(), 1)


func test_엔티티는_uuid_키_딕셔너리다() -> void:
	_send(_room_info())
	assert_true(_state.entities.has("49a55ff4-0000-0000-0000-000000000002"))


func test_room_info_는_이전_엔티티를_대체한다() -> void:
	_send(_room_info())
	var second := _room_info()
	second["entities"] = []
	_send(second)
	assert_eq(_state.entities.size(), 0)


func test_player_state_가_플레이어를_채운다() -> void:
	_send({
		"type": "player_state",
		"seq": null,
		"player": {
			"id": "cf65f7f3-0000-0000-0000-000000000003",
			"username": "player5426",
			"display_name": "SUPERADMIN",
			"faction_id": "ash_knights",
			"hp": 42,
			"max_hp": 50,
			"stamina": 30,
			"max_stamina": 50,
			"gold": 1240,
			"stats": {
				"strength": 10, "dexterity": 14, "constitution": 12,
				"intelligence": 8, "wisdom": 10, "charisma": 6,
			},
			"equipment_bonuses": {},
			"temporary_effects": {},
			"in_combat": false,
			"in_dialogue": false,
			"following": null,
		},
	})
	assert_eq(Protocol.as_string(_state.player.get("username")), "player5426")
	assert_eq(Protocol.as_int(
		Protocol.as_dict(_state.player.get("stats")).get("dexterity")), 14)


func test_inventory_가_무게와_골드와_장착을_채운다() -> void:
	_send({
		"type": "inventory",
		"seq": null,
		"total_weight": 12.0,
		"max_weight": 20.0,
		"gold": 1240,
		"items": [{"id": "b8593baf-0000-0000-0000-000000000004"}],
		"equipped": {"right_hand": "c277fa85-0000-0000-0000-000000000005"},
	})
	assert_eq(Protocol.as_int(_state.inventory.get("gold")), 1240)
	assert_eq(Protocol.as_array(_state.inventory.get("items")).size(), 1)
	assert_eq(_state.equipped.size(), 1)


func test_combat_state_를_그대로_보관한다() -> void:
	_send({
		"type": "combat_state",
		"seq": null,
		"combat_id": "7f3a9b21-0000-0000-0000-000000000006",
		"round": 3,
		"current_turn": "cf65f7f3-0000-0000-0000-000000000003",
		"is_my_turn": true,
		"turn_order": ["cf65f7f3-0000-0000-0000-000000000003"],
		"allies": [],
		"enemies": [],
		"is_over": false,
	})
	assert_eq(Protocol.as_int(_state.combat.get("round")), 3)
	assert_true(Protocol.as_bool(_state.combat.get("is_my_turn")))


# 부분 갱신

func test_entity_enter_가_엔티티를_더한다() -> void:
	_send(_room_info())
	_send({
		"type": "entity_enter",
		"room_id": "0a1b2c3d-0000-0000-0000-000000000001",
		"entity": {
			"id": "new-1",
			"kind": "monster",
			"name": {"en": "Rock Golem", "ko": "암석 골렘"},
			"is_alive": true,
		},
	})
	assert_eq(_state.entities.size(), 2)
	assert_true(_state.entities.has("new-1"))


func test_entity_leave_가_엔티티를_뺀다() -> void:
	_send(_room_info())
	_send({
		"type": "entity_leave",
		"room_id": "0a1b2c3d-0000-0000-0000-000000000001",
		"entity_id": "49a55ff4-0000-0000-0000-000000000002",
		"direction": "west",
	})
	assert_eq(_state.entities.size(), 0)


func test_entity_update_가_변경된_필드만_병합한다() -> void:
	_send(_room_info())
	_send({
		"type": "entity_update",
		"entity_id": "49a55ff4-0000-0000-0000-000000000002",
		"changes": {"hp": 18},
	})

	var entity: Dictionary = Protocol.as_dict(
		_state.entities.get("49a55ff4-0000-0000-0000-000000000002"))
	assert_eq(Protocol.as_int(entity.get("hp")), 18)
	# 병합이므로 나머지 필드가 남아야 한다
	assert_eq(Protocol.as_int(entity.get("max_hp")), 30)
	assert_eq(Protocol.as_string(entity.get("disposition")), "hostile")


func test_사본에_없는_entity_update_는_재동기화를_요청한다() -> void:
	_send(_room_info())

	var reasons: Array[String] = []
	_state.resync_required.connect(func(reason: String) -> void:
		reasons.append(reason))

	_send({
		"type": "entity_update",
		"entity_id": "does-not-exist",
		"changes": {"hp": 1},
	})
	assert_eq(reasons.size(), 1)
	assert_contains(reasons[0], "does-not-exist")


func test_사본에_없는_entity_leave_는_조용히_넘긴다() -> void:
	_send(_room_info())
	_send({
		"type": "entity_leave",
		"room_id": "0a1b2c3d-0000-0000-0000-000000000001",
		"entity_id": "does-not-exist",
		"direction": null,
	})
	assert_eq(_state.entities.size(), 1)


# 로그인과 대화, 상점

func test_login_result_성공이_플레이어와_어드민_채널을_채운다() -> void:
	_send({
		"type": "login_result",
		"seq": 1,
		"success": true,
		"player": {
			"id": "cf65f7f3-0000-0000-0000-000000000003",
			"username": "player5426",
			"display_name": "SUPERADMIN",
			"is_admin": true,
			"faction_id": "ash_knights",
		},
		"admin_channel": {
			"available": true, "channel": "admin", "requires_reauth": true,
		},
	})
	assert_true(_state.authenticated)
	assert_true(Protocol.as_bool(_state.admin_channel.get("available")))


func test_login_result_실패는_플레이어를_비운다() -> void:
	_send({
		"type": "login_result",
		"seq": 1,
		"success": false,
		"reason_code": "INVALID_CREDENTIALS",
		"message": {"key": "auth.login_failed", "params": {}},
	})
	assert_false(_state.authenticated)
	assert_true(_state.player.is_empty())
	assert_true(_state.admin_channel.is_empty())


func test_dialogue_는_is_active_가_거짓이면_비운다() -> void:
	_send({
		"type": "dialogue",
		"seq": null,
		"dialogue_id": "9c4e1a55-0000-0000-0000-000000000007",
		"speaker": {"id": "2be3c315-0000-0000-0000-000000000008",
			"name": {"en": "Town Merchant", "ko": "마을 상인"}},
		"lines": [{"en": "Good day.", "ko": "좋은 날입니다."}],
		"choices": [{"index": 1, "text": {"en": "Who?", "ko": "누구?"}}],
		"is_active": true,
	})
	assert_false(_state.dialogue.is_empty())

	_send({
		"type": "dialogue",
		"dialogue_id": "9c4e1a55-0000-0000-0000-000000000007",
		"speaker": {},
		"lines": [],
		"choices": [],
		"is_active": false,
	})
	assert_true(_state.dialogue.is_empty())


# 로그와 목록

func test_chat_을_로그에_쌓는다() -> void:
	_send({
		"type": "chat",
		"channel": "room",
		"from": {"id": "cf65f7f3-0000-0000-0000-000000000003",
			"display_name": "나그네"},
		"message": "안녕하세요",
		"timestamp": "2026-08-08T16:45:11.652000",
	})
	assert_eq(_state.chat_log.size(), 1)


func test_event_를_로그에_쌓는다() -> void:
	_send({
		"type": "event",
		"category": "combat",
		"message": {
			"key": "combat.hit",
			"params": {
				"target": {"en": "Ash Raider", "ko": "재의 약탈자"},
				"damage": 12,
			},
		},
	})
	assert_eq(_state.event_log.size(), 1)


func test_로그는_상한을_넘지_않는다() -> void:
	for i: int in range(GameStateStore.LOG_LIMIT + 20):
		_send({"type": "event", "category": "system",
			"message": {"key": "system.test", "params": {}}})
	assert_eq(_state.event_log.size(), GameStateStore.LOG_LIMIT)


func test_who_result_를_신호로_넘긴다() -> void:
	# GDScript 람다는 지역 변수를 값으로 포획한다. 안에서 대입해도 밖에 닿지
	# 않으므로 참조 타입에 담아 내보낸다
	var received: Array = []
	_state.who_result_received.connect(func(players: Array) -> void:
		received.append_array(players))

	_send({
		"type": "who_result",
		"seq": 52,
		"players": [{
			"id": "cf65f7f3-0000-0000-0000-000000000003",
			"username": "player5426",
			"display_name": "SUPERADMIN",
			"faction_id": "ash_knights",
			"is_admin": true,
		}],
	})
	assert_eq(received.size(), 1)


func test_container_contents_를_신호로_넘긴다() -> void:
	var seen: Array[String] = []
	_state.container_contents_received.connect(
		func(container_id: String, _items: Array) -> void:
			seen.append(container_id))

	_send({
		"type": "container_contents",
		"seq": 50,
		"container_id": "2be3c315-0000-0000-0000-000000000009",
		"items": [],
	})
	assert_eq(seen, ["2be3c315-0000-0000-0000-000000000009"])


# 거부 규칙

func test_계약에_없는_type_은_무시하고_신호를_낸다() -> void:
	var unknown: Array[String] = []
	_dispatcher.unknown_type_received.connect(func(name: String) -> void:
		unknown.append(name))
	_send({"type": "future_message", "seq": 9})
	assert_eq(unknown, ["future_message"])


func test_파싱_실패는_상태를_바꾸지_않는다() -> void:
	_dispatcher.handle_frame("this is not json")
	assert_true(_state.room.is_empty())


func test_최상위가_오브젝트가_아니면_무시한다() -> void:
	_dispatcher.handle_frame("[1,2,3]")
	assert_true(_state.room.is_empty())


func test_type_이_없으면_무시한다() -> void:
	_dispatcher.handle_frame('{"seq":9}')
	assert_true(_state.room.is_empty())


func test_seq_가_있는_응답은_대응_신호를_낸다() -> void:
	var seqs: Array[int] = []
	_dispatcher.response_received.connect(
		func(seq: int, _type: String, _payload: Dictionary) -> void:
			seqs.append(seq))
	_send({"type": "logout_result", "seq": 42, "success": true})
	assert_eq(seqs, [42])


func test_seq_가_없는_알림은_대응_신호를_내지_않는다() -> void:
	var seqs: Array[int] = []
	_dispatcher.response_received.connect(
		func(seq: int, _type: String, _payload: Dictionary) -> void:
			seqs.append(seq))
	_send({"type": "event", "category": "system",
		"message": {"key": "system.test", "params": {}}})
	assert_true(seqs.is_empty())


func test_어드민_타입은_게임_채널에서_무시된다() -> void:
	var unknown: Array[String] = []
	_dispatcher.unknown_type_received.connect(func(name: String) -> void:
		unknown.append(name))
	_send({"type": "admin_login_result", "seq": 1, "success": true})
	assert_eq(unknown, ["admin_login_result"])


func test_어드민_디스패처는_어드민_타입을_받는다() -> void:
	var admin := AdminDispatcher.new()
	var received: Array[bool] = []
	admin.admin_login_result.connect(func(_payload: Dictionary) -> void:
		received.append(true))
	admin.handle_frame(JSON.stringify({
		"type": "admin_login_result", "seq": 1, "success": true,
		"admin": {"id": "x", "username": "a", "display_name": "A"},
		"expires_at": "2026-08-08T18:45:00",
	}))
	assert_eq(received, [true])


# 소모품 낙관적 감춤

func _inventory_with_two() -> void:
	_send({
		"type": "inventory",
		"seq": null,
		"total_weight": 1.0,
		"max_weight": 20.0,
		"gold": 0,
		"items": [
			{"id": "potion-1", "category": "consumable"},
			{"id": "sword-1", "category": "weapon"},
		],
		"equipped": {},
	})


func test_감춘_소지품은_목록에서_빠진다() -> void:
	# 소모품을 쓰면 서버가 inventory 를 다시 밀지 않는다. 화면에서만 지운다
	_inventory_with_two()

	assert_true(_state.hide_inventory_item("potion-1"))

	var items := Protocol.as_array(_state.inventory.get("items"))
	assert_eq(items.size(), 1)
	assert_eq(Protocol.as_string(Protocol.as_dict(items[0]).get("id")), "sword-1")


func test_되돌리면_원래_자리로_돌아온다() -> void:
	_inventory_with_two()
	_state.hide_inventory_item("potion-1")

	_state.unhide_inventory_item("potion-1")

	var items := Protocol.as_array(_state.inventory.get("items"))
	assert_eq(items.size(), 2)
	assert_eq(Protocol.as_string(Protocol.as_dict(items[0]).get("id")), "potion-1")


func test_서버_목록이_오면_감춤이_사라진다() -> void:
	# 서버 데이터가 언제나 우선이다. 감춘 기록을 들고 있을 이유가 없다
	_inventory_with_two()
	_state.hide_inventory_item("potion-1")

	_inventory_with_two()
	_state.unhide_inventory_item("potion-1")

	assert_eq(Protocol.as_array(_state.inventory.get("items")).size(), 2)


func test_없는_소지품은_감추지_않는다() -> void:
	_inventory_with_two()

	assert_false(_state.hide_inventory_item("ghost-1"))
	assert_false(_state.hide_inventory_item(""))
	assert_eq(Protocol.as_array(_state.inventory.get("items")).size(), 2)


func test_두_번_감춰도_한_번만_센다() -> void:
	_inventory_with_two()
	_state.hide_inventory_item("potion-1")

	assert_false(_state.hide_inventory_item("potion-1"))
	assert_eq(Protocol.as_array(_state.inventory.get("items")).size(), 1)


# 읽기 본문

func test_readable_content_는_신호로_전달된다() -> void:
	# 본문은 상태에 쌓이지 않는다. 읽는 순간의 응답이다
	var received: Array = []
	_state.readable_content_received.connect(
		func(payload: Dictionary) -> void: received.append(payload))

	_send({
		"type": "readable_content",
		"seq": 52,
		"object_id": "98355bcf-0000-0000-0000-000000000007",
		"readable_type": "scroll",
		"page": 1,
		"total_pages": 1,
		"content": {"en": "Hear us", "ko": "들으소서"},
	})

	assert_eq(received.size(), 1)
	var payload: Dictionary = Protocol.as_dict(received[0])
	assert_eq(Protocol.as_string(
		Protocol.as_dict(payload.get("content")).get("ko")), "들으소서")
	assert_eq(Protocol.as_int(payload.get("total_pages")), 1)


func test_readable_content_는_계약_타입이다() -> void:
	# 처리하지 않으면 접속마다 "계약에 없는 type" 경고가 난다
	assert_true(Protocol.SERVER_TYPES.has(Protocol.READABLE_CONTENT))
