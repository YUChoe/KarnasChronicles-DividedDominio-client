# 요구사항 문서

## 소개

Karnas Chronicles: Divided Dominion 프로젝트의 웹 관리자 패널 기능이다. 기존 WebSocket 게이트웨이 서버(포트 3000)에 HTTP 엔드포인트를 추가하여 `/webadmin` URI 경로 아래에 관리자 전용 웹 인터페이스를 제공한다. SQLite3 데이터베이스(data/mud_engine.db)에 직접 접근하여 플레이어, 맵(방), 몬스터, 게임 오브젝트를 CRUD 관리하며, 대시보드에서 월드 맵을 시각적으로 확인할 수 있다.

## 용어 정의

- **Admin_Panel**: `/webadmin` URI 경로 아래에서 동작하는 웹 기반 관리자 인터페이스 전체 시스템
- **Gateway_Server**: 포트 3000에서 실행되는 기존 WebSocket 게이트웨이 서버 (src/server/gateway.ts)
- **Auth_Module**: 관리자 인증을 처리하는 모듈. 세션 기반 간단한 인증을 제공한다
- **Dashboard**: 데이터베이스에서 rooms, monsters, players, game_objects 데이터를 조회하여 좌표 기반 그리드 맵(45x28)을 동적으로 렌더링하는 대시보드 페이지. data/world_map_unified.html과 동일한 시각화 방식(방 셀에 몬스터/플레이어 인디케이터 표시, 클릭 시 방 상세 정보 표시, 자동 새로고침)을 직접 구현한다
- **World_Map_Renderer**: Dashboard 내에서 DB 데이터를 기반으로 좌표 그리드 맵을 렌더링하는 클라이언트 측 컴포넌트. 방 셀, 빈 셀, 몬스터/플레이어 인디케이터, 툴팁, 방 상세 패널을 포함한다
- **Player_Manager**: 플레이어 레코드의 생성, 조회, 수정, 삭제 및 플레이어 소유 오브젝트 관리 기능
- **Room_Editor**: 방(rooms) 레코드와 방 연결(room_connections) 레코드의 조회, 생성, 수정, 삭제 기능
- **Monster_Editor**: 몬스터(monsters) 레코드의 조회, 생성, 수정, 삭제 기능
- **Object_Editor**: 게임 오브젝트(game_objects) 레코드의 조회, 생성, 수정, 삭제 기능
- **DB_Client**: SQLite3 데이터베이스(data/mud_engine.db)에 접근하는 서버 측 데이터 접근 계층
- **API_Router**: `/webadmin/api/*` 경로의 REST API 요청을 처리하는 라우터

## 요구사항

### 요구사항 1: HTTP 서버 통합

**사용자 스토리:** 관리자로서, 기존 게이트웨이 서버와 동일한 포트에서 웹 관리자 패널에 접근하고 싶다. 별도 서버를 띄우지 않고 운영 복잡도를 줄이기 위함이다.

#### 인수 조건

1. WHEN `/webadmin`으로 시작하는 경로의 HTTP 요청이 수신되면, THE Gateway_Server SHALL 해당 요청을 Admin_Panel 핸들러로 라우팅한다
2. WHILE Admin_Panel이 활성 상태인 동안, THE Gateway_Server SHALL 기존 경로의 WebSocket 업그레이드 요청을 중단 없이 계속 처리한다
3. THE Gateway_Server SHALL `/webadmin` 경로에서 Admin_Panel용 정적 HTML, CSS, JavaScript 파일을 서빙한다
4. IF `/webadmin`에 대한 HTTP 요청이 내부 오류로 실패하면, THEN THE Gateway_Server SHALL HTTP 500 응답과 JSON 오류 메시지를 반환한다

### 요구사항 2: 관리자 인증

**사용자 스토리:** 관리자로서, 간단한 인증을 통해 관리자 패널에 접속하고 싶다. 비인가 사용자의 접근을 차단하기 위함이다.

#### 인수 조건

1. WHEN 인증되지 않은 요청이 `/webadmin` 경로(로그인 페이지 제외)에 도달하면, THE Auth_Module SHALL 해당 요청을 로그인 페이지로 리다이렉트한다
2. WHEN 유효한 자격 증명이 로그인 엔드포인트에 제출되면, THE Auth_Module SHALL 세션을 생성하고 세션 쿠키를 설정한다
3. WHEN 유효하지 않은 자격 증명이 로그인 엔드포인트에 제출되면, THE Auth_Module SHALL HTTP 401 응답과 오류 메시지를 반환한다
4. WHEN 인증된 세션이 만료되거나 사용자가 로그아웃하면, THE Auth_Module SHALL 세션을 무효화하고 로그인 페이지로 리다이렉트한다
5. THE Auth_Module SHALL 관리자 자격 증명을 환경 변수(WEBADMIN_USERNAME, WEBADMIN_PASSWORD)에 저장한다
6. WHILE 유효한 세션이 존재하는 동안, THE Auth_Module SHALL 재인증 없이 모든 Admin_Panel 엔드포인트에 대한 접근을 허용한다

### 요구사항 3: 대시보드 및 월드 맵 시각화

**사용자 스토리:** 관리자로서, 대시보드에서 월드 맵을 시각적으로 확인하고 싶다. 게임 월드의 전체 구조를 한눈에 파악하기 위함이다.

#### 인수 조건

1. WHEN 대시보드 페이지가 로드되면, THE Dashboard SHALL `/webadmin/api/map` 엔드포인트를 호출하여 rooms, monsters, players, game_objects 데이터를 조회하고 좌표 기반 그리드 맵을 동적으로 렌더링한다
2. THE World_Map_Renderer SHALL 방이 존재하는 좌표에는 방 셀(room class)을, 방이 없는 좌표에는 빈 셀(empty class)을 표시하는 좌표 기반 그리드 테이블을 렌더링한다
3. WHEN 방 셀에 몬스터 또는 플레이어가 존재하면, THE World_Map_Renderer SHALL 해당 셀 내에 색상 인디케이터(몬스터: 팩션별 색상, 플레이어: 초록색)를 표시한다
4. WHEN 방 셀 위에 마우스를 올리면, THE World_Map_Renderer SHALL 좌표, 출구 방향, 몬스터/플레이어 요약 정보를 포함하는 툴팁을 마우스 커서 위치에 표시한다
5. WHEN 방 셀을 클릭하면, THE World_Map_Renderer SHALL 방 상세 패널에 한국어/영어 설명, 생명체 목록(이름, HP, 팩션), 플레이어 목록, 아이템 목록, Enter 연결 정보를 표시한다
6. THE Dashboard SHALL 데이터베이스에서 조회한 플레이어, 방, 몬스터, 게임 오브젝트의 총 개수를 요약 통계로 표시한다
7. THE World_Map_Renderer SHALL 60초 간격으로 맵 데이터를 자동 새로고침하고 카운트다운 타이머를 표시한다
8. THE API_Router SHALL `/webadmin/api/map` 엔드포인트에서 rooms 테이블의 전체 방 목록과 각 방의 좌표에 위치한 monsters, players, game_objects 데이터를 조인하여 JSON으로 반환한다

### 요구사항 4: 플레이어 관리

**사용자 스토리:** 관리자로서, 플레이어 계정을 생성, 조회, 수정, 삭제하고 플레이어가 소유한 오브젝트를 관리하고 싶다. 게임 운영 중 플레이어 데이터를 직접 관리하기 위함이다.

#### 인수 조건

1. WHEN 플레이어 목록 엔드포인트가 요청되면, THE Player_Manager SHALL id, username, display_name, is_admin, faction_id, last_login, last_room 좌표를 포함하는 페이지네이션된 플레이어 목록을 반환한다
2. WHEN username과 password를 포함한 플레이어 생성 요청이 제출되면, THE Player_Manager SHALL UUID, 해시된 비밀번호, 기본 스탯 값을 가진 새 플레이어 레코드를 생성한다
3. WHEN 플레이어 수정 요청이 제출되면, THE Player_Manager SHALL 지정된 플레이어 필드(username, email, preferred_locale, is_admin, stats, display_name, faction_id, last_room 좌표)를 업데이트한다
4. WHEN 플레이어 삭제 요청이 제출되면, THE Player_Manager SHALL 해당 플레이어 레코드와 해당 플레이어가 소유한 모든 game_objects(location_type이 'INVENTORY' 또는 'EQUIPPED'이고 location_id가 해당 플레이어 id와 일치하는 레코드)를 삭제한다
5. WHEN 플레이어 인벤토리 엔드포인트가 요청되면, THE Player_Manager SHALL location_id가 해당 플레이어 id와 일치하고 location_type이 'INVENTORY' 또는 'EQUIPPED'인 모든 game_objects를 반환한다
6. IF 플레이어 생성 요청에 이미 존재하는 username이 포함되어 있으면, THEN THE Player_Manager SHALL HTTP 409 응답과 충돌 오류 메시지를 반환한다
7. IF 수정 또는 삭제할 플레이어 레코드가 존재하지 않으면, THEN THE Player_Manager SHALL HTTP 404 응답을 반환한다

### 요구사항 5: 맵(방) 에디터

**사용자 스토리:** 관리자로서, 게임 월드의 방을 생성, 조회, 수정, 삭제하고 방 간 연결을 관리하고 싶다. 게임 월드를 확장하거나 수정하기 위함이다.

#### 인수 조건

1. WHEN 방 목록 엔드포인트가 요청되면, THE Room_Editor SHALL id, x, y, description_en, description_ko, blocked_exits를 포함하는 페이지네이션된 방 목록을 반환한다
2. WHEN x, y 좌표와 설명을 포함한 방 생성 요청이 제출되면, THE Room_Editor SHALL UUID를 가진 새 방 레코드를 생성한다
3. WHEN 방 수정 요청이 제출되면, THE Room_Editor SHALL 지정된 방 필드(description_en, description_ko, x, y, blocked_exits)를 업데이트한다
4. WHEN 방 삭제 요청이 제출되면, THE Room_Editor SHALL 해당 방 레코드와 관련된 모든 room_connections(from_x/from_y 또는 to_x/to_y가 해당 방 좌표와 일치하는 레코드)를 삭제한다
5. WHEN 특정 방의 연결 엔드포인트가 요청되면, THE Room_Editor SHALL from_x/from_y가 해당 방 좌표와 일치하는 모든 room_connections를 반환한다
6. WHEN 방 연결 생성 요청이 제출되면, THE Room_Editor SHALL from_x, from_y, to_x, to_y를 포함하는 새 room_connection 레코드를 생성한다
7. IF 방 생성 요청에 이미 존재하는 좌표가 포함되어 있으면, THEN THE Room_Editor SHALL HTTP 409 응답과 충돌 오류 메시지를 반환한다
8. IF 수정 또는 삭제할 방 레코드가 존재하지 않으면, THEN THE Room_Editor SHALL HTTP 404 응답을 반환한다

### 요구사항 6: 몬스터 에디터

**사용자 스토리:** 관리자로서, 몬스터를 생성, 조회, 수정, 삭제하고 싶다. 게임 내 몬스터 밸런스를 조정하고 새로운 몬스터를 추가하기 위함이다.

#### 인수 조건

1. WHEN 몬스터 목록 엔드포인트가 요청되면, THE Monster_Editor SHALL id, name_en, name_ko, monster_type, behavior, x, y, is_alive, faction_id를 포함하는 페이지네이션된 몬스터 목록을 반환한다
2. WHEN 필수 필드(name_en, name_ko)를 포함한 몬스터 생성 요청이 제출되면, THE Monster_Editor SHALL UUID와 선택 필드의 기본값을 가진 새 몬스터 레코드를 생성한다
3. WHEN 몬스터 수정 요청이 제출되면, THE Monster_Editor SHALL 지정된 몬스터 필드(name_en, name_ko, description_en, description_ko, monster_type, behavior, stats, drop_items, respawn_time, aggro_range, roaming_range, properties, x, y, faction_id)를 업데이트한다
4. WHEN 몬스터 삭제 요청이 제출되면, THE Monster_Editor SHALL 해당 몬스터 레코드를 삭제한다
5. IF 수정 또는 삭제할 몬스터 레코드가 존재하지 않으면, THEN THE Monster_Editor SHALL HTTP 404 응답을 반환한다

### 요구사항 7: 게임 오브젝트 에디터

**사용자 스토리:** 관리자로서, 게임 오브젝트를 생성, 조회, 수정, 삭제하고 싶다. 아이템, 가구 등 게임 내 오브젝트를 관리하기 위함이다.

#### 인수 조건

1. WHEN 게임 오브젝트 목록 엔드포인트가 요청되면, THE Object_Editor SHALL id, name_en, name_ko, object_type, location_type, location_id, category, equipment_slot을 포함하는 페이지네이션된 게임 오브젝트 목록을 반환한다
2. WHEN 필수 필드(name_en, name_ko, object_type, location_type)를 포함한 게임 오브젝트 생성 요청이 제출되면, THE Object_Editor SHALL UUID와 선택 필드의 기본값을 가진 새 게임 오브젝트 레코드를 생성한다
3. WHEN 게임 오브젝트 수정 요청이 제출되면, THE Object_Editor SHALL 지정된 게임 오브젝트 필드(name_en, name_ko, description_en, description_ko, object_type, location_type, location_id, properties, weight, max_stack, category, equipment_slot, is_equipped)를 업데이트한다
4. WHEN 게임 오브젝트 삭제 요청이 제출되면, THE Object_Editor SHALL 해당 게임 오브젝트 레코드를 삭제한다
5. IF 수정 또는 삭제할 게임 오브젝트 레코드가 존재하지 않으면, THEN THE Object_Editor SHALL HTTP 404 응답을 반환한다

### 요구사항 8: REST API 설계

**사용자 스토리:** 관리자로서, 일관된 REST API를 통해 모든 관리 기능에 접근하고 싶다. 프론트엔드와 백엔드 간 명확한 인터페이스를 유지하기 위함이다.

#### 인수 조건

1. THE API_Router SHALL 모든 CRUD 엔드포인트를 `/webadmin/api` 경로 접두사 아래에 리소스 기반 URL 구조(예: `/webadmin/api/players`, `/webadmin/api/rooms`)로 노출한다
2. THE API_Router SHALL 모든 API 요청 및 응답 본문에 JSON 형식을 사용한다
3. WHEN 생성 작업이 성공적으로 완료되면, THE API_Router SHALL 생성된 리소스와 함께 HTTP 201 응답을 반환한다
4. WHEN 수정 또는 삭제 작업이 성공적으로 완료되면, THE API_Router SHALL HTTP 200 응답을 반환한다
5. WHEN 요청에 유효하지 않거나 누락된 필수 필드가 포함되어 있으면, THE API_Router SHALL 설명적인 유효성 검사 오류 메시지와 함께 HTTP 400 응답을 반환한다
6. THE API_Router SHALL 처리 전에 모든 수신 요청 본문을 예상 필드 타입에 대해 유효성 검사한다

### 요구사항 9: 데이터베이스 접근 계층

**사용자 스토리:** 관리자로서, 데이터베이스 작업이 안전하고 일관되게 수행되길 원한다. 데이터 무결성을 보장하기 위함이다.

#### 인수 조건

1. THE DB_Client SHALL DATA_DIR 환경 변수로 지정된 경로(기본값: `data/mud_engine.db`)의 SQLite3 데이터베이스 파일을 연다
2. THE DB_Client SHALL SQL 인젝션 방지를 위해 모든 데이터베이스 작업에 매개변수화된 쿼리를 사용한다
3. WHEN 데이터베이스 작업이 실패하면, THE DB_Client SHALL 컨텍스트 정보와 함께 오류를 로깅하고 호출자에게 설명적인 오류를 반환한다
4. THE DB_Client SHALL 동시 읽기 접근을 위해 SQLite3 연결에 WAL 모드를 활성화한다
5. THE DB_Client SHALL 모든 새 레코드의 기본 키에 UUID v4 식별자를 생성한다

### 요구사항 10: 프론트엔드 UI

**사용자 스토리:** 관리자로서, 직관적인 웹 인터페이스를 통해 관리 기능을 사용하고 싶다. 효율적인 게임 운영을 위함이다.

#### 인수 조건

1. THE Admin_Panel SHALL 대시보드, 플레이어, 방, 몬스터, 게임 오브젝트 섹션으로의 링크를 포함하는 내비게이션 메뉴를 제공한다
2. THE Admin_Panel SHALL 모든 목록 뷰를 페이지네이션 컨트롤이 포함된 HTML 테이블로 렌더링한다
3. WHEN 생성 또는 수정 액션이 트리거되면, THE Admin_Panel SHALL 선택된 리소스 타입에 적합한 입력 필드가 포함된 폼을 표시한다
4. WHEN 삭제 액션이 트리거되면, THE Admin_Panel SHALL 삭제 요청을 전송하기 전에 확인 대화상자를 표시한다
5. THE Admin_Panel SHALL 각 API 작업 완료 후 성공 또는 오류 피드백 메시지를 표시한다
6. THE Admin_Panel SHALL 외부 프론트엔드 프레임워크 의존성 없이 순수 HTML, CSS, JavaScript를 사용하는 단일 페이지 애플리케이션으로 동작한다
7. THE Admin_Panel SHALL 모든 제목(h1~h6) 요소의 폰트 크기를 30px 이하로 제한한다
8. THE Admin_Panel SHALL 모든 본문 텍스트(p, td, li, span, label, input 등) 요소의 폰트 크기를 14px 이하로 제한한다
