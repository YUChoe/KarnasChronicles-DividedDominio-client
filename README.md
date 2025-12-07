# Browser Telnet Terminal

브라우저 기반 텔넷 터미널 클라이언트 - MUD 서버 연결용

## 프로젝트 구조

```
browser-telnet-terminal/
├── src/
│   ├── client/          # 브라우저 클라이언트 (xterm.js)
│   ├── server/          # WebSocket Gateway
│   └── shared/          # 공유 타입 및 유틸리티
├── dist/                # 빌드 출력
├── tests/               # 테스트 파일
└── logs/                # 로그 파일
```

## 설치

```bash
npm install
```

## 개발

```bash
# 클라이언트 개발 서버 실행
npm run dev:client

# 게이트웨이 서버 실행
npm run dev:server
```

## 빌드

```bash
npm run build
```

## 테스트

```bash
npm test
```

## 기술 스택

- **클라이언트**: TypeScript, xterm.js, Vite
- **서버**: Node.js, TypeScript, WebSocket (ws)
- **테스트**: Vitest, fast-check
- **로깅**: Winston
