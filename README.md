# Browser Telnet Terminal

브라우저 기반 텔넷 터미널 클라이언트 - MUD 서버 연결용

웹 브라우저를 통해 텔넷 기반 MUD(Multi-User Dungeon) 게임 서버에 접속할 수 있는 현대적인 터미널 클라이언트입니다. 별도의 텔넷 클라이언트 설치 없이 브라우저만으로 게임을 즐길 수 있습니다.

## 주요 기능

- 🖥️ **xterm.js 기반 터미널**: 120x60 크기의 고품질 터미널 에뮬레이터
- 🎨 **ANSI 색상 지원**: 풀 컬러 ANSI 이스케이프 코드 렌더링
- 🔄 **자동 재연결**: 네트워크 중단 시 지수 백오프를 사용한 자동 재연결
- ⚡ **고성능**: WebGL 가속 렌더링 지원
- 🔒 **보안**: XSS 방지 및 입력 검증
- 📊 **확장성**: 최대 200개의 동시 연결 지원
- 🎯 **특수 키 지원**: Backspace, 화살표 키, Ctrl+C 등 완벽 지원

## 시스템 요구사항

- Node.js 20.x LTS 이상
- npm 또는 pnpm
- 텔넷 서버 (localhost:4000에서 실행 중이어야 함)

## 설치

```bash
# 저장소 클론
git clone <repository-url>
cd browser-telnet-terminal

# 의존성 설치
npm install
```

## 실행 방법

### 개발 모드

개발 모드에서는 클라이언트와 서버를 별도의 터미널에서 실행해야 합니다.

**터미널 1 - 클라이언트 개발 서버:**
```bash
npm run dev:client
```
브라우저에서 http://localhost:5173 접속

**터미널 2 - WebSocket Gateway 서버:**
```bash
npm run dev:server
```
WebSocket Gateway가 포트 3000에서 실행됩니다.

**터미널 3 - 텔넷 서버 (별도 준비 필요):**
```bash
# 예시: 텔넷 서버가 포트 4000에서 실행되어야 함
# 실제 MUD 서버 실행 명령어 사용
```

### 프로덕션 빌드

```bash
# 클라이언트와 서버 빌드
npm run build

# 빌드된 서버 실행
node dist/server/start.js

# 빌드된 클라이언트는 dist/client 디렉토리에 생성됨
# 정적 파일 서버로 제공 (예: nginx, Apache, CDN)
```

### Docker 배포

Gateway 서버를 Docker로 배포할 수 있습니다:

```bash
# Docker 이미지 빌드
./scripts/build-docker.sh

# Docker 컨테이너 실행
docker run -d \
  --name telnet-gateway \
  -p 3000:3000 \
  -v $(pwd)/logs:/app/logs \
  --env-file .env \
  browser-telnet-terminal:latest

# 또는 docker-compose 사용
docker-compose up -d
```

**참고**: 클라이언트 정적 파일(`dist/client`)은 별도의 웹 서버(nginx, Apache, CDN 등)에서 서빙하세요. 자세한 내용은 [DEPLOYMENT.md](./DEPLOYMENT.md)를 참조하세요.

## 설정 옵션

### 환경 변수

서버 설정을 위한 환경 변수를 `.env` 파일에 정의할 수 있습니다:

```bash
# WebSocket Gateway 포트
WS_PORT=3000

# 텔넷 서버 주소
TELNET_HOST=localhost
TELNET_PORT=4000

# 최대 동시 연결 수
MAX_CONNECTIONS=200

# 로그 레벨 (error, warn, info, debug)
LOG_LEVEL=info

# Node 환경
NODE_ENV=production
```

### 클라이언트 설정

클라이언트 설정은 `src/client/main.ts`에서 수정할 수 있습니다:

```typescript
const config = {
  wsUrl: 'ws://localhost:3000',  // WebSocket Gateway URL
  terminalWidth: 120,             // 터미널 너비
  terminalHeight: 60,             // 터미널 높이
  reconnectDelay: 1000,           // 초기 재연결 지연 (ms)
  maxReconnectAttempts: 10        // 최대 재연결 시도 횟수
};
```

## 프로젝트 구조

```
browser-telnet-terminal/
├── src/
│   ├── client/                    # 브라우저 클라이언트
│   │   ├── index.html            # HTML 엔트리 포인트
│   │   ├── main.ts               # 클라이언트 메인 로직
│   │   ├── terminal-manager.ts   # 터미널 관리자
│   │   └── __tests__/            # 클라이언트 테스트
│   ├── server/                    # WebSocket Gateway
│   │   ├── start.ts              # 서버 엔트리 포인트
│   │   ├── gateway.ts            # Gateway 메인 로직
│   │   ├── telnet-client.ts      # 텔넷 클라이언트
│   │   ├── connection-pool.ts    # 연결 풀 관리
│   │   ├── sanitizer.ts          # XSS 방지
│   │   ├── logger.ts             # 로깅 설정
│   │   └── __tests__/            # 서버 테스트
│   ├── shared/                    # 공유 코드
│   │   └── types.ts              # 공유 타입 정의
│   └── __tests__/                 # E2E 및 부하 테스트
├── dist/                          # 빌드 출력
├── logs/                          # 로그 파일
├── .kiro/                         # 프로젝트 스펙 및 설계
└── package.json
```

## 테스트

```bash
# 모든 테스트 실행
npm test

# 서버 테스트만 실행
npm run test:server

# E2E 테스트 실행
npm run test:e2e

# 부하 테스트 실행
npm run test:load

# 타입 체크
npm run type-check
```

## 문제 해결 가이드

### 연결 문제

**문제: "연결 실패" 오류 메시지**

해결 방법:
1. 텔넷 서버가 localhost:4000에서 실행 중인지 확인
   ```bash
   telnet localhost 4000
   ```
2. WebSocket Gateway가 실행 중인지 확인
3. 방화벽 설정 확인

**문제: 자동 재연결이 작동하지 않음**

해결 방법:
1. 브라우저 콘솔에서 에러 로그 확인
2. 네트워크 탭에서 WebSocket 연결 상태 확인
3. 서버 로그 확인 (`logs/combined.log`)

### 렌더링 문제

**문제: 터미널 텍스트가 깨져 보임**

해결 방법:
1. Cascadia Mono 폰트가 설치되어 있는지 확인
2. 브라우저 캐시 삭제 후 새로고침
3. WebGL 지원 여부 확인 (브라우저 콘솔에서 경고 확인)

**문제: ANSI 색상이 표시되지 않음**

해결 방법:
1. xterm.js가 올바르게 로드되었는지 확인
2. 브라우저 개발자 도구에서 JavaScript 에러 확인
3. 서버에서 올바른 ANSI 코드를 전송하는지 확인

### 성능 문제

**문제: 터미널이 느리게 반응함**

해결 방법:
1. WebGL 애드온이 활성화되어 있는지 확인
2. 브라우저 하드웨어 가속 활성화
3. 동시 연결 수 확인 (최대 200개)
4. 서버 리소스 사용량 확인

**문제: 메모리 사용량이 계속 증가함**

해결 방법:
1. 터미널 스크롤백 설정 확인 (기본값: 0)
2. 연결 종료 시 리소스 정리 확인
3. 서버 로그에서 메모리 누수 경고 확인

### 키보드 입력 문제

**문제: 특수 키가 작동하지 않음**

해결 방법:
1. 브라우저 기본 동작 방지가 활성화되어 있는지 확인
2. 키보드 레이아웃 확인
3. 브라우저 콘솔에서 키 이벤트 로그 확인

**문제: Ctrl+C가 작동하지 않음**

해결 방법:
1. 터미널에 포커스가 있는지 확인
2. 브라우저 단축키와 충돌하는지 확인
3. 서버 로그에서 인터럽트 신호 전송 확인

### 로그 확인

서버 로그는 `logs/` 디렉토리에 저장됩니다:

```bash
# 전체 로그 확인
tail -f logs/combined.log

# 에러 로그만 확인
tail -f logs/error.log

# 특정 연결 ID로 필터링
grep "client-id-123" logs/combined.log
```

## 기술 스택

- **클라이언트**: TypeScript, xterm.js, Vite
- **서버**: Node.js, TypeScript, WebSocket (ws)
- **테스트**: Vitest, fast-check (속성 기반 테스트)
- **로깅**: Winston
- **빌드**: Vite (클라이언트), tsc (서버)

## 라이선스

MIT

## 기여

이슈 및 풀 리퀘스트를 환영합니다.

## 지원

문제가 발생하면 GitHub Issues에 등록해주세요.
