# Karnas Chronicles: Divided Dominion — 게이트웨이와 랜딩

MUD 서버(`Echoes-of-the-Fallen-Age`)와 Godot 클라이언트 사이의 WebSocket
게이트웨이, 그리고 회원가입을 받는 랜딩 사이트입니다. Godot 클라이언트도 같은
저장소의 [godot/](./godot/) 에 있습니다.

## 구성 요소

| 구성 요소 | 위치 | 역할 |
|---|---|---|
| 게이트웨이 | [src/server/](./src/server/) | WebSocket ↔ TCP 중계. 두 채널을 경로로 가른다 |
| 랜딩 | [src/server/public/](./src/server/public/), [src/server/landing/](./src/server/landing/) | 게임 소개와 회원가입 |
| Godot 클라이언트 | [godot/](./godot/) | 게임 화면. 별도 스펙이 다룬다 |

게이트웨이는 상태를 갖지 않습니다. 데이터베이스에 접근하지 않고 메시지 내용을
해석하지 않습니다. 인증은 MUD 서버가 합니다.

### 채널

| 경로 | 상위 포트 | 용도 |
|---|---|---|
| `/ws` | TCP 4000 | 게임 채널 |
| `/admin` | TCP 4001 | 어드민 채널. 인증은 서버가 판정한다 |
| `/api/register` | TCP 4001 | 회원가입. 서비스 토큰은 게이트웨이만 갖는다 |

그 밖의 경로로 오는 업그레이드 요청은 404 로 거부합니다. 잘못된 포트에 붙었을
때 조용히 실패하지 않게 하려는 것입니다.

### 프로토콜

개행으로 구분되는 JSON 라인입니다. 게이트웨이는 봉투를 씌우지 않고 서버가 보낸
라인을 그대로 WebSocket 프레임으로 전달합니다. 자신의 제어 메시지에만
`gateway_` 접두어를 씁니다.

라인 길이 상한은 256KB 입니다. TCP 청크 경계는 라인 경계와 무관하므로 개행을
찾은 뒤에만 UTF-8 로 디코딩합니다. 멀티바이트 문자가 청크 경계에서 갈라져도
손상되지 않습니다.

계약 문서는 서버 저장소의 `docs/protocol/` 입니다. 세 저장소가 그 문서를
기준으로 삼습니다.

## 요구 사항

- Node.js 20.x LTS 이상
- MUD 서버가 TCP 4000(게임), 4001(어드민)에서 실행 중
- Godot 4.2.2 (클라이언트를 열거나 검사할 때만)

## 설치와 실행

```bash
npm install

# 게이트웨이 (감시 모드)
npm run dev:server
```

랜딩을 브라우저에서 보려면 정적 서빙을 켭니다. 프로덕션에서는 nginx 가 맡으므로
개발에서만 켭니다.

```bash
LANDING_SERVE_STATIC=1 LANDING_SERVICE_TOKEN=dev-token npm run dev:server
# http://localhost:3000
```

`LANDING_SERVICE_TOKEN` 은 MUD 서버의 같은 이름 환경변수와 같아야 합니다.
비워 두면 회원가입 경로를 만들지 않고 `/api/register` 가 503 을 돌려줍니다.
서버도 토큰이 없는 배포에서는 그 경로를 등록하지 않습니다.

## 환경 변수

| 변수 | 기본값 | 용도 |
|---|---|---|
| `WS_PORT` | `3000` | 게이트웨이 포트 |
| `TELNET_HOST` | `localhost` | MUD 서버 주소 |
| `TELNET_PORT` | `4000` | 게임 채널 포트 |
| `ADMIN_PORT` | `4001` | 어드민 채널 포트 |
| `MAX_CONNECTIONS` | `200` | 최대 동시 연결 |
| `CONNECTION_TIMEOUT` | `300000` | 프레임이 오가지 않은 연결을 닫는 기준 (밀리초) |
| `LANDING_SERVICE_TOKEN` | 없음 | 회원가입용 서비스 토큰. 브라우저로 나가지 않는다 |
| `LANDING_SERVE_STATIC` | `0` | `1` 이면 게이트웨이가 정적 자산을 서빙한다 (개발용) |
| `LANDING_STATIC_ROOT` | `src/server/public` | 정적 자산 경로 |
| `REGISTER_LIMIT` | `5` | IP 당 회원가입 허용 횟수 |
| `REGISTER_WINDOW_MS` | `3600000` | 그 횟수를 세는 구간 (밀리초) |
| `LOG_LEVEL` | `info` | `error`, `warn`, `info`, `debug` |

`.env.example` 을 `.env` 로 복사해 씁니다.

## 빌드와 배포

```bash
npm run build:server     # dist/server 에 CommonJS 산출
node dist/server/server/start.js
```

Docker 와 nginx 를 쓰는 배포 절차는 [DEPLOYMENT.md](./DEPLOYMENT.md) 에 있습니다.
정적 자산은 프로덕션에서 nginx 가 서빙하고 게이트웨이는 API 만 맡습니다.

## 테스트

```bash
npm test              # 게이트웨이와 랜딩 단위 테스트
npm run test:e2e      # 게이트웨이 전체 사슬
npm run test:load     # 동시 연결 특성
npm run type-check    # 타입 검사 (테스트 포함)

npm run check:godot   # Godot 스크립트 정적 검사
npm run test:godot    # Godot 클라이언트 테스트
npm run build:godot   # Godot 클라이언트 내보내기
npm run check:contract # 계약 문서와 클라이언트 처리 범위 대조
```

랜딩의 브라우저 스크립트는 순수 JavaScript 이며 타입 검사 대상이 아닙니다.
검증 규칙은 게이트웨이의 `landing/validate.ts` 와 같은 규칙 이름을 씁니다.

## 프로젝트 구조

```
├── src/
│   ├── server/
│   │   ├── start.ts            엔트리. 환경변수를 읽어 배선한다
│   │   ├── gateway.ts          채널 라우팅과 중계
│   │   ├── telnet-client.ts    상위 TCP 연결
│   │   ├── line-framer.ts      개행 경계 복원
│   │   ├── connection-pool.ts  연결 풀과 유휴 정리
│   │   ├── logger.ts           winston 설정
│   │   ├── landing/            회원가입 경로와 정적 서빙
│   │   ├── public/             랜딩 정적 자산
│   │   └── __tests__/          게이트웨이·랜딩 테스트
│   ├── shared/types.ts         게이트웨이 제어 메시지 타입
│   └── __tests__/              e2e·부하 테스트
├── godot/                      Godot 클라이언트
├── scripts/                    검사와 배포 스크립트
├── nginx.conf                  랜딩 서빙과 프록시
└── .kiro/specs/                스펙과 설계
```

## 문제 해결

### 게이트웨이가 상위 서버에 붙지 못한다

MUD 서버가 4000 과 4001 에서 듣고 있는지 확인합니다. 어드민 포트는 기본이
루프백 바인드이므로 컨테이너에서 붙을 때는 호스트 주소를 맞춰야 합니다.

### 클라이언트가 붙자마자 끊긴다

`welcome` 의 `channel` 이 기대와 다르면 클라이언트가 스스로 끊습니다. `/ws` 로
붙어야 게임 채널입니다. 경로 없이 붙으면 404 입니다.

### 회원가입이 503 을 돌려준다

`LANDING_SERVICE_TOKEN` 이 비어 있습니다. 게이트웨이와 MUD 서버 양쪽에 같은
값을 넣어야 합니다.

### 회원가입이 502 를 돌려준다

게이트웨이가 어드민 채널에 닿지 못했거나 서비스 인증이 거절됐습니다. 토큰
불일치는 사용자에게 알리지 않고 게이트웨이 로그에만 남습니다.

### 연결이 1009 로 끊긴다

라인 길이 상한(256KB)을 넘었습니다. 어드민 채널의 큰 응답에서 나올 수 있으며,
클라이언트의 WebSocket 수신 버퍼도 같은 크기로 맞춰야 합니다.

### 로그

```bash
tail -f logs/combined.log
tail -f logs/error.log
```

비밀번호는 어느 경로에서도 기록하지 않습니다.

## 기술 스택

- Node.js, TypeScript, `ws`
- Vitest, fast-check (속성 기반 테스트)
- winston
- 랜딩: 빌드 도구 없는 HTML, CSS, 바닐라 JavaScript

## 라이선스

MIT
