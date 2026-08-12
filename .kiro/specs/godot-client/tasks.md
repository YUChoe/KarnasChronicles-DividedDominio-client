# Implementation Plan

## Overview

Godot 4.x + GDScript로 게임 클라이언트를 구현한다. 프로토콜 계약(`docs/protocol/`, 서버 저장소)이 유일한 접점이므로 서버 구현과 병렬로 진행할 수 있다.

각 단계는 독립 커밋으로 진행한다. 검증은 두 층으로 한다. 서버 없이 가능한 것(번역 치환, 액션 규칙, 메시지 디스패치)은 단위 테스트로, 통신이 필요한 것은 서버 하니스가 동작하는 서버에 붙여 확인한다.

계약의 예시 페이로드를 테스트 픽스처로 재사용해 서버 구현과의 정합성을 함께 확인한다.

## Tasks

- [x] 1. 프로젝트 기반과 연결 계층
- [x] 1.1 Godot 프로젝트 초기화
  - `godot/` 아래 Godot 4.x 프로젝트를 만든다. 디렉터리 구조는 design.md의 배치를 따른다. autoload로 `game_state.gd`와 `translator.gd`를 등록한다.
  - `project.godot` 을 `config_version=5` 로 만들었다. `config/features` 하한은 `4.2` 이고 개발 편집기가 `4.2.2-stable` 이므로 정확히 일치한다. 버전 업그레이드 안내가 뜨지 않는다. 필요한 기능(`WebSocketPeer`, `JSON.parse_string`, `String.format`)은 모두 4.0 에 있어 하한을 더 올릴 이유가 없다.
  - `config/version="0.1.0"` 을 넣었다. Task 1.9 의 `client_info` 가 `ProjectSettings` 에서 이 값을 읽는다.
  - 렌더러를 `gl_compatibility` 로 뒀다. UI 위주 클라이언트이고 웹 내보내기가 WebGL2 를 요구하므로 선택지를 좁히지 않는다.
  - `run/main_scene` 을 비워 뒀다. 첫 씬은 Task 3 의 `scenes/login/login.tscn` 이다. 그때까지 편집기에서 실행하면 씬 선택을 묻는다.
  - 디렉터리는 실제 파일이 들어가는 것만 만들었다. `scripts/net/`, `scripts/rules/`, `scripts/admin/`, `scenes/**` 는 각 담당 작업이 만든다. git 이 빈 디렉터리를 추적하지 않으므로 `.gitkeep` 12개를 넣는 대신 배치는 design.md 에 남긴다.
  - autoload 두 스크립트는 문서 주석만 있는 골격이다. 필드와 신호는 Task 1.7, 번역 로딩과 `t()` 는 Task 2.2 가 채운다. 여기서 등록해 두면 이후 작업이 `project.godot` 을 건드리지 않는다.
  - `godot/.gitignore` 로 `.godot/`(임포트 캐시)와 `export_presets.cfg`(서명 자격 정보)를 제외했다.
  - 검증: `Godot_v4.2.2-stable_win64 --headless --path godot --editor --quit` 로 임포트가 오류 없이 끝났고 편집기가 `project.godot` 을 다시 쓰지 않았다. 설정 키가 모두 유효하다는 뜻이다.
  - 검증: `--headless --script` 로 런타임 확인. autoload 두 개가 root 에 붙고, `ProjectSettings` 에서 `config/version` 이 읽히고, 번역 11개 파일 405개 키가 `JSON.parse_string` 으로 파싱되고, `String.format({"old_name":...})` 이 `{old_name}` 을 치환한다. design.md 가 전제한 문법 호환이 실측으로 확인됐다. 검증 스크립트는 일회용이라 남기지 않았다.
  - 검증: 정적 검사로 LF·UTF-8, 번역 키의 locale dict 구조와 `en` 폴백, Python 포맷 스펙 0건, `{{` 리터럴 0건을 확인했다. Node 쪽 `type-check` 통과, `npm test` 38건 통과(godot/ 는 `tsconfig.server.json` 과 vitest include 밖이다).
  - `.json` 은 Godot 4 에서 임포트 대상이 아니다. `.import` 파일이 생기지 않으므로 `FileAccess` 로 직접 읽는다. Task 2.2 의 로딩 방식이 이것이다.
  - 정적 검사 게이트를 함께 넣었다. Requirement 13 의 품질 기준에 해당하고, 코드가 두 파일뿐인 지금 켜는 비용이 0 이다. 나중에 켜면 누적된 위반을 한꺼번에 고쳐야 한다.
    - `project.godot` `[debug]` 에 경고를 오류로 올렸다. `untyped_declaration`, `unsafe_method_access`, `unsafe_property_access`, `unsafe_cast` 를 2(오류)로, `unsafe_call_argument` 와 `return_value_discarded` 를 1(경고)로 뒀다. 뒤의 둘은 `JSON.parse_string` 결과가 전부 Variant 인 디스패처 경계에서 과도하게 걸릴 항목이라 Task 1.4 구현 후 재검토한다. 4.2.2 에는 `treat_warnings_as_errors` 같은 전역 스위치가 없고 `debug/gdscript/warnings/*` 47개 항목별로 0·1·2 를 지정한다.
    - `scripts/godot-check.sh` 와 npm `check:godot` 을 추가했다.
    - 편집기로 프로젝트를 한 번 열면 `project.godot` 이 다시 쓰이면서 주석이 모두 사라지고 키 순서가 바뀐다. 값은 그대로 남는다. 따라서 설정의 근거를 파일 주석으로 남길 수 없고 이 문서가 유일한 기록이다.
  - GDScript 오류 검출의 실측 결과를 남긴다. 헤드리스 실행의 종료 코드를 게이트로 쓸 수 없다.
    - `_initialize()` 에서 직접 런타임 오류가 나면 그 함수가 중단되어 `quit()` 에 도달하지 못하고 프로세스가 무한 대기한다. 외부 타임아웃이 필요하다.
    - 하위 함수에서 런타임 오류가 나면 그 함수만 중단되고 호출자는 계속 진행한다. `SCRIPT ERROR` 는 출력되지만 종료 코드는 0 이다.
    - `--editor --quit` 은 오류가 0건인 정상 프로젝트에서도 1 을 돌려준다. 종료 코드를 쓸 수 없으므로 출력에서 `SCRIPT ERROR`·`ERROR:` 를 찾는다. 정상 실행의 출력에는 이 두 패턴이 없고 무관한 `WARNING` 두 줄(headless 커서, Blender 경로)만 있다.
    - `--check-only --script` 는 정상 0, 파스·타입 오류 1 로 종료 코드가 신뢰할 수 있는 유일한 경로다. 다만 지정한 파일과 그 의존만 검사하므로 전수 순회가 필요하다.
    - `--editor --quit` 은 아무도 참조하지 않는 `.gd` 까지 전수 파스한다. 검사 스크립트가 두 방식을 모두 쓰는 이유다.
    - 정적 타입을 붙이면 런타임 오류가 파스 오류로 바뀐다. `var n: int = "문자열"` 은 `--check-only` 에서 `Cannot assign a value of type "String" as "int"` 로 잡힌다. 타입을 붙이지 않으면 실행할 때까지 알 수 없다.
    - 부정 검증: 타입 없는 파라미터와 변수, Variant 메서드 호출이 있는 파일을 넣으면 두 층 모두 실패하고 스크립트가 1 로 종료한다.
  - 정적 검사가 덮지 못하는 영역을 기록한다. 씬 배선(`get_node` 오타, `.tscn` 의 끊긴 참조)은 씬을 인스턴스화할 때만 드러난다. 대책은 `%UniqueName` 접근과 타입 붙인 `@onready`, 그리고 씬별 헤드리스 인스턴스화 스모크 테스트다. 동작 검증은 테스트 프레임워크가 필요하며 Task 2.5, 4.3, 12.3 이 이를 요구한다. 프레임워크(gdUnit4 또는 GUT)는 아직 결정하지 않았다.
  - Task 2.1 이 이관한 번역 파일 중 7개(`admin`, `auth`, `combat`, `command`, `item`, `moving`, `npc`)가 CRLF 다. 서버 저장소의 줄바꿈을 그대로 가져온 결과다. JSON 파싱에는 영향이 없어 이 작업에서 손대지 않았다.
  - _Requirements: 1.1, 13.1_
- [x] 1.2 WebSocket 연결 관리
  - `scripts/net/connection.gd`에 `WebSocketPeer` 래퍼를 만든다. 접속, 프레임 송수신, 상태 전이(`DISCONNECTED`, `CONNECTING`, `WAITING_WELCOME`, `READY`)를 구현한다. `welcome` 수신 전에는 송신하지 않는다.
  - 접속 대상 호스트와 포트를 설정으로 변경할 수 있게 한다.
  - 상태 전이는 `_process` 의 `WebSocketPeer.poll()` 결과로 판정한다. `STATE_OPEN` 이면서 `CONNECTING` 이면 `WAITING_WELCOME` 으로, `welcome` 검증을 통과하면 `READY` 로 간다.
  - `send()` 는 `READY` 가 아니면 거부하고 경고를 남긴다. 계약의 "welcome 전에는 어떤 메시지도 보내지 않는다" 를 한 곳에서 강제한다.
  - 재연결마다 `WebSocketPeer` 를 새로 만든다. 닫힌 peer 를 재사용하지 않는다.
  - 접속 설정은 `scripts/net/client_config.gd` 가 `user://client.cfg` 로 읽고 쓴다. 편집기 없이 접속 대상을 바꿀 수 있어야 하므로 `ProjectSettings` 가 아니라 쓰기 가능한 위치를 쓴다. 파일이 없으면 기본값(`localhost:3000`)으로 만든다.
  - _Requirements: 1.2, 1.9, 1.11_
- [x] 1.3 재연결과 유휴 유지
  - 연결이 끊기면 지수 백오프(1초 시작, 2배씩, 30초 상한)로 재시도한다. 사용자가 취소할 수 있게 한다. 60초 이상 송신이 없으면 `ping`을 보낸다.
  - 의도적 종료(사용자 취소, 프로토콜 위반)와 사고 종료를 `_intentional` 로 구분한다. 앞의 경우 재연결하지 않는다.
  - 유휴 타이머는 송신할 때마다 0 으로 되돌린다. `ping` 자신도 송신이므로 다음 60초를 다시 센다.
  - _Requirements: 1.7, 1.8_
- [x] 1.4 메시지 디스패처
  - `scripts/net/dispatcher.gd`가 수신 프레임을 JSON 파싱하고 `type`별로 분기한다. 계약에 없는 `type`은 무시하고 경고를 기록한다. 파싱 실패도 같이 처리한다.
  - `scripts/net/protocol.gd`에 타입 상수와 거절 코드 상수를 정의한다.
  - 거부 지점이 넷이다. 파싱 실패, 최상위가 오브젝트가 아님, `type` 없음, 계약에 없는 `type`. 넷 모두 경고만 남기고 연결을 유지한다.
  - `protocol.gd` 에 `as_dict`·`as_array`·`as_string`·`as_int`·`as_bool` 을 뒀다. `JSON.parse_string` 결과가 Variant 이므로 상태 저장소로 넘기기 전에 이곳에서 형을 확정한다. 서버가 계약을 어겨도 클라이언트가 죽지 않는다. 엄격 타입 설정에서 Variant 멤버 접근이 오류이므로 이 경계 함수가 없으면 코드가 컴파일되지 않는다.
  - `seq` 를 가진 모든 응답에 `response_received` 를 발신한다. 액션 송신 측이 이것으로 대기 항목을 해소한다.
  - `INSUFFICIENT_QUANTITY` 는 계약에만 있고 서버가 보내지 않는 코드다(서버 `docs/protocol/consistency.md`). 상수에는 포함했다.
  - _Requirements: 1.3, 1.4_
- [x] 1.5 액션 송신과 seq 관리
  - `scripts/net/action_sender.gd`가 `seq`를 1부터 증가시켜 부여하고 발신 시각과 verb를 기록한다. 응답 대응과 10초 타임아웃 판정을 구현한다. 응답 수신까지 해당 버튼을 비활성화한다.
  - `seq` 채번은 `Connection` 이 소유한다. 연결마다 1 로 초기화되어야 하고 `client_info` 처럼 액션이 아닌 요청도 같은 수열을 쓰기 때문이다.
  - 버튼 비활성화는 `request_sent`·`request_settled`·`request_timed_out` 세 신호로 화면에 위임한다. 송신 계층이 노드를 직접 만지지 않는다.
  - `send_request(type, fields, label)` 을 두고 `send_action` 을 그 위에 얹었다. Task 3 의 `login` 도 같은 seq 대응이 필요하다.
  - 연결이 끊기면 `clear_pending()` 이 대기 항목을 전부 타임아웃으로 처리한다. 응답이 올 수 없는데 버튼이 잠긴 채 남는 것을 막는다.
  - _Requirements: 1.5, 6.8_
- [x] 1.6 프로토콜 버전 확인
  - `welcome`의 `protocol_version`이 지원 범위를 벗어나면 클라이언트 업데이트를 안내하고 연결을 종료한다.
  - 같은 자리에서 `welcome.channel` 도 확인한다. 계약이 "기대한 채널이 아니면 연결을 끊고 접속 설정 오류를 알린다" 를 요구한다. 두 채널은 프레이밍이 같고 포트만 달라 확인이 없으면 조용히 실패한다.
  - 둘 다 의도적 종료로 처리해 재연결하지 않는다. 재시도해도 같은 결과이기 때문이다.
  - _Requirements: 1.10_
- [x] 1.7 상태 저장소
  - `scripts/state/game_state.gd`에 player, room, entities, nearby_rooms, inventory, equipped, combat, dialogue, shop, chat_log, event_log, connection_status를 둔다. 변경을 신호로 전파한다. `entities`는 uuid 키 딕셔너리로 관리한다. 로그는 최근 500건으로 제한한다.
  - `class_name GameStateStore` 를 붙였다. autoload 이름 `GameState` 와 같은 이름은 Godot 이 금지한다. 다른 스크립트는 autoload 식별자를 직접 쓰지 않고 이 타입으로 주입받는다. autoload 식별자가 `--check-only` 단일 파일 검사에서 해석되지 않기 때문이며, 주입은 서버 없이 상태 반영을 검증하는 Task 12.3 의 전제이기도 하다. autoload 를 직접 참조하는 곳은 조립 지점인 `scenes/boot/boot.gd` 뿐이다.
  - `entity_update` 대상이 사본에 없으면 `resync_required` 를 발신한다. 상태 저장소가 직접 `look` 을 보내지 않는다. 송신 수단을 아는 조립 지점이 처리한다.
  - `login_result.admin_channel` 을 별도 필드로 보관한다. `is_admin` 만으로는 어드민 진입 가능 여부를 알 수 없고 `available` 이 참일 때만 버튼을 노출한다는 계약 때문이다.
  - `dialogue` 는 `is_active` 가 거짓이면 비운다. 화면이 매번 판정하지 않게 한다.
  - _Requirements: 13.1, 13.2_
- [x] 1.8 연결 상태 표시
  - 연결 중, 연결됨, 끊김, 재연결 시도를 화면에 표시한다.
  - `scenes/common/connection_indicator.tscn` 은 재사용 부품이다. 재연결 대기 중에는 남은 초와 시도 횟수를 세고 취소 버튼을 띄운다. 취소하면 버튼이 재시도로 바뀐다.
  - `scenes/boot/boot.tscn` 을 조립 지점이자 임시 첫 씬으로 만들었다. 연결·디스패처·액션 송신·상태 저장소를 엮는 유일한 곳이다. Task 3 이 로그인 화면을 얹으면 이 씬이 화면 전환의 뿌리가 된다.
  - 상태 4종은 계약이 정의한 연결 전이이고 재연결 대기는 그중 하나가 아니다. 그래서 상태를 5개로 늘리지 않고 `reconnect_scheduled`·`reconnect_cancelled` 신호로 분리했다.
  - 표시 문구는 아직 영어 하드코딩이다. Translator 가 없어서이며 Task 2.3 에서 번역을 거치게 한다.
  - _Requirements: 1.6_
- [x] 1.9 클라이언트 정보 통지
  - 접속 후 `client_info`로 클라이언트 버전, 플랫폼, Locale을 통지한다. 응답을 기다리지 않는 단방향 통지다.
  - `Connection` 이 `READY` 로 전이하는 자리에서 자동으로 보낸다. 화면이 잊을 수 없게 하려는 것이다. 응답이 없으므로 대기 목록에 넣지 않는다.
  - `client_version` 은 `ProjectSettings` 의 `application/config/version`, `platform` 은 `OS.get_name().to_lower()`, `locale` 은 접속 설정 값이다.
  - _Requirements: 1.12_

### Task 1 통합 검증 (2026-08-11)

Godot → 게이트웨이 → 대역 서버로 실제 사슬을 세워 확인했다. 대역 서버는 계약대로 `welcome` 을 보내고 `ping` 에 `pong` 으로 답하는 최소 TCP 라인 서버다. 게이트웨이는 저장소의 실제 구현을 그대로 띄웠다.

| 확인 항목 | 결과 |
|---|---|
| 상태 전이 | CONNECTING → WAITING_WELCOME → READY |
| `client_info` | `{"client_version":"0.1.0","locale":"ko","platform":"windows","seq":1}` |
| `ping` 주기 | `client_info` 후 정확히 60초에 `seq:2` 로 발신, `pong` 수신 |
| 재연결 백오프 | 상위 서버를 죽이자 1, 2, 4, 8초 간격으로 재시도 |
| `protocol_version: 99` | 1000 `unsupported protocol version` 으로 종료, 재연결 없음 |
| `channel: admin` | 1000 `channel mismatch` 로 종료, 재연결 없음 |
| 용량 초과 | 1008 `Server at capacity` 수신 후 백오프 재시도 |
| 파싱 실패 `this is not json` | 경고 후 무시, 연결 유지 |
| 최상위 배열 `[1,2,3]` | 경고 후 무시, 연결 유지 |
| `type` 없음 `{"seq":9}` | 경고 후 무시, 연결 유지 |
| 계약에 없는 `future_message` | 경고 후 무시, 연결 유지 |

검증 중 드러난 사실 셋을 남긴다.

첫째, 게이트웨이가 계약에 없는 프레임 두 종을 보낸다. 접속 직후의 `{"type":"gateway_connected","timestamp":...}` 와 거부 시의 `{"type":"gateway_error","reason":...,"timestamp":...}` 다. `docs/protocol/` 어디에도 정의가 없다. 처음에는 클라이언트가 접속할 때마다 "계약에 없는 type" 경고를 냈다. `protocol.gd` 에 `GATEWAY_TYPES` 를 두어 별도로 다루도록 고쳤다. `gateway_error` 는 무시하면 사용자가 거부 원인을 알 수 없으므로 화면에 표시한다. 계약 문서에 이 두 프레임을 추가할지는 게이트웨이 쪽 결정 사항이다.

둘째, 용량 초과에서는 `gateway_error` 프레임이 클라이언트에 도달하지 않는다. 게이트웨이가 프레임을 보낸 직후 1008 로 닫아 경합에서 종료가 이긴다. 실제로 클라이언트가 원인을 아는 경로는 종료 코드 1008 과 사유 문자열이다. `gateway_error` 처리는 연결이 유지되는 경우(프레임 규약 위반)를 위해 남긴다.

셋째, Godot 의 로그 파일 회전 규칙이다. `user://logs/godot.log` 가 현재 실행이고 타임스탬프가 붙은 파일은 회전된 이전 실행이다. 최신 타임스탬프 파일을 읽으면 한 번 전 실행을 보게 된다.

- [x] 2. 다국어 처리
- [x] 2.1 번역 파일 이관
  - 서버의 `data/translations/` 9개 파일을 `godot/resources/translations/`로 옮긴다. Python `str.format` 포맷 스펙(`{value:>10}`, `{value!r}`)과 리터럴 중괄호(`{{`)가 있는 값을 전수 확인해 GDScript 호환 형태로 정리한다.
  - 선행 조건: 서버 `server-json-protocol` Task 6.5(번역 파일 이관 시점). 서버가 추가한 새 키 목록을 함께 받는다.
  - 커밋 `d1cbbc9`. 이관 9개 + 신규 2개(`account.json`, `social.json`) = 11개 파일. 포맷 스펙과 `{{` 리터럴은 전수 검사 결과 0건이므로 값 변환 없이 그대로 옮겼다. Godot 프로젝트가 아직 없어 리소스만 배치한 상태이며 `2.2 Translator` 에서 실제로 읽는다.
  - _Requirements: 3.1, 3.4_
- [x] 2.2 Translator 구현
  - `scripts/i18n/translator.gd`에 `t(key, params)`를 구현한다. GDScript `String.format`이 딕셔너리 키를 `{name}` 자리표시자로 지원하므로 문법 변환 없이 사용한다. `params` 값이 언어별 dict면 현재 locale 값을 고르고 스칼라면 그대로 치환한다.
  - 키가 없으면 키 문자열을 반환하고 경고를 기록한다. 현재 locale 번역이 없으면 `en`으로 폴백한다.
  - `class_name TranslatorService`. autoload 이름 `Translator` 와 같은 이름은 Godot 이 금지한다. `GameStateStore` 와 같은 이유이고 주입 방식도 같다.
  - `load_translations()` 를 `_ready` 와 분리했다. 테스트가 씬 트리 없이 `TranslatorService.new()` 로 만들어 직접 부른다.
  - `render(message)` 를 추가했다. `{"key": ..., "params": ...}` 형태가 `event`, `login_result.message`, 대화 대사에 공통이라 Task 5.9 와 9.1 이 그대로 쓴다.
  - 클라이언트 UI 문구는 `resources/translations/ui.json` 에 새로 뒀다. 서버에서 이관한 11개 파일은 게임 콘텐츠이고 UI 문구는 클라이언트 소유다. 키가 겹치면 경고를 남긴다.
  - _Requirements: 3.2, 3.3, 3.5, 3.6_
- [x] 2.3 Locale 전환
  - Locale 전환 UI를 제공하고 선택을 로컬에 저장한다. 전환 시 화면을 다시 그리며 재접속을 요구하지 않는다.
  - `scenes/common/locale_selector.tscn` 을 만들고 `boot.tscn` 상단 줄에 연결 표시와 나란히 뒀다. 선택은 `user://client.cfg` 에 저장된다.
  - 언어 이름 목록만은 번역하지 않는다. 현재 locale 이 무엇이든 자기 언어를 알아볼 수 있어야 한다.
  - 화면은 문구를 문자열이 아니라 키와 params 로 들고 있다가 `locale_changed` 에 다시 그린다. 표시 문자열만 갖고 있으면 다시 그릴 수 없다. 연결 표시의 재연결 카운트다운, 로그인 화면의 안내, 조립 지점의 알림이 모두 이 방식이다.
  - Task 1.8 과 3 이 하드코딩했던 문구를 모두 키로 옮겼다.
  - _Requirements: 3.8, 3.9_
- [x] 2.4 엔티티 이름 선택과 조사 처리
  - 서버가 보낸 언어별 dict에서 현재 locale 값을 선택하는 공통 함수를 제공한다. 한국어 조사는 번역 값의 완성형(`{item}을(를)`)을 그대로 표시한다. 채팅 본문은 번역하지 않는다.
  - 공통 함수는 `Translator.pick(value)` 다. 엔티티 이름과 설명, 방 설명, `params` 안의 언어별 dict 가 모두 같은 형태이므로 하나로 처리한다. 스칼라와 `null` 도 받아 문자열로 돌려준다. 서버가 지원하는 언어가 클라이언트보다 적으면 `en` 으로 떨어진다.
  - 조사는 종성 판별을 하지 않는다. 번역 값이 `{item}을(를)` 완성형을 담고 그대로 표시한다. 향후 개선 지점이며 테스트로 이 동작을 고정했다.
  - 채팅 본문은 `chat` 메시지의 `message` 필드를 그대로 쓴다. 번역 경로를 타지 않는다. 실제 표시는 Task 5.7 이다.
  - _Requirements: 3.7, 3.10, 3.11_
- [x] 2.5 번역 단위 테스트
  - 키와 params 조합으로 기대 문자열을 검증한다. 언어별 dict params, 키 없음 폴백, locale 폴백을 포함한다.
  - 테스트 프레임워크를 여기서 정했다. gdUnit4 와 GUT 는 저장소 밖에서 내려받아 `addons/` 에 넣어야 하는데 이 환경에서 받을 수 없었다. 그리고 지금 필요한 검증(번역 치환, 액션 규칙, 메시지 디스패치)은 씬 트리도 목(mock)도 필요 없는 순수 로직이다. `tests/test_case.gd`(단언)와 `tests/runner.gd`(탐색과 실행) 두 파일로 충분하다. 목이나 매개변수화 테스트가 필요해지면 다시 판단한다.
  - `npm run test:godot` 으로 돌린다. 러너는 `--script` 경로라 종료 코드가 신뢰할 수 있다. 그래도 외부 타임아웃을 건다. 런타임 오류가 나면 `quit()` 에 닿지 못해 프로세스가 멈추기 때문이다.
  - 18건. 리소스 적재, 키 치환, locale 전환, 지원하지 않는 locale 거부, params 치환, 언어별 dict params 를 양쪽 locale 에서, 키 없음 폴백, locale 폴백, `pick` 세 경우, `render` 두 경우, 조사 완성형, 서버 리소스 키 적재.
  - 계약 문서의 오류를 하나 찾았다. `server-to-client.md` 의 `event` 예시가 쓰는 `combat.damage_dealt` 는 존재하지 않는 키다. 실제 서버가 보내는 것은 `combat.hit`, `combat.critical_hit`, `combat.attack_swing` 이다. 테스트는 실제 키로 썼다.
  - _Requirements: 13.5_

- [x] 3. 로그인과 로그아웃
  - `scenes/login/login.tscn`을 만든다. 사용자명과 비밀번호 입력, `login` 메시지 송신, `reason_code`별 안내 표시를 구현한다. 회원가입 기능을 제공하지 않고 랜딩 사이트 링크만 표시한다. 자동 로그인 옵션을 제공하며 자격 정보를 평문으로 보관하지 않는다. 로그아웃은 `logout` 송신 후 로그인 화면으로 전환하고 연결을 유지한다. `is_admin`이 참일 때만 어드민 진입 버튼을 노출한다. `room_info`, `player_state`, `inventory`를 모두 받은 뒤 게임 화면을 표시한다.
  - 만든 것은 `scenes/login/`(폼), `scenes/main/`(게임 화면 자리), `scripts/auth/credential_store.gd` 다. `scenes/boot/boot.tscn` 이 두 화면을 담는 그릇이 됐다.
  - `scenes/main/` 을 지금 만든 이유는 로그아웃 버튼과 어드민 진입 버튼이 갈 곳이 필요해서다. 버릴 임시 씬을 따로 만드는 대신 Task 5.1 이 채울 파일을 미리 열었다. 지금은 플레이어 요약과 좌표, 버튼 둘만 있다.
  - 요구사항 4.7 과 계약이 어긋난다. 요구사항은 `is_admin` 이 참일 때 어드민 버튼을 노출하라고 하지만, 계약(`docs/protocol/server-to-client.md`)은 `admin_channel.available` 이 참일 때만 노출하라고 한다. 권한이 있어도 어드민 포트를 열지 않은 배포가 있기 때문이다. 계약을 따랐다. 요구사항 문서가 서버 Task 7.1 이전에 쓰였다.
  - 자격 정보는 `FileAccess.open_encrypted_with_pass` 로 암호화해 `user://credentials.dat` 에 둔다. 열쇠는 설치마다 무작위로 만들어 `user://install.key` 에 둔다. 이것이 막는 것과 못 막는 것을 분명히 해 둔다. 파일을 눈으로 열어 보는 수준과 백업·동기화 폴더로 자격 정보가 흘러가는 것은 막는다. 같은 사용자 권한으로 로컬 파일에 접근하는 공격자는 열쇠 파일도 읽으므로 막지 못한다. 그 수준은 OS 키체인이 필요하고 Godot 이 접근 수단을 주지 않는다.
  - 로그인 실패 시 저장된 자격을 지우고 자동 로그인을 끈다. 틀린 자격으로 재접속마다 실패를 반복하는 고리를 만들지 않는다.
  - 거절 사유 문구는 화면이 자체 보유한다. 서버가 `message.key` 를 함께 보내지만 실패 사유가 셋뿐이고 화면 맥락에 맞는 안내가 필요하다. Task 11.1 의 어드민 패널도 같은 방식이다. Task 2.3 에서 Translator 를 거치게 한다.
  - 스냅샷 셋을 세는 것은 `GameStateStore.snapshot_received` 신호다. `player_changed` 는 `login_result` 에서도 발신되어 `player_state` 도착과 구별되지 않는다.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

### Task 3 통합 검증 (2026-08-11)

실제 MUD 서버(`Echoes-of-the-Fallen-Age`)와 게이트웨이를 띄우고 확인했다. 헤드리스에서는 버튼을 누를 수 없어 임시 프로브 씬으로 눌렀고 검증 후 삭제했다. 계정은 검증용으로 만든 `godottest` 다.

| 확인 항목 | 결과 |
|---|---|
| 자동 로그인 | 암호화 저장 → 재기동 후 복원 → `READY` 직후 자동 송신 |
| 로그인 성공 | `login_result` 성공 후 `room_info`·`player_state`·`inventory` 셋을 받고 게임 화면 진입 |
| 로그인 실패 | 틀린 비밀번호로 `INVALID_CREDENTIALS`, 로그인 화면 유지, 자동 로그인 해제 |
| 로그아웃 | `logout_result` 후 로그인 화면 전환, 연결은 `READY` 유지 |
| 재로그인 | 같은 연결에서 다시 로그인해 게임 화면 재진입 |
| 어드민 버튼 | `admin_channel.available` 이 참이면 노출, 거짓이면 숨김 |

이 검증이 서버 결함 넷을 드러냈다. 넷 모두 계약 위반이라 서버 저장소에서 고쳤다.

| 결함 | 계약 | 고친 곳 |
|---|---|---|
| 로그인 후 `room_info` 만 보내고 `player_state`·`inventory` 를 보내지 않음 | README 연결 수명주기 4항 | `telnet_server._send_login_snapshots` |
| `logout` 이 연결을 닫음 | client-to-server.md logout | `telnet_server._handle_logout`, `TelnetSession.deauthenticate` |
| 인증 루프에 `login` 분기가 없어 재로그인 불가 | 로그아웃 후 다른 계정 접속 | `telnet_server._handle_authenticated_message` |
| 같은 연결의 재로그인을 중복 로그인으로 판정해 자기 자신을 끊음 | — | `handle_login` 의 자기 세션 제외 |

`client_info` 로그가 없는 필드(`client`)를 읽어 항상 `None` 을 찍던 것도 함께 고쳤다. 계약의 필드는 `client_version`, `platform`, `locale` 이다.

- [ ] 4. 액션 규칙 테이블
- [ ] 4.1 규칙 구현
  - `scripts/rules/action_rules.gd`에 design.md의 규칙 표를 구현한다. 몬스터(방), 오브젝트(방), 오브젝트(인벤토리), 플레이어(방), 전투 중 각각의 조건별 동사 목록을 반환한다. 서버가 보낸 속성만 판단 근거로 사용한다.
  - _Requirements: 6.1, 6.2, 6.3_
- [ ] 4.2 거절 응답 처리
  - Rejection_Code별 처리를 구현한다. `NOT_APPLICABLE`은 버튼 제거만 하고 오류로 표시하지 않는다. `NOT_FOUND`는 `look`으로 재동기화, `NOT_AUTHENTICATED`는 로그인 화면 전환이다. 나머지는 design.md의 표를 따른다.
  - _Requirements: 6.4, 6.5, 6.6, 6.7_
- [ ] 4.3 규칙 단위 테스트
  - 엔티티 속성 조합을 넣어 기대 버튼 목록을 검증한다.
  - _Requirements: 13.5_

- [ ] 5. 방 정보와 이동
- [ ] 5.1 방 표시
  - `scenes/main/main.tscn`에 방 설명, 시간대, 좌표를 표시한다. 방 이름을 표시하지 않는다. `rooms` 테이블에 이름 컬럼이 없다.
  - _Requirements: 5.1, 5.2_
- [ ] 5.2 출구와 진입 버튼
  - 이동 가능한 출구를 버튼으로, 막힌 출구를 비활성 상태로 표시한다. `move` verb에 `direction` params를 담아 전송한다.
  - `room.has_passage`가 참이면 진입 버튼을 표시하고 `enter` verb를 전송한다. `enter`는 `room_connections` 기반이므로 target이 없다.
  - _Requirements: 5.3, 2.3_
- [ ] 5.3 엔티티 버튼 렌더링
  - `scenes/main/entity_button.tscn`을 만들고 방 엔티티를 버튼으로 표시한다. `disposition`에 따라 인물(friendly), 동물(neutral), 적(hostile) 구역으로 나눈다. 오브젝트는 스택 수량을 함께 표시한다. 화면을 넘칠 경우 구역별 스크롤을 적용한다.
  - _Requirements: 5.4, 5.5, 5.8, 2.1_
- [ ] 5.4 미니맵
  - `scenes/main/minimap.tscn`에서 `nearby_rooms` 좌표 배열로 미니맵을 렌더링한다. 북쪽이 y 증가 방향이므로 화면 y축을 반전한다. 현재 위치는 `room.x`, `room.y` 비교로 판별한다.
  - _Requirements: 5.6, 5.11_
- [ ] 5.5 지형 매핑
  - `scripts/rules/terrain.gd`에 22종 지형의 아이콘과 색상을 매핑한다. 목록에 없는 값은 `unknown`으로 처리한다.
  - _Requirements: 5.7_
- [ ] 5.6 부분 갱신
  - `entity_enter`, `entity_leave`, `entity_update`로 방 상태를 부분 갱신한다. `entity_update` 대상이 사본에 없으면 `look` verb로 전체를 재요청한다.
  - _Requirements: 5.9, 5.10_
- [ ] 5.7 채팅
  - 채팅 입력 수단과 채널 선택(`room`, `whisper`)을 제공하고 `chat` 메시지로 전송한다. 귓속말은 수신 플레이어의 Entity_UUID를 `to`에 담는다. 수신한 `chat`을 채널별로 구분해 표시하며 본문은 번역하지 않는다. 이곳이 자유 문자 입력이 허용되는 지점이다.
  - _Requirements: 5.12, 5.13, 5.14, 2.4_
- [ ] 5.8 접속자 목록
  - `who`와 `players_here` verb로 목록을 조회하고 `who_result`를 표시한다. 이 목록에서 귓속말 대상 Entity_UUID를 확보한다. 서버가 좌표를 포함하지 않음을 전제한다.
  - _Requirements: 5.15_
- [ ] 5.9 이벤트 로그
  - 수신한 `event`를 번역해 로그에 누적하고 `category`(combat, movement, item, social, system, dialogue)로 채널을 분류한다. 로그 상한은 최근 500건이다.
  - _Requirements: 5.16_
- [ ] 5.10 따라가기와 감정 표현
  - `unfollow` 액션을 제공한다. `emote`는 목록에서 선택하는 방식으로 제공하며 자유 문자 입력을 받지 않는다.
  - _Requirements: 5.17_

- [ ] 6. 대상 선택 UI
  - `scenes/main/action_popover.tscn`을 만든다. 엔티티 버튼 클릭으로 대상을 선택하고 이름, 설명, 상태(HP, 종족, 관계)와 적용 가능한 동사 버튼을 표시한다. 선택 상태를 시각적으로 표시하고 대상이 방에서 사라지면 선택을 해제한다. Entity_UUID를 사용자에게 노출하지 않고 전송에만 사용한다. 인라인 팝오버를 기본으로 하되 고정 사이드 패널 대안을 함께 검토한다.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [ ] 7. 인벤토리와 아이템
- [ ] 7.1 인벤토리 화면
  - `scenes/inventory/inventory.tscn`을 만든다. 아이템 목록, 개별 무게(`weight × stack_count`), 총 무게와 최대 무게, 골드를 표시한다. 스택 아이템을 하나의 항목으로 표시하고 수량을 보여준다. 카테고리 필터(weapon, armor, consumable, misc)를 제공한다.
  - _Requirements: 8.1, 8.2, 8.3, 8.5_
- [ ] 7.2 장착 슬롯
  - 슬롯별 현재 장비를 표시하고 빈 슬롯을 구분한다. `equip`, `unequip` 액션을 제공한다.
  - _Requirements: 8.4_
- [ ] 7.3 수량 지정
  - `drop`, `put`, `shop_sell`에서 수량 선택 수단을 제공한다. 순서 번호로 아이템을 지정하지 않는다.
  - _Requirements: 8.6, 8.7_
- [ ] 7.4 컨테이너
  - `container_contents` 응답으로 컨테이너 내용을 표시하고 `put`, `take_from`을 제공한다.
  - _Requirements: 8.8_

- [ ] 8. 전투 UI
  - `scenes/combat/combat.tscn`을 만든다. 라운드, 현재 턴, 턴 순서를 표시하고 적과 우리 편 HP를 시각화한다. 액션 버튼(공격, 아이템, 도주, 턴 종료)에 키보드 단축키(1, 4, 3, 9)를 병기하되 숫자를 서버로 보내지 않고 대응 verb로 변환해 전송한다. 공격 대상을 선택해 `attack` verb의 `target`에 담는다. 내 턴이 아니면 액션 버튼을 비활성화한다. `is_over`가 참이면 전투 화면을 닫고 탐험 화면으로 전환한다. 전투 로그는 Message_Key_Payload를 번역해 누적한다.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 2.6_

- [ ] 9. 대화와 상점
- [ ] 9.1 대화 화면
  - `scenes/dialogue/dialogue.tscn`을 만든다. NPC 발화와 선택지를 표시하고 선택 시 `dialogue_choice` verb의 `params.choice`에 로컬 번호를 담아 전송한다. `is_active`가 거짓이면 창을 닫는다.
  - _Requirements: 10.1, 10.2, 10.3, 10.4_
- [ ] 9.2 상점 화면
  - `scenes/shop/shop.tscn`을 만든다. 상점 목록과 매수가, 매도가를 표시한다. 구매는 `template_id`, 판매는 Entity_UUID를 사용한다. `buy_price` 또는 `sell_price`가 0이면 해당 방향 버튼을 숨긴다. `INSUFFICIENT_FUNDS` 거절 시 부족 금액을 안내한다.
  - _Requirements: 10.5, 10.6, 10.7, 10.8_

- [ ] 10. 상태 화면
  - `scenes/status/status.tscn`을 만든다. 능력치 6종, HP와 스태미나, 장비 보너스와 임시 효과, 표시 이름과 사용자명과 종족을 표시한다. `changename` 액션으로 표시 이름 변경을 제공하고 `COOLDOWN` 거절 시 남은 시간을 안내한다.
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

- [ ] 11. 어드민 패널
  - 선행 조건: 서버 `server-json-protocol` Task 7 완료, `gateway-landing` Task 3.2(어드민 프록시) 완료
- [ ] 11.1 어드민 접속 계층
  - `scripts/admin/admin_connection.gd`가 Admin_Channel(`/admin`)로 별도 접속한다. 게임 연결과 독립적이다. `admin_login`으로 별도 인증하고 세션 만료(2시간)를 처리해 재인증을 요구한다. 게임 로그인 상태가 어드민 권한을 부여하지 않는다.
  - `scripts/admin/admin_dispatcher.gd`가 어드민 메시지를 처리한다. 거절 응답에 번역 키가 없으므로 Rejection_Code별 안내 문구를 자체 보유한다.
  - _Requirements: 12.1, 12.2, 12.13, 12.14_
- [ ] 11.2 월드 맵 뷰
  - `scenes/admin/map_view.tscn`에 방 그리드를 렌더링한다. 지형 색상, 종족 색상, 막힌 출구를 표시한다. 방 선택 시 상세(좌표, 지형, 설명, 막힌 출구, 엔티티 수, 종족 분포)를 표시한다. 자동 갱신을 제공하고 켜고 끌 수 있게 한다.
  - _Requirements: 12.3, 12.4, 12.5_
- [ ] 11.3 리소스 테이블
  - `scenes/admin/resource_table.tscn`에 8개 리소스(players, rooms, room_connections, monsters, objects, item_prices, factions, faction_relations)의 목록을 표시한다. 페이지네이션, 필터, 정렬을 제공한다. 데이터는 원본 컬럼명(`name_en`, `name_ko`)으로 표시한다.
  - _Requirements: 12.6, 12.7, 12.8_
- [ ] 11.4 CRUD 폼
  - 리소스별 생성, 수정, 삭제 폼을 제공한다. 삭제 시 확인을 요구하고 `REFERENCED` 응답에서 참조 목록을 표시한다.
  - _Requirements: 12.6, 12.9_
- [ ] 11.5 통계와 실시간 액션
  - 통계(방, 몬스터, 플레이어, 접속자, 오브젝트, 종족 수)를 표시한다. 실시간 액션 14종(`goto`, `kick`, `spawn_monster`, `spawn_item`, `terminate`, `create_room`, `update_room`, `create_exit`, `validate_world`, `list_monster_templates`, `list_item_templates`, `scheduler`, `change_display_name`, `room_info`)을 제공한다.
  - _Requirements: 12.10, 12.11_
- [ ] 11.6 플레이어 상세
  - 플레이어 인벤토리와 능력치를 조회하는 화면을 제공한다.
  - _Requirements: 12.12_

- [ ] 12. 품질 정리와 최종 검증
- [ ] 12.1 입력 제약 확인
  - 자유 문자 입력이 채팅, 로그인, `changename`, 어드민 CRUD 폼에만 존재함을 확인한다. 명령어 입력창이 없고 verb나 uuid를 직접 입력하는 경로가 없음을 확인한다.
  - _Requirements: 2.4, 2.5, 2.7_
- [ ] 12.2 구조 정리
  - 스크립트 파일 길이를 500행 이내로 유지한다. 뷰가 커지면 하위 씬으로 분리한다. 게임 규칙 판정이 클라이언트에 없음을 확인한다.
  - _Requirements: 13.3, 13.4_
- [ ] 12.3 메시지 디스패치 테스트
  - 프로토콜 계약의 예시 페이로드를 픽스처로 사용해 상태 반영을 검증한다. `entity_update` 부분 갱신 병합을 포함한다.
  - _Requirements: 13.5_
- [ ] 12.4 영국 영어 확인
  - 영어 텍스트에 영국 영어 철자와 어휘가 적용됐는지 확인한다. `-ise`, `-our`, `-re`, `defence` 표기를 따른다.
  - _Requirements: 13.6_
- [ ] 12.5 통합 검증
  - 서버와 게이트웨이를 기동하고 로그인부터 전투, 대화, 상점, 인벤토리, 어드민까지 전체 흐름을 확인한다. 계약에 정의된 모든 서버 메시지에 수신 처리가 있고 모든 클라이언트 메시지가 서버에서 처리되는지 점검한다.
  - _Requirements: 1.3, 1.4_

## Task Dependency Graph

```mermaid
flowchart TD
    T1[1. 기반과 연결] --> T2[2. 다국어]
    T1 --> T3[3. 로그인]
    T2 --> T4[4. 액션 규칙]
    T3 --> T5[5. 방 정보와 이동]
    T4 --> T5
    T5 --> T6[6. 대상 선택]
    T6 --> T7[7. 인벤토리]
    T6 --> T8[8. 전투]
    T6 --> T9[9. 대화와 상점]
    T5 --> T10[10. 상태 화면]
    T1 --> T11[11. 어드민]
    T7 --> T12[12. 최종 검증]
    T8 --> T12
    T9 --> T12
    T10 --> T12
    T11 --> T12
    S65[서버 Task 6.5<br/>번역 파일 이관] -.-> T2
    S7[서버 Task 7<br/>어드민 채널] -.-> T11
    G32[게이트웨이 3.2<br/>어드민 프록시] -.-> T11
```

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9"] },
    { "wave": 2, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5"] },
    { "wave": 3, "tasks": ["3"] },
    { "wave": 4, "tasks": ["4.1", "4.2", "4.3"] },
    { "wave": 5, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "5.9", "5.10"] },
    { "wave": 6, "tasks": ["6"] },
    { "wave": 7, "tasks": ["7.1", "7.2", "7.3", "7.4", "8", "9.1", "9.2", "10"] },
    { "wave": 8, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5", "11.6"] },
    { "wave": 9, "tasks": ["12.1", "12.2", "12.3", "12.4", "12.5"] }
  ]
}
```

의존성 요약:

- 1은 모든 작업의 전제다. 연결과 상태 저장소 없이 어떤 화면도 만들 수 없다.
- 2는 화면 구현 전에 필요하다. 모든 텍스트가 번역을 거친다.
- 4는 5보다 먼저 있어야 엔티티 버튼에 동사를 붙일 수 있다.
- 6은 7, 8, 9의 전제다. 대상 선택 방식이 확정돼야 각 화면이 일관된다.
- 11은 게임 화면과 독립적이므로 병렬 진행이 가능하나 서버와 게이트웨이의 어드민 경로가 필요하다.
- 7, 8, 9, 10은 서로 독립적이므로 병렬 진행이 가능하다.

## 저장소 간 조율

| 이 스펙의 작업 | 대응 | 관계 |
|---|---|---|
| 2.1 번역 파일 이관 | 서버 Task 6.5 | 서버가 파일과 추가 키 목록 제공 |
| 5, 6, 7, 8, 9, 10 | 서버 Task 3~6 | 서버 JSON 프로토콜 완성 후 통합 검증 가능 |
| 11 어드민 | 서버 Task 7, 게이트웨이 3.2 | 양쪽 선행 |
| 3 로그인 | 게이트웨이 Task 2 | 라인 프레이밍이 있어야 통신 성립 |

단위 테스트가 가능한 작업(2.5, 4.3, 12.3)은 서버 상태와 무관하게 진행할 수 있다. 계약의 예시 페이로드를 픽스처로 쓴다.

## Notes

- 프로토콜 계약(서버 저장소 `docs/protocol/`)이 유일한 접점이다. 계약이 바뀌면 즉시 반영한다.
- GDScript `String.format`이 `{name}` 문법을 지원하므로 번역 파일을 변환 없이 재사용한다. 단 Python 포맷 스펙과 `{{` 이스케이프는 지원하지 않으므로 이관 시 확인한다.
- 게임 규칙은 판정하지 않는다. 액션 규칙 테이블은 버튼 구성을 위한 표시 규칙이다.
- 낙관적 버튼 구성이므로 `NOT_APPLICABLE` 거절은 정상 동작이다. 오류로 표시하지 않는다.
- 어드민 패널은 기존 웹 UI 3,846행에 대응하는 규모다. 맵 뷰어와 리소스 테이블을 우선하고 개별 CRUD 폼은 점진적으로 채운다.
- 이모지 아이콘은 초기 구현용이다. 최종적으로 스프라이트로 교체하되 매핑 구조는 유지한다.
