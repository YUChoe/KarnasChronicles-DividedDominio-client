# Requirements Document

## Introduction

이 스펙은 클라이언트 저장소(KarnasChronicles-DividedDominio-client)를 페이즈2 아키텍처에 맞게 재구성하기 위한 요구사항을 정의한다.

저장소의 역할이 크게 바뀐다. 현재는 터미널 웹 클라이언트, WebSocket 게이트웨이, 웹 어드민 세 가지를 담고 있다. 페이즈2에서는 게이트웨이만 남기고 터미널 클라이언트를 삭제하며, 웹 어드민은 MUD 서버로 기능이 이전되어 제거되고, 랜딩 사이트가 새로 들어온다. Godot 클라이언트는 같은 저장소에 편입되지만 별도 스펙(`godot-client`)이 다룬다.

게이트웨이의 역할도 변한다. 지금까지는 사람이 읽는 Telnet 텍스트를 브라우저 터미널로 중계했다. 앞으로는 개행 구분 JSON 라인을 WebSocket 프레임으로 변환하는 얇은 계층이 된다. 이 변화로 라인 프레이밍이 필수 요건이 된다. 현재 구현은 TCP 청크를 즉시 문자열로 변환해 보내므로 JSON 라인이 쪼개지거나 뭉치며, 멀티바이트 문자가 청크 경계에서 분할되면 손상된다.

프로토콜 계약은 서버 저장소의 `docs/protocol/`에 정의되며 본 스펙은 그 계약의 게이트웨이측 구현과 랜딩 사이트를 규율한다.

## Glossary

- **Repository**: 본 스펙의 대상 저장소(KarnasChronicles-DividedDominio-client).
- **Gateway**: WebSocket과 TCP를 중계하는 Node/TypeScript 서버(`src/server/gateway.ts` 및 부속 모듈).
- **Terminal_Client**: 삭제 대상인 브라우저 터미널 클라이언트(`src/client/**`). xterm.js 기반.
- **Web_Admin**: 삭제 대상인 웹 어드민(`src/server/webadmin/**`). better-sqlite3로 MUD DB를 직접 조작한다.
- **Landing_Site**: 신규 구축 대상. 게임 소개와 회원가입을 제공한다.
- **JSON_Line**: 개행(`\n`)으로 종결되는 단일 JSON 오브젝트. TCP 구간 페이로드의 단위.
- **Line_Framing**: TCP 스트림에서 개행 경계를 복원해 완성된 라인만 전달하는 처리.
- **Game_Channel**: MUD 서버의 TCP 4000 경로. WebSocket `/ws`에 대응한다.
- **Admin_Channel**: MUD 서버의 TCP 4001 경로. WebSocket `/admin`에 대응한다.
- **Service_Token**: 랜딩 백엔드가 MUD 서버의 계정 생성 경로를 호출할 때 사용하는 인증 토큰.
- **Static_Check**: TypeScript 타입 검사(`tsc --noEmit`)와 린트.

## Requirements

### Requirement 1: 터미널 웹 클라이언트 제거

**User Story:** 개발자로서, 나는 터미널 웹 클라이언트가 제거되기를 원한다. 그래야 Godot 클라이언트가 유일한 게임 클라이언트가 되고 두 클라이언트를 병행 유지하는 부담이 사라진다.

#### Acceptance Criteria

1. THE Repository SHALL `src/client/` 디렉터리 전체를 제거한다. 대상은 `index.html`, `main.ts`, `terminal-manager.ts`, `i18n.ts`와 `__tests__/` 아래 4개 테스트 파일이다.
2. THE Repository SHALL `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-webgl`, `@xterm/addon-attach` 의존성을 제거한다.
3. THE Repository SHALL `vite.config.ts`를 제거한다.
4. THE Repository SHALL `package.json`에서 `dev:client`, `build:client`, `preview` 스크립트를 제거하고 `build`와 `test` 스크립트를 갱신한다.
5. THE Repository SHALL `.env.example`에서 `VITE_WS_URL`을 제거한다.
6. THE Repository SHALL `src/shared/types.js`를 제거한다. 이는 커밋된 컴파일 산출물 잔재다.
7. THE Gateway SHALL Terminal_Client 제거 후에도 동작을 유지한다. `src/client/`는 `src/server/`나 `src/shared/`를 임포트하지 않으므로 코드 의존성이 없다.

### Requirement 2: 웹 어드민 제거

**User Story:** 운영자로서, 나는 어드민이 MUD 서버 안에서 제공되기를 원한다. 그래야 별도 프로세스가 같은 SQLite를 직접 조작해 서버 캐시와 어긋나는 문제가 사라진다.

#### Acceptance Criteria

1. THE Repository SHALL `src/server/webadmin/` 디렉터리 전체를 제거한다. 대상은 `admin-router.ts`, `auth.ts`, `db-client.ts`와 `public/` 아래 3개 파일이다.
2. THE Repository SHALL `better-sqlite3` 의존성을 제거한다.
3. THE Repository SHALL `src/server/start.ts`에서 `DBClient`, `AuthModule`, `AdminRouter` 생성과 주입을 제거한다.
4. THE Gateway SHALL HTTP 요청을 `AdminRouter`로 위임하는 경로를 제거한다.
5. THE Repository SHALL `build:server` 스크립트에서 `cp -r src/server/webadmin/public` 단계를 제거한다.
6. THE Repository SHALL Web_Admin 제거를 MUD 서버의 어드민 채널 구현 완료 이후에 수행한다. 두 경로가 같은 데이터베이스를 조작하는 기간을 최소화해야 한다.
7. THE Repository SHALL `nginx.conf`에서 `/webadmin` 프록시 설정을 제거한다.

### Requirement 3: JSON 라인 프레이밍

**User Story:** 개발자로서, 나는 게이트웨이가 JSON 라인 경계를 정확히 복원하기를 원한다. 그래야 클라이언트가 항상 완전한 JSON 오브젝트를 받고 한국어 텍스트가 손상되지 않는다.

#### Acceptance Criteria

1. THE Gateway SHALL TCP에서 수신한 바이트를 개행이 나타날 때까지 누적하고 완성된 JSON_Line만 WebSocket으로 전달한다.
2. THE Gateway SHALL 불완전한 잔여 바이트를 다음 청크와 결합한다.
3. THE Gateway SHALL UTF-8 디코딩을 라인 단위로 수행한다. 청크 경계에서 멀티바이트 문자가 분할된 상태로 디코딩하지 않는다.
4. WHEN 하나의 TCP 청크에 여러 JSON_Line이 포함되면, THE Gateway SHALL 각 라인을 개별 WebSocket 프레임으로 전달한다.
5. THE Gateway SHALL WebSocket에서 수신한 프레임을 TCP로 전달할 때 개행으로 종결한다.
6. THE Gateway SHALL WebSocket 프레임에 개행을 포함해 전달하지 않는다. TCP 라인의 종결 개행을 제거한 뒤 프레임으로 만든다.
7. THE Gateway SHALL 텍스트 프레임만 사용한다. 바이너리 프레임을 사용하지 않는다.
8. THE Gateway SHALL 연결 초기의 Telnet IAC 협상 구간에서 IAC 시퀀스를 계속 걸러낸다. 협상 이후 페이로드는 JSON_Line으로 취급한다.
9. THE Gateway SHALL 라인 길이 상한(256KB)을 초과하는 입력을 감지하면 해당 연결을 종료하고 오류를 기록한다.
10. THE Gateway SHALL JSON 내용을 해석하거나 변형하지 않는다. 프레임 변환만 수행한다.

### Requirement 4: 게이트웨이 정리

**User Story:** 개발자로서, 나는 게이트웨이의 데드 코드와 무효 설정이 정리되기를 원한다. 그래야 설정이 실제 동작과 일치하고 유지보수 시 혼란이 없다.

#### Acceptance Criteria

1. THE Repository SHALL `sanitizer.ts`와 그 테스트를 제거하거나 실제 데이터 경로에 연결한다. 현재 `gateway.ts`에서 임포트만 되고 사용되지 않아 OSC/DCS 필터링이 적용되지 않는다.
2. THE Gateway SHALL WebSocket 업그레이드 경로를 제한한다. Game_Channel은 `/ws`, Admin_Channel은 `/admin`이며 그 외 경로의 업그레이드 요청을 거부한다.
3. THE Gateway SHALL Admin_Channel 프록시를 제공한다. WebSocket `/admin`을 MUD 서버의 TCP 4001로 중계한다.
4. THE Repository SHALL `MAX_CONNECTIONS`와 `CONNECTION_TIMEOUT` 환경변수를 실제로 읽어 반영하거나 설정 파일에서 제거한다. 현재 `start.ts`가 읽지 않아 무효이며 상한은 하드코딩된 200이다.
5. THE Gateway SHALL 하드코딩된 `serverVersion` 값을 제거한다. 서버 버전은 MUD 서버의 `welcome` 메시지가 제공한다.
6. THE Gateway SHALL `resize` 메시지 타입의 존속 여부를 결정한다. 현재 로그만 남기고 아무 동작을 하지 않으며 터미널 클라이언트 전용이었다.
7. THE Repository SHALL `src/shared/types.ts`의 `WSMessage` 타입을 프로토콜 계약에 맞게 갱신한다.

### Requirement 5: 랜딩 사이트

**User Story:** 신규 플레이어로서, 나는 웹사이트에서 게임을 알아보고 계정을 만들기를 원한다. 그래야 게임 클라이언트를 내려받기 전에 가입할 수 있다.

#### Acceptance Criteria

1. THE Landing_Site SHALL 게임 소개, 스크린샷, 클라이언트 다운로드 링크를 제공한다.
2. THE Landing_Site SHALL 회원가입 폼을 제공한다. 입력 항목은 사용자명, 비밀번호, 비밀번호 확인, 이메일(선택)이다.
3. THE Landing_Site SHALL 회원가입 요청을 MUD 서버의 계정 생성 경로로 전달한다.
4. THE Landing_Site SHALL Service_Token을 브라우저에 노출하지 않는다. 서버측 코드에서만 사용한다.
5. THE Landing_Site SHALL 클라이언트측 입력 검증을 수행하되 최종 검증은 MUD 서버에 의존한다.
6. WHEN 사용자명이 중복이면, THE Landing_Site SHALL 서버의 `USERNAME_TAKEN` 응답을 사용자에게 안내한다.
7. THE Landing_Site SHALL 영국 영어를 사용한다. 한국어 병기 여부는 설계 단계에서 결정한다.
8. THE Landing_Site SHALL 정적 자산 서빙 방식을 결정한다. Gateway 프로세스가 서빙하거나 nginx가 담당한다. 현재 Gateway는 `/webadmin` 외 모든 경로에 404 JSON을 반환한다.
9. THE Landing_Site SHALL 비밀번호를 평문으로 저장하거나 로그에 기록하지 않는다.
10. THE Landing_Site SHALL 회원가입 요청에 대한 남용 방지 수단을 갖는다. 최소한 IP 기준 요청 빈도 제한을 적용한다.

### Requirement 6: 테스트 인프라 재구성

**User Story:** 개발자로서, 나는 터미널 클라이언트 제거 후에도 테스트가 동작하기를 원한다. 그래야 게이트웨이 변경을 검증할 수 있다.

#### Acceptance Criteria

1. THE Repository SHALL `vite.config.ts` 제거 후 `npm test`가 동작하도록 테스트 설정을 재구성한다. 현재 vitest 기본 설정이 `vite.config.ts`에 얹혀 있다.
2. THE Repository SHALL `vitest.config.server.ts` 기준으로 테스트 진입점을 통합한다.
3. THE Repository SHALL `src/server/__tests__/gateway.property.test.ts`를 유지한다.
4. THE Repository SHALL `src/__tests__/e2e.test.ts`와 `load.test.ts`를 유지한다. 이들은 `GatewayServer`와 `ws`만 사용하므로 Terminal_Client 제거에 영향받지 않는다.
5. THE Repository SHALL Line_Framing에 대한 테스트를 추가한다. 분할 수신, 병합 수신, 멀티바이트 경계 분할, 한국어 왕복을 검증한다.
6. THE Repository SHALL 기존 테스트가 텍스트 프로토콜을 전제한 부분을 JSON_Line 전제로 갱신한다.
7. THE Repository SHALL `jsdom`과 `happy-dom` 의존성의 필요 여부를 재검토한다. 브라우저 환경 테스트가 사라지면 불필요하다.

### Requirement 7: 빌드와 배포 조정

**User Story:** 개발자로서, 나는 빌드 설정이 남은 구성 요소만 반영하기를 원한다. 그래야 불필요한 컴파일 대상과 산출물이 사라진다.

#### Acceptance Criteria

1. THE Repository SHALL `tsconfig.json`의 `include` 범위를 서버와 공유 코드로 축소한다.
2. THE Repository SHALL `tsconfig.json`의 DOM 라이브러리 포함 여부를 재검토한다. Landing_Site가 브라우저 코드를 포함하면 별도 설정으로 분리한다.
3. THE Repository SHALL `Dockerfile`에서 웹 어드민 정적 파일 복사 단계를 제거한다.
4. THE Repository SHALL `docker-compose.yml`의 환경변수를 실제 사용 항목으로 정리한다.
5. THE Repository SHALL `nginx.conf`를 갱신한다. `/webadmin` 프록시를 제거하고 `/admin` 프록시를 추가하며 정적 루트를 Landing_Site로 맞춘다.
6. THE Repository SHALL `README.md`와 `DEPLOYMENT.md`에서 Terminal_Client와 Web_Admin 관련 안내를 제거하고 Landing_Site와 Godot 클라이언트 배포 절차로 갱신한다.
7. THE Repository SHALL Static_Check를 통과한다.

### Requirement 8: 폐기 스펙 처리

**User Story:** Maintainer로서, 나는 폐기된 기능의 스펙이 명확히 닫히기를 원한다. 그래야 나중에 문서를 읽는 사람이 현행 여부를 오해하지 않는다.

#### Acceptance Criteria

1. THE Repository SHALL `.kiro/specs/browser-telnet-terminal/`에 폐기 기록을 남긴다. Terminal_Client 제거로 이 스펙의 대상이 사라졌음을 명시한다.
2. THE Repository SHALL `.kiro/specs/web-admin-panel/`에 폐기 기록을 남긴다. 어드민 기능이 MUD 서버와 Godot 클라이언트로 이전되었음을 명시하고 후속 스펙을 지시한다.
3. THE Repository SHALL 폐기 스펙의 내용을 삭제하지 않는다. 이력 보존을 위해 남기고 종료 사유만 추가한다.
