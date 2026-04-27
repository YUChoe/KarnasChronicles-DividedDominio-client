# 구현 계획: Web Admin Panel

## 개요

기존 WebSocket 게이트웨이 서버(포트 3000)에 HTTP 핸들링을 추가하여 `/webadmin` 경로 아래에서 관리자 전용 웹 인터페이스를 제공한다. `http.createServer` + `WebSocketServer({ noServer: true })` 방식으로 전환하고, `better-sqlite3`를 사용한 데이터 접근 계층, REST API, 순수 HTML/CSS/JS SPA 프론트엔드를 구현한다.

## 태스크

- [x] 1. 프로젝트 설정 및 의존성 추가
  - `better-sqlite3` 패키지와 `@types/better-sqlite3` 타입 설치
  - `src/server/webadmin/` 디렉토리 구조 생성 (admin-router.ts, auth.ts, db-client.ts, api/, public/)
  - `.env.example`에 `WEBADMIN_USERNAME`, `WEBADMIN_PASSWORD`, `DATA_DIR` 환경 변수 추가
  - _요구사항: 1.1, 9.1_

- [x] 2. Gateway 서버 변경 (http.createServer + noServer 모드)
  - [x] 2.1 gateway.ts를 `http.createServer` 기반으로 리팩토링
    - `new WebSocketServer({ port })` → `http.createServer` + `new WebSocketServer({ noServer: true })` 전환
    - `httpServer.on('upgrade')` 이벤트에서 `wss.handleUpgrade` 호출
    - `httpServer.listen(this.port)`으로 서버 시작
    - HTTP 요청은 AdminRouter로 위임, WebSocket 업그레이드는 기존 로직 유지
    - GatewayServer 생성자에 AdminRouter 의존성 주입
    - _요구사항: 1.1, 1.2_

  - [x] 2.2 start.ts 업데이트
    - AdminRouter, AuthModule, DBClient 인스턴스 생성 및 GatewayServer에 주입
    - 서버 종료 시 DBClient.close() 호출 추가
    - _요구사항: 1.1, 9.1_

  - [ ]* 2.3 gateway 변경에 대한 단위 테스트 작성
    - HTTP 요청이 AdminRouter로 라우팅되는지 검증
    - WebSocket 업그레이드가 정상 동작하는지 검증
    - _요구사항: 1.1, 1.2_

- [x] 3. 인증 모듈 구현 (auth.ts)
  - [x] 3.1 AuthModule 클래스 구현
    - `WEBADMIN_USERNAME`, `WEBADMIN_PASSWORD` 환경 변수에서 자격 증명 로드 (기본값: admin/admin)
    - `login(username, password)`: 자격 증명 검증 후 세션 생성, Session 객체 반환
    - `logout(sessionId)`: 세션 Map에서 제거
    - `validateSession(sessionId)`: 세션 존재 여부 및 만료 확인 (24시간)
    - `getSessionFromCookie(cookieHeader)`: 쿠키 헤더에서 `webadmin_session` 값 파싱
    - 세션 ID는 `crypto.randomUUID()`로 생성
    - 쿠키 설정: `webadmin_session=<id>; HttpOnly; Path=/webadmin; SameSite=Strict`
    - _요구사항: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 3.2 AuthModule 단위 테스트 작성
    - 유효한 자격 증명으로 로그인 성공 검증
    - 잘못된 자격 증명으로 로그인 실패 검증
    - 세션 만료 검증
    - 로그아웃 후 세션 무효화 검증
    - 쿠키 파싱 검증
    - _요구사항: 2.2, 2.3, 2.4_

- [x] 4. 체크포인트 - 서버 통합 및 인증 검증
  - 모든 테스트 통과 확인, 질문이 있으면 사용자에게 문의.

- [x] 5. 데이터베이스 접근 계층 구현 (db-client.ts)
  - [x] 5.1 DBClient 클래스 기본 구조 구현
    - `better-sqlite3`로 `DATA_DIR` 환경 변수 경로(기본값: `data/mud_engine.db`)의 DB 파일 열기
    - WAL 모드 활성화 (`PRAGMA journal_mode = WAL`)
    - `close()` 메서드로 DB 연결 종료
    - 모든 쿼리에 매개변수화된 쿼리(parameterized query) 사용
    - UUID v4 생성에 `crypto.randomUUID()` 사용
    - _요구사항: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 5.2 대시보드 데이터 조회 메서드 구현
    - `getMapData()`: rooms 테이블 전체 조회 + 각 방 좌표에 위치한 monsters, players, game_objects 조인
    - `getStats()`: players, rooms, monsters, game_objects 각 테이블의 레코드 수 반환
    - _요구사항: 3.1, 3.6, 3.8_

  - [x] 5.3 플레이어 CRUD 메서드 구현
    - `getPlayers(page, limit)`: 페이지네이션된 플레이어 목록 (id, username, display_name, is_admin, faction_id, last_login, last_room_x, last_room_y)
    - `getPlayerById(id)`: 플레이어 상세 조회
    - `createPlayer(data)`: UUID 생성, 비밀번호 해싱, 기본 스탯 값으로 레코드 생성
    - `updatePlayer(id, data)`: 지정 필드 업데이트
    - `deletePlayer(id)`: 플레이어 레코드 + 소유 game_objects (location_type='INVENTORY'/'EQUIPPED', location_id=player.id) 삭제
    - `getPlayerInventory(playerId)`: 플레이어 소유 game_objects 조회
    - username 중복 시 충돌 오류 반환
    - _요구사항: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 5.4 방 CRUD 메서드 구현
    - `getRooms(page, limit)`: 페이지네이션된 방 목록
    - `getRoomById(id)`: 방 상세 조회
    - `createRoom(data)`: UUID 생성, 좌표 중복 검사
    - `updateRoom(id, data)`: 지정 필드 업데이트
    - `deleteRoom(id)`: 방 레코드 + 관련 room_connections (from_x/from_y 또는 to_x/to_y 일치) 삭제
    - `getRoomConnections(x, y)`: 특정 방 좌표의 연결 목록
    - `createRoomConnection(data)`: 새 room_connection 레코드 생성
    - `deleteRoomConnection(id)`: room_connection 삭제
    - _요구사항: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 5.5 몬스터 CRUD 메서드 구현
    - `getMonsters(page, limit)`: 페이지네이션된 몬스터 목록
    - `getMonsterById(id)`: 몬스터 상세 조회
    - `createMonster(data)`: UUID 생성, 기본값 적용
    - `updateMonster(id, data)`: 지정 필드 업데이트
    - `deleteMonster(id)`: 몬스터 레코드 삭제
    - _요구사항: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 5.6 게임 오브젝트 CRUD 메서드 구현
    - `getGameObjects(page, limit)`: 페이지네이션된 게임 오브젝트 목록
    - `getGameObjectById(id)`: 게임 오브젝트 상세 조회
    - `createGameObject(data)`: UUID 생성, 기본값 적용
    - `updateGameObject(id, data)`: 지정 필드 업데이트
    - `deleteGameObject(id)`: 게임 오브젝트 레코드 삭제
    - _요구사항: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 5.7 DBClient 단위 테스트 작성
    - 인메모리 SQLite DB로 각 CRUD 메서드 검증
    - 페이지네이션 동작 검증
    - 존재하지 않는 레코드 조회/수정/삭제 시 null/false 반환 검증
    - 중복 키 충돌 검증 (username, 좌표)
    - 플레이어 삭제 시 소유 오브젝트 연쇄 삭제 검증
    - 방 삭제 시 관련 room_connections 연쇄 삭제 검증
    - _요구사항: 4.4, 4.6, 5.4, 5.7, 9.2_

- [x] 6. 체크포인트 - 데이터베이스 계층 검증
  - 모든 테스트 통과 확인, 질문이 있으면 사용자에게 문의.

- [x] 7. Admin Router 및 API 핸들러 구현
  - [x] 7.1 AdminRouter 클래스 구현 (admin-router.ts)
    - `handleRequest(req, res)`: URL 경로 파싱 및 라우팅
    - `/webadmin/api/auth/*` → AuthModule 핸들러 (인증 불필요)
    - `/webadmin/api/*` → 인증 검증 후 리소스별 API 핸들러
    - `/webadmin/*` → 정적 파일 서빙 (public/ 디렉토리)
    - 그 외 경로 → 404 응답
    - 내부 오류 시 HTTP 500 + JSON 오류 메시지 반환
    - JSON 요청 본문 파싱 유틸리티
    - URL 경로에서 리소스 ID 추출 유틸리티
    - _요구사항: 1.1, 1.3, 1.4, 2.1, 8.1, 8.2_

  - [x] 7.2 인증 API 핸들러 구현
    - `POST /webadmin/api/auth/login`: 로그인 처리, 세션 쿠키 설정
    - `POST /webadmin/api/auth/logout`: 로그아웃 처리, 세션 무효화
    - `GET /webadmin/api/auth/check`: 세션 유효성 확인
    - _요구사항: 2.2, 2.3, 2.4_

  - [x] 7.3 맵/통계 API 핸들러 구현 (map-api.ts)
    - `GET /webadmin/api/map`: 월드 맵 데이터 반환 (rooms + monsters + players + objects 조인)
    - `GET /webadmin/api/stats`: 대시보드 통계 반환
    - _요구사항: 3.1, 3.6, 3.8_

  - [x] 7.4 플레이어 API 핸들러 구현 (players-api.ts)
    - GET/POST/PUT/DELETE `/webadmin/api/players` 및 `/webadmin/api/players/:id`
    - GET `/webadmin/api/players/:id/inventory`
    - 필수 필드 유효성 검사 (username, password)
    - 성공 시 201(생성)/200(수정/삭제), 실패 시 400/404/409 응답
    - _요구사항: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 8.3, 8.4, 8.5, 8.6_

  - [x] 7.5 방 API 핸들러 구현 (rooms-api.ts)
    - GET/POST/PUT/DELETE `/webadmin/api/rooms` 및 `/webadmin/api/rooms/:id`
    - GET `/webadmin/api/rooms/:id/connections`
    - POST/DELETE `/webadmin/api/room-connections` 및 `/webadmin/api/room-connections/:id`
    - 필수 필드 유효성 검사 (x, y)
    - _요구사항: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 8.3, 8.4, 8.5, 8.6_

  - [x] 7.6 몬스터 API 핸들러 구현 (monsters-api.ts)
    - GET/POST/PUT/DELETE `/webadmin/api/monsters` 및 `/webadmin/api/monsters/:id`
    - 필수 필드 유효성 검사 (name_en, name_ko)
    - _요구사항: 6.1, 6.2, 6.3, 6.4, 6.5, 8.3, 8.4, 8.5, 8.6_

  - [x] 7.7 게임 오브젝트 API 핸들러 구현 (objects-api.ts)
    - GET/POST/PUT/DELETE `/webadmin/api/objects` 및 `/webadmin/api/objects/:id`
    - 필수 필드 유효성 검사 (name_en, name_ko, object_type, location_type)
    - _요구사항: 7.1, 7.2, 7.3, 7.4, 7.5, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 7.8 API 핸들러 통합 테스트 작성
    - 각 리소스의 CRUD 엔드포인트 응답 코드 및 본문 검증
    - 인증 미통과 시 리다이렉트/401 검증
    - 유효성 검사 실패 시 400 응답 검증
    - _요구사항: 8.3, 8.4, 8.5, 8.6_

- [x] 8. 체크포인트 - 백엔드 API 검증
  - 모든 테스트 통과 확인, 질문이 있으면 사용자에게 문의.

- [x] 9. 프론트엔드 SPA 구현
  - [x] 9.1 SPA 기본 구조 구현 (index.html, style.css)
    - index.html: 로그인 폼, 사이드바 내비게이션, 콘텐츠 영역, 모달 컨테이너
    - style.css: 레이아웃, 테이블, 폼, 모달, 내비게이션 스타일
    - 제목(h1~h6) 폰트 크기 30px 이하, 본문(p, td, li, span, label, input 등) 폰트 크기 14px 이하
    - 해시 기반 라우팅 (#dashboard, #players, #rooms, #monsters, #objects)
    - _요구사항: 10.1, 10.6, 10.7, 10.8_

  - [x] 9.2 인증 UI 및 API 통신 모듈 구현 (app.js 일부)
    - 로그인 폼 제출 → POST /webadmin/api/auth/login
    - 로그아웃 버튼 → POST /webadmin/api/auth/logout
    - 페이지 로드 시 GET /webadmin/api/auth/check로 세션 확인
    - 인증 실패 시 로그인 화면 표시
    - fetch 래퍼 함수: JSON 요청/응답 처리, 에러 핸들링
    - _요구사항: 2.1, 2.2, 2.4, 10.5_

  - [x] 9.3 대시보드 및 월드 맵 렌더러 구현 (app.js 일부)
    - GET /webadmin/api/map 호출하여 맵 데이터 조회
    - GET /webadmin/api/stats 호출하여 통계 데이터 조회
    - 좌표 기반 그리드 테이블 렌더링 (방 셀: room 클래스, 빈 셀: empty 클래스)
    - 방 셀 내 몬스터/플레이어 색상 인디케이터 (몬스터: 팩션별 색상, 플레이어: 초록색)
    - 방 셀 hover 시 툴팁 (좌표, 출구 방향, 몬스터/플레이어 요약)
    - 방 셀 클릭 시 상세 패널 (한국어/영어 설명, 생명체 목록, 플레이어 목록, 아이템 목록, Enter 연결)
    - 통계 요약 카드 (플레이어, 방, 몬스터, 게임 오브젝트 수)
    - 60초 간격 자동 새로고침 + 카운트다운 타이머
    - _요구사항: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 9.4 플레이어 관리 UI 구현 (app.js 일부)
    - 페이지네이션된 플레이어 목록 테이블
    - 플레이어 생성 폼 (username, password 필수)
    - 플레이어 수정 폼 (기존 값 프리필)
    - 플레이어 삭제 확인 대화상자
    - 플레이어 인벤토리 조회
    - 성공/오류 피드백 메시지
    - _요구사항: 4.1, 4.2, 4.3, 4.4, 4.5, 10.2, 10.3, 10.4, 10.5_

  - [x] 9.5 방 관리 UI 구현 (app.js 일부)
    - 페이지네이션된 방 목록 테이블
    - 방 생성/수정 폼 (x, y 좌표, 설명, blocked_exits)
    - 방 삭제 확인 대화상자
    - 방 연결 목록 조회, 생성, 삭제
    - _요구사항: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 10.2, 10.3, 10.4, 10.5_

  - [x] 9.6 몬스터 관리 UI 구현 (app.js 일부)
    - 페이지네이션된 몬스터 목록 테이블
    - 몬스터 생성/수정 폼 (name_en, name_ko 필수)
    - 몬스터 삭제 확인 대화상자
    - JSON 필드(stats, drop_items, properties) 편집 지원
    - _요구사항: 6.1, 6.2, 6.3, 6.4, 10.2, 10.3, 10.4, 10.5_

  - [x] 9.7 게임 오브젝트 관리 UI 구현 (app.js 일부)
    - 페이지네이션된 게임 오브젝트 목록 테이블
    - 게임 오브젝트 생성/수정 폼 (name_en, name_ko, object_type, location_type 필수)
    - 게임 오브젝트 삭제 확인 대화상자
    - _요구사항: 7.1, 7.2, 7.3, 7.4, 10.2, 10.3, 10.4, 10.5_

- [x] 10. 정적 파일 서빙 및 통합 연결
  - AdminRouter에서 `/webadmin/` 경로의 정적 파일 서빙 로직 구현
  - `src/server/webadmin/public/` 디렉토리의 index.html, style.css, app.js 서빙
  - SPA 라우팅 지원: `/webadmin`의 모든 비-API 경로에서 index.html 반환
  - Content-Type 헤더 설정 (html, css, js)
  - _요구사항: 1.3, 10.6_

- [x] 11. 빌드 설정 업데이트
  - tsconfig.server.json에 webadmin 디렉토리 포함 확인
  - `npm run build:server` 실행 시 webadmin 모듈 정상 컴파일 확인
  - public/ 디렉토리 파일이 빌드 출력에 복사되도록 설정
  - _요구사항: 1.1_

- [x] 12. 최종 체크포인트 - 전체 통합 검증
  - 모든 테스트 통과 확인, 질문이 있으면 사용자에게 문의.

## 참고사항

- `*` 표시된 태스크는 선택 사항이며 빠른 MVP를 위해 건너뛸 수 있음
- 각 태스크는 특정 요구사항을 참조하여 추적 가능
- 체크포인트에서 점진적 검증 수행
- 프론트엔드는 순수 HTML/CSS/JS SPA로 빌드 도구 불필요
- better-sqlite3는 동기 API이므로 async/await 불필요
- 대시보드 월드 맵은 DB에서 데이터를 조회하여 동적으로 렌더링 (iframe 임베드 아님)
