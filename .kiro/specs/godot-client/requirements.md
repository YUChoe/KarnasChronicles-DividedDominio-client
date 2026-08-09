# Requirements Document

## Introduction

이 스펙은 카르나스 연대기의 Godot 게임 클라이언트에 대한 요구사항을 정의한다. 페이즈2에서 플레이어의 유일한 접속 경로가 된다.

클라이언트가 담당하는 책임이 넓다. 서버는 구조화된 JSON 데이터만 내보내므로 번역, 프레젠테이션, 화면 구성, 어드민 UI가 모두 클라이언트 몫이다. 기존 서버가 수행했던 텍스트 조립과 ANSI 색상 적용이 사라진 자리를 클라이언트가 채운다.

UI는 완전 버튼 기반이다. 플레이어는 채팅과 로그인을 제외하면 키보드로 문자를 입력하지 않는다. 방과 인스턴스 안의 모든 오브젝트가 버튼으로 표시되고, 선택한 대상에 적용할 수 있는 동사도 버튼으로 표시된다. 이 결정이 대상 지정 방식(uuid 전용)과 서버의 명령어 파싱 폐기를 가능하게 한다.

가용 동사는 클라이언트가 엔티티 속성으로 추론한다. 서버가 동사 목록을 내려주지 않으며, 부적절한 동사를 보내면 서버가 사유 코드와 함께 거절한다. 따라서 클라이언트는 낙관적으로 버튼을 구성하고 거절 응답으로 교정한다.

프로토콜 계약은 서버 저장소의 `docs/protocol/`에 정의되며 본 스펙은 그 계약의 클라이언트측 구현을 규율한다.

## Glossary

- **Client**: 본 스펙의 대상인 Godot 게임 클라이언트.
- **Godot_Version**: Godot 4.x. 스크립트 언어는 GDScript.
- **Gateway**: WebSocket과 TCP를 중계하는 Node 서버. 클라이언트는 `ws://host:3000/ws`로 접속한다.
- **Game_Channel**: 게임 통신 경로. WebSocket `/ws`.
- **Admin_Channel**: 관리 통신 경로. WebSocket `/admin`. 게임 채널과 인증이 분리된다.
- **Entity_UUID**: 엔티티 인스턴스의 uuid 문자열. 대상 지정의 유일한 키.
- **Action_Message**: 클라이언트가 보내는 `{type:"action", verb, target?, params?}` 메시지.
- **Verb**: 액션 종류. 목록은 `docs/protocol/client-to-server.md`에 정의된다.
- **Action_Rule_Table**: 엔티티 속성으로 표시할 동사 버튼을 결정하는 클라이언트 내부 규칙.
- **Rejection_Code**: 서버가 액션을 거절할 때 반환하는 사유 코드.
- **Message_Key_Payload**: 서버가 보내는 `{key, params}` 구조. 클라이언트가 번역해 표시한다.
- **Translation_Bundle**: 서버에서 이관된 번역 리소스. 9개 파일 약 360키.
- **Disposition**: 서버가 계산한 대상의 종족 관계(`friendly`, `neutral`, `hostile`).
- **Locale**: 클라이언트가 소유하는 표시 언어 설정. `en` 또는 `ko`.

## Requirements

### Requirement 1: 프로젝트 기반과 연결 계층

**User Story:** 플레이어로서, 나는 게임에 안정적으로 접속하고 연결 상태를 알기를 원한다. 그래야 통신 문제와 게임 내 상황을 구분할 수 있다.

#### Acceptance Criteria

1. THE Client SHALL Godot 4.x와 GDScript로 구현된다.
2. THE Client SHALL `WebSocketPeer`로 Game_Channel에 접속한다.
3. THE Client SHALL 수신한 WebSocket 텍스트 프레임을 JSON으로 파싱하고 `type` 필드로 처리를 분기한다.
4. WHEN 계약에 정의되지 않은 `type`을 수신하면, THE Client SHALL 해당 메시지를 무시하고 경고를 로그에 기록하며 연결을 유지한다.
5. THE Client SHALL 요청 메시지에 1부터 증가하는 `seq`를 부여하고 응답과 대응시킨다.
6. THE Client SHALL 연결 상태(연결 중, 연결됨, 끊김, 재연결 시도)를 화면에 표시한다.
7. THE Client SHALL 연결이 끊기면 재연결을 시도한다. 재시도 간격은 지수 백오프를 적용하고 상한을 둔다.
8. WHEN 60초 이상 송신할 메시지가 없으면, THE Client SHALL `ping`을 보내 세션 유휴 타이머를 갱신한다.
9. THE Client SHALL `welcome` 메시지를 수신하기 전에 어떤 메시지도 보내지 않는다.
10. WHEN `welcome`의 `protocol_version`이 지원하지 않는 값이면, THE Client SHALL 클라이언트 업데이트를 안내하고 연결을 종료한다.
11. THE Client SHALL 접속 대상 호스트와 포트를 설정으로 변경할 수 있게 한다.
12. THE Client SHALL 접속 후 `client_info`로 클라이언트 버전, 플랫폼, Locale을 통지한다. 응답을 기다리지 않는 단방향 통지다.

### Requirement 2: 버튼 기반 입력

**User Story:** 플레이어로서, 나는 명령어를 외우거나 타이핑하지 않고 게임하기를 원한다. 그래야 진입 장벽이 낮고 조작이 빠르다.

#### Acceptance Criteria

1. THE Client SHALL 방과 인스턴스 안의 모든 엔티티를 버튼으로 표시한다.
2. THE Client SHALL 선택한 대상에 적용할 수 있는 동사를 버튼으로 표시한다.
3. THE Client SHALL 이동 방향을 버튼으로 표시한다.
4. THE Client SHALL 자유 문자 입력을 다음 지점에만 허용한다. 채팅 메시지, 로그인의 사용자명과 비밀번호, `changename`의 새 이름, 어드민 패널의 CRUD 폼 값.
5. THE Client SHALL 명령어 입력창을 제공하지 않는다.
6. THE Client SHALL 전투 액션에 키보드 단축키를 제공한다. 단축키는 버튼의 보조 수단이며 문자 입력이 아니다.
7. THE Client SHALL 버튼을 통해서만 Action_Message를 생성한다. 사용자가 verb나 Entity_UUID를 직접 입력하는 경로를 제공하지 않는다.

### Requirement 3: 다국어 처리

**User Story:** 플레이어로서, 나는 모국어로 게임하기를 원한다. 그래야 세계관과 대화를 온전히 이해할 수 있다.

#### Acceptance Criteria

1. THE Client SHALL Translation_Bundle을 리소스로 보유한다. 서버에서 이관된 9개 파일의 키를 그대로 사용한다.
2. THE Client SHALL Message_Key_Payload를 번역해 표시한다. 서버가 완성된 문장을 보내지 않는다.
3. THE Client SHALL `params` 값이 스칼라면 그대로 치환하고 오브젝트면 현재 Locale의 값을 골라 치환한다.
4. THE Client SHALL Python `str.format` 문법(`{name}`)의 치환을 지원한다. 기존 번역 파일을 그대로 재사용하기 위한 요건이다.
5. WHEN 번역 키가 Translation_Bundle에 없으면, THE Client SHALL 키 문자열 자체를 표시하고 경고를 로그에 기록한다.
6. WHEN 현재 Locale의 번역이 없으면, THE Client SHALL `en`으로 폴백한다.
7. THE Client SHALL 엔티티 이름과 설명을 서버가 보낸 언어별 dict에서 현재 Locale에 맞게 선택한다.
8. THE Client SHALL Locale 전환 UI를 제공하고 선택을 로컬에 저장한다.
9. THE Client SHALL Locale 전환 시 화면을 다시 그린다. 재접속을 요구하지 않는다.
10. THE Client SHALL 한국어 조사를 번역 값에 포함된 완성형(`{item}을(를)` 형태)으로 표시한다. 조사 자동 선택은 이번 범위에 포함하지 않는다.
11. THE Client SHALL 채팅 본문을 번역하지 않는다.

### Requirement 4: 로그인과 로그아웃

**User Story:** 플레이어로서, 나는 계정으로 접속하고 다른 계정으로 바꿀 수 있기를 원한다.

#### Acceptance Criteria

1. THE Client SHALL 사용자명과 비밀번호 입력 폼을 제공한다.
2. THE Client SHALL `login` 메시지로 인증을 요청한다.
3. THE Client SHALL 회원가입 기능을 제공하지 않는다. 랜딩 사이트로 안내하는 링크만 표시한다.
4. WHEN 인증이 실패하면, THE Client SHALL 서버의 `reason_code`에 대응하는 안내를 표시한다.
5. THE Client SHALL 자동 로그인 옵션을 제공한다. 자격 정보를 저장할 경우 평문으로 보관하지 않는다.
6. THE Client SHALL 로그아웃 시 `logout` 메시지를 보내고 로그인 화면으로 전환한다. 연결은 유지한다.
7. THE Client SHALL `login_result`의 `is_admin`이 참일 때만 어드민 패널 진입 버튼을 표시한다.
8. THE Client SHALL 로그인 성공 후 `room_info`, `player_state`, `inventory`를 모두 수신한 뒤 게임 화면을 표시한다.

### Requirement 5: 방 정보와 이동

**User Story:** 플레이어로서, 나는 현재 위치와 주변 상황을 한눈에 파악하기를 원한다.

#### Acceptance Criteria

1. THE Client SHALL 방 설명, 시간대, 좌표를 표시한다.
2. THE Client SHALL `rooms` 테이블에 방 이름이 없음을 전제한다. 위치는 좌표와 지형으로 표시한다.
3. THE Client SHALL 이동 가능한 출구를 버튼으로 표시하고 막힌 출구를 비활성 상태로 표시한다.
4. THE Client SHALL 방 안의 엔티티를 Disposition에 따라 구분해 표시한다. 우호는 인물, 중립은 동물, 적대는 적으로 분류한다.
5. THE Client SHALL 방 안의 오브젝트를 버튼으로 표시하고 스택 수량을 함께 보여준다.
6. THE Client SHALL `nearby_rooms` 좌표 데이터로 미니맵을 렌더링한다. 서버가 텍스트 미니맵을 보내지 않는다.
7. THE Client SHALL 지형 22종에 아이콘과 색상을 매핑한다. 목록에 없는 값은 `unknown`으로 처리한다.
8. THE Client SHALL 엔티티 수에 제한 없이 모두 표시한다. 화면을 넘칠 경우 스크롤이나 접기를 제공한다.
9. THE Client SHALL `entity_enter`, `entity_leave`, `entity_update`로 방 상태를 부분 갱신한다.
10. WHEN `entity_update`의 대상이 보유한 사본에 없으면, THE Client SHALL `look` verb로 전체 상태를 재요청한다.
11. THE Client SHALL 좌표계에서 북쪽이 y 증가 방향임을 따른다.
12. THE Client SHALL 채팅 입력 수단을 제공하고 `chat` 메시지로 전송한다. 채널은 `room`과 `whisper`다.
13. WHEN 채널이 `whisper`이면, THE Client SHALL 수신 플레이어의 Entity_UUID를 `to`에 담는다. 사용자명 문자열을 보내지 않는다.
14. THE Client SHALL 수신한 `chat` 메시지를 채널별로 구분해 표시한다. 채팅 본문은 번역하지 않는다.
15. THE Client SHALL `who`와 `players_here` verb로 접속자 목록과 같은 방 플레이어 목록을 조회하고 `who_result`를 표시한다. 이 목록이 귓속말 대상 Entity_UUID의 확보 경로다.
16. THE Client SHALL 수신한 `event` 메시지를 번역해 로그에 표시하고 `category`(`combat`, `movement`, `item`, `social`, `system`, `dialogue`)로 채널을 분류한다.
17. THE Client SHALL `unfollow`와 `emote` 액션을 제공한다. `emote`는 목록에서 선택하며 자유 문자 입력을 받지 않는다.

### Requirement 6: 액션 규칙 테이블

**User Story:** 플레이어로서, 나는 대상에 할 수 있는 일이 무엇인지 버튼으로 보기를 원한다.

#### Acceptance Criteria

1. THE Client SHALL Action_Rule_Table을 보유하고 엔티티 속성으로 표시할 동사를 결정한다.
2. THE Client SHALL 서버가 보낸 속성만 판단 근거로 사용한다. 몬스터는 Disposition, `is_merchant`, `can_talk`, `is_alive`를, 오브젝트는 `category`, `equipment_slot`, `is_container`, `is_readable`, `is_usable`, `max_stack`, `is_equipped`를 사용한다.
3. THE Client SHALL 서버가 가용 동사 목록을 보내지 않음을 전제한다.
4. WHEN 서버가 `NOT_APPLICABLE`로 거절하면, THE Client SHALL 해당 버튼을 제거하고 사용자에게 오류로 표시하지 않는다.
5. WHEN 서버가 `NOT_FOUND`로 거절하면, THE Client SHALL `look` verb로 방 정보를 재동기화한다.
6. WHEN 서버가 `NOT_AUTHENTICATED`로 거절하면, THE Client SHALL 로그인 화면으로 전환한다.
7. THE Client SHALL Rejection_Code별 처리를 `docs/protocol/entities.md`의 표에 따라 구현한다.
8. THE Client SHALL 액션 전송 후 응답 수신까지 해당 버튼을 비활성화해 중복 전송을 막는다.

### Requirement 7: 대상 선택

**User Story:** 플레이어로서, 나는 대상을 고르면 그 대상의 정보와 가능한 행동을 함께 보기를 원한다.

#### Acceptance Criteria

1. THE Client SHALL 엔티티 버튼 클릭으로 대상을 선택한다.
2. THE Client SHALL 선택한 대상의 이름, 설명, 상태(HP, 종족, 관계)를 표시한다.
3. THE Client SHALL 선택한 대상에 적용 가능한 동사 버튼을 표시한다.
4. THE Client SHALL Action_Message의 `target`에 Entity_UUID 전체 문자열을 담는다. 축약하지 않는다.
5. THE Client SHALL 사용자에게 Entity_UUID를 노출하지 않는다.
6. THE Client SHALL 선택 상태를 시각적으로 표시한다.
7. THE Client SHALL 대상이 방에서 사라지면 선택을 해제한다.

### Requirement 8: 인벤토리와 아이템

**User Story:** 플레이어로서, 나는 소지품을 확인하고 장비를 관리하기를 원한다.

#### Acceptance Criteria

1. THE Client SHALL 인벤토리 아이템을 목록으로 표시하고 개별 무게와 총 무게, 최대 무게를 보여준다.
2. THE Client SHALL 스택 아이템을 하나의 항목으로 표시하고 수량을 함께 보여준다.
3. THE Client SHALL 카테고리 필터를 제공한다. 값은 `weapon`, `armor`, `consumable`, `misc`다.
4. THE Client SHALL 장착 슬롯별 현재 장비를 표시하고 빈 슬롯을 구분한다.
5. THE Client SHALL 골드를 표시한다. 서버가 계산한 값을 사용한다.
6. THE Client SHALL 수량을 지정하는 액션(`drop`, `put`, `shop_sell`)에서 수량 선택 수단을 제공한다.
7. THE Client SHALL 순서 번호로 아이템을 지정하지 않는다. 기존 100번대 번호 체계는 사라진다.
8. THE Client SHALL 컨테이너 내용을 `container_contents` 응답으로 표시하고 넣기와 꺼내기를 제공한다.

### Requirement 9: 전투

**User Story:** 플레이어로서, 나는 전투 상황과 내 차례를 명확히 알고 행동하기를 원한다.

#### Acceptance Criteria

1. THE Client SHALL 라운드, 현재 턴, 턴 순서를 표시한다.
2. THE Client SHALL 적과 우리 편의 HP를 시각적으로 표시한다.
3. THE Client SHALL 전투 액션을 버튼으로 표시한다. 공격, 아이템, 도주, 턴 종료다.
4. THE Client SHALL 전투 액션에 키보드 단축키를 병기한다. 공격 1, 아이템 4, 도주 3, 턴 종료 9다.
5. THE Client SHALL 숫자 키 입력을 서버로 그대로 보내지 않고 대응하는 verb로 변환해 전송한다.
6. THE Client SHALL 공격 대상을 선택하게 하고 `attack` verb의 `target`에 담는다.
7. WHEN 내 턴이 아니면, THE Client SHALL 액션 버튼을 비활성화한다.
8. WHEN `combat_state`의 `is_over`가 참이면, THE Client SHALL 전투 화면을 닫고 탐험 화면으로 전환한다.
9. THE Client SHALL 전투 로그를 표시한다. 서버가 보낸 Message_Key_Payload를 번역해 누적한다.

### Requirement 10: 대화와 상점

**User Story:** 플레이어로서, 나는 NPC와 대화하고 물건을 거래하기를 원한다.

#### Acceptance Criteria

1. THE Client SHALL NPC 발화와 선택지를 표시한다.
2. THE Client SHALL 선택지를 버튼으로 표시하고 선택 시 `dialogue_choice` verb의 `params.choice`에 로컬 번호를 담아 전송한다.
3. THE Client SHALL 선택지 번호가 대화 인스턴스 안에서만 유효한 로컬 인덱스임을 전제한다.
4. WHEN `dialogue`의 `is_active`가 거짓이면, THE Client SHALL 대화 창을 닫는다.
5. THE Client SHALL 상점 목록을 표시하고 매수가와 매도가를 보여준다.
6. THE Client SHALL 상점 구매에서 `template_id`를, 판매에서 Entity_UUID를 사용한다.
7. WHEN `buy_price` 또는 `sell_price`가 0이면, THE Client SHALL 해당 방향 거래 버튼을 숨긴다.
8. WHEN 서버가 `INSUFFICIENT_FUNDS`로 거절하면, THE Client SHALL 부족 금액을 안내한다.

### Requirement 11: 상태 화면

**User Story:** 플레이어로서, 나는 내 능력치와 상태를 확인하기를 원한다.

#### Acceptance Criteria

1. THE Client SHALL 능력치 6종(힘, 민첩, 지능, 지혜, 체력, 매력)을 표시한다.
2. THE Client SHALL HP와 스태미나를 현재값과 최대값으로 표시한다.
3. THE Client SHALL 장비 보너스와 임시 효과를 표시한다.
4. THE Client SHALL 표시 이름, 사용자명, 종족을 표시한다.
5. THE Client SHALL `changename` 액션으로 표시 이름 변경을 제공한다.
6. WHEN 서버가 `COOLDOWN`으로 거절하면, THE Client SHALL 남은 시간을 안내한다. 표시 이름 변경은 하루 1회로 제한된다.

### Requirement 12: 어드민 패널

**User Story:** 운영자로서, 나는 게임 클라이언트 안에서 세계를 관리하기를 원한다. 그래야 별도 웹 도구를 유지하지 않아도 된다.

#### Acceptance Criteria

1. THE Client SHALL Admin_Channel로 별도 접속한다. Game_Channel 연결과 독립적이다.
2. THE Client SHALL 어드민 인증을 별도로 수행한다. 게임 로그인 상태가 어드민 권한을 부여하지 않는다.
3. THE Client SHALL 월드 맵을 렌더링한다. 방 그리드, 지형 색상, 종족 색상, 막힌 출구를 표시한다.
4. THE Client SHALL 방을 선택해 상세 정보(좌표, 지형, 설명, 막힌 출구, 엔티티 수, 종족 분포)를 표시한다.
5. THE Client SHALL 자동 갱신을 제공하고 켜고 끌 수 있게 한다.
6. THE Client SHALL 8개 리소스의 목록, 상세, 생성, 수정, 삭제를 제공한다. 리소스는 players, rooms, room_connections, monsters, objects, item_prices, factions, faction_relations다.
7. THE Client SHALL 목록에서 페이지네이션, 필터, 정렬을 제공한다.
8. THE Client SHALL 리소스 데이터를 원본 컬럼명으로 표시한다. 어드민은 데이터 편집 도구이므로 `name_en`, `name_ko` 형태를 그대로 노출한다.
9. THE Client SHALL 삭제 시 확인을 요구하고 서버의 `REFERENCED` 응답에서 참조 목록을 표시한다.
10. THE Client SHALL 통계(방, 몬스터, 플레이어, 접속자, 오브젝트, 종족 수)를 표시한다.
11. THE Client SHALL 실시간 액션을 제공한다. 대상은 `goto`, `kick`, `spawn_monster`, `spawn_item`, `terminate`, `create_room`, `update_room`, `create_exit`, `validate_world`, `list_monster_templates`, `list_item_templates`, `scheduler`, `change_display_name`, `room_info`다.
12. THE Client SHALL 플레이어 인벤토리와 능력치를 조회하는 화면을 제공한다.
13. THE Client SHALL 어드민 채널의 거절 응답에 번역 키가 없음을 전제한다. Rejection_Code별 안내 문구를 자체 보유한다.
14. THE Client SHALL 어드민 세션 만료(2시간)를 처리하고 재인증을 요구한다.

### Requirement 13: 품질 기준

**User Story:** 개발자로서, 나는 클라이언트가 일관된 구조와 검증 수단을 갖기를 원한다.

#### Acceptance Criteria

1. THE Client SHALL 메시지 처리, 상태 보관, 화면 표시를 분리한다.
2. THE Client SHALL 서버 메시지를 단일 디스패처에서 수신해 상태 저장소로 반영하고, 화면은 상태를 관찰해 갱신한다.
3. THE Client SHALL 게임 규칙을 판정하지 않는다. 판정은 서버가 하고 클라이언트는 표시와 요청만 담당한다. Action_Rule_Table은 버튼 구성을 위한 표시 규칙이며 규칙 판정이 아니다.
4. THE Client SHALL 스크립트 파일 하나의 길이를 가능한 한 500행 이내로 유지한다.
5. THE Client SHALL 서버 없이 메시지 처리와 번역을 검증할 수 있는 테스트를 제공한다.
6. THE Client SHALL 영어 텍스트에 영국 영어를 사용한다.
