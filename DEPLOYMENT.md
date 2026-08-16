# 배포 가이드

게이트웨이와 랜딩 사이트를 배포하는 절차입니다. Godot 클라이언트는 실행 파일로
내려주며 마지막 절에서 다룹니다.

## 목차

1. [배치 구조](#배치-구조)
2. [사전 요구사항](#사전-요구사항)
3. [환경 변수](#환경-변수)
4. [Docker Compose 배포](#docker-compose-배포)
5. [단일 컨테이너 배포](#단일-컨테이너-배포)
6. [컨테이너 없이 배포](#컨테이너-없이-배포)
7. [클라이언트 빌드 배포](#클라이언트-빌드-배포)
8. [배포 확인](#배포-확인)
9. [로그와 모니터링](#로그와-모니터링)
10. [문제 해결](#문제-해결)
11. [보안](#보안)

## 배치 구조

```
브라우저 ─┬→ nginx :80 ─┬→ /            정적 랜딩
          │             ├→ /ws          게이트웨이 :3000 → MUD :4000
          │             └→ /admin       게이트웨이 :3000 → MUD :4001
          │
Godot ────┴→ nginx :80 → /ws → 게이트웨이 → MUD 서버
```

정적 자산은 nginx 가 서빙합니다. 게이트웨이는 WebSocket 두 채널만 맡습니다.
랜딩에는 계정 생성이 없고 계정 생성은 Godot 클라이언트가 게임 채널의
`register` 로 직접 합니다.

게이트웨이 포트를 외부에 노출하지 않습니다.

MUD 서버는 이 저장소가 배포하지 않습니다. 어드민 포트(4001)는 루프백에만
바인드하고 게이트웨이만 닿게 합니다.

## 사전 요구사항

- Docker 20.10 이상, Docker Compose v2 (컨테이너 배포 시)
- 또는 Node.js 20.x LTS 와 nginx (컨테이너 없이 배포 시)
- MUD 서버가 TCP 4000, 4001 에서 실행 중

## 환경 변수

`.env.example` 을 복사해 `.env` 를 만듭니다.

```bash
cp .env.example .env
```

| 변수 | 기본값 | 비고 |
|---|---|---|
| `NODE_ENV` | `production` | |
| `WS_PORT` | `3000` | 게이트웨이 포트 |
| `TELNET_HOST` | `localhost` | compose 에서는 `host.docker.internal` |
| `TELNET_PORT` | `4000` | 게임 채널 |
| `ADMIN_PORT` | `4001` | 어드민 채널 |
| `MAX_CONNECTIONS` | `200` | 초과 시 1008 로 거절 |
| `CONNECTION_TIMEOUT` | `300000` | 프레임이 오가지 않은 연결을 닫는 기준. 클라이언트가 60초마다 ping 을 보내므로 그보다 넉넉해야 한다 |
| `LANDING_SERVE_STATIC` | `0` | 프로덕션은 `0`. nginx 가 서빙한다 |
| `LANDING_STATIC_ROOT` | 이미지에서 `/app/public` | 정적 서빙을 켤 때만 쓴다 |
| `LOG_LEVEL` | `info` | |

`.env` 는 커밋하지 않습니다.

## Docker Compose 배포

```bash
docker compose up -d --build
docker compose ps
```

`web` 컨테이너가 80 포트를 받고 `gateway` 는 내부 네트워크에만 노출됩니다.
정적 자산과 `nginx.conf` 는 호스트 디렉터리를 읽기 전용으로 물립니다. 랜딩
문구를 고치면 컨테이너를 다시 빌드하지 않고 nginx 만 다시 읽으면 됩니다.

```bash
docker compose restart web
```

## 단일 컨테이너 배포

nginx 를 따로 운영하는 환경에서는 게이트웨이만 컨테이너로 띄웁니다.

```bash
./scripts/build-docker.sh
./scripts/deploy-docker.sh production
```

게이트웨이 포트는 루프백에만 바인드합니다. nginx 는 호스트에서
`proxy_pass http://127.0.0.1:3000;` 로 붙입니다. `nginx.conf` 의 `gateway:3000`
을 그 주소로 고쳐야 합니다.

정적 루트는 `src/server/public` 을 nginx 웹 루트로 복사하거나 그 경로를 직접
`root` 로 지정합니다.

```bash
cp -r src/server/public/* /usr/share/nginx/html/
```

## 컨테이너 없이 배포

```bash
npm ci
npm run build:server
node dist/server/server/start.js
```

산출물은 CommonJS 입니다. 저장소의 `package.json` 은 `"type": "module"` 이지만
빌드가 `dist/server/package.json` 에 `{"type": "commonjs"}` 표식을 넣습니다.
Node 는 파일에서 가장 가까운 `package.json` 으로 모듈 종류를 판정하므로 그
선언이 이깁니다. `dist/server` 를 통째로 옮길 때 그 파일을 빠뜨리면 안 됩니다.

프로세스 관리는 systemd 나 pm2 를 씁니다. 로그는 `logs/` 에 쌓입니다.

## 클라이언트 빌드 배포

빌드는 디스코드에서 나눕니다. 파일을 이 사이트에 올리지 않으므로 nginx 에
배포용 경로가 없습니다. 랜딩의 다운로드 절은 초대 링크로 안내합니다.

```bash
npm run build:godot                  # build/windows/ 에 내보낸다
npm run build:godot -- --pack-only   # 템플릿 없이 리소스 묶음만 확인한다
```

프로젝트는 Godot 4.2.2 를 대상으로 합니다. 내보내기에는 같은 버전의 템플릿이
필요하고 엔진 배포물에는 들어 있지 않습니다. 편집기의 `편집기 > 내보내기 템플릿
관리 > 다운로드` 로 받거나 `Godot_v4.2.2-stable_export_templates.tpz` 를
`%APPDATA%/Godot/export_templates/4.2.2.stable/` 에 풉니다. 템플릿이 없으면
빌드 스크립트가 그 경로를 알려 주고 멈춥니다.

`export_presets.cfg` 는 저장소에 있습니다. 서명 자격 정보를 담지 않습니다.
서명이 필요해지면 그 값은 환경변수나 별도 파일로 빼야 합니다.

내보낸 `build/windows/` 를 압축해 디스코드에 올립니다.

```bash
tar -a -cf karnas-windows.zip -C build/windows .
```

초대 링크는 `src/server/public/app.js` 의 `DISCORD_INVITE` 와 `index.html` 의
다운로드 절 두 곳에 있습니다. 링크가 바뀌면 두 곳을 함께 고칩니다. HTML 쪽은
JS 가 막힌 환경에서 보이는 자리입니다.

클라이언트의 접속 대상은 프로파일로 고릅니다. `user://client.cfg` 의 `[network] profile` 입니다.

| 프로파일 | 주소 | 언제 |
|---|---|---|
| `dev` | `ws://localhost:3000/ws` | 편집기에서 실행할 때의 기본값 |
| `production` | `wss://mud.noizze.net/ws` | 내보낸 빌드의 기본값 |
| `custom` | `host`·`port`·`secure` 를 파일에서 읽는다 | 그 밖의 대상 |

기본값은 실행 형태가 정합니다. 편집기는 `dev`, 내보낸 빌드는 `production` 입니다. 배포한 실행 파일이 localhost 를 보는 사고를 막습니다.

한 빌드로 두 환경을 오가려면 명령줄을 씁니다.

```bash
"Echoes of the Fallen Age.exe" --profile=dev
godot --path godot -- --profile=production
```

`client.cfg` 의 위치는 Windows 에서 `%APPDATA%/Godot/app_userdata/<프로젝트 이름>/client.cfg` 입니다. 접속이 되지 않으면 이 파일과 기동 로그의 `접속 대상:` 줄을 먼저 봅니다.

도메인이나 포트를 바꾸면 `godot/scripts/net/client_config.gd` 의 `PROFILES` 를 고칩니다. `godot/tests/cases/test_client_config.gd` 가 그 값을 검증하므로 함께 고쳐야 합니다.

## 배포 확인

```bash
# 정적 랜딩
curl -sI http://localhost/ | head -1

# 게임 채널 (welcome 이 오면 사슬이 이어졌다)
npx wscat -c ws://localhost/ws
```

## 로그와 모니터링

```bash
docker compose logs -f gateway
docker compose logs -f web

tail -f logs/combined.log
tail -f logs/error.log
```

비밀번호는 어느 경로에서도 기록하지 않습니다. 회원가입 실패는 어느 규칙을
어겼는지만 남습니다.

연결 수는 게이트웨이 로그로 확인합니다. 상한의 90% 를 넘으면 경고를 남깁니다.

## 문제 해결

### 컨테이너가 시작되지 않는다

```bash
docker compose logs gateway
docker inspect karnas-gateway
```

### 게이트웨이가 MUD 서버에 붙지 못한다

컨테이너에서 호스트로 나가는 주소가 맞는지 확인합니다. compose 는
`host.docker.internal` 을 `extra_hosts` 로 넣어 둡니다. MUD 서버의 어드민
포트가 루프백 전용이면 컨테이너에서 닿지 않으므로 바인드 주소를 조정해야
합니다.

### 정적 파일이 404 다

nginx 웹 루트에 `index.html` 이 있는지 확인합니다. compose 는
`src/server/public` 을 물립니다. 없는 파일은 404 로 둡니다. 단일 페이지이므로
`index.html` 로 되돌리지 않습니다.

### WebSocket 이 101 로 올라가지 않는다

`/ws` 와 `/admin` 위치에 `Upgrade`, `Connection` 헤더가 있어야 합니다.
그 밖의 경로는 게이트웨이가 404 로 거부합니다.

### 연결이 1009 로 끊긴다

라인 길이 상한(256KB)을 넘었습니다. 어드민 채널의 큰 응답에서 나올 수 있으며
클라이언트의 수신 버퍼도 같은 크기여야 합니다.

### 포트 충돌

```bash
netstat -ano | findstr :80
```

### 이미지 정리

```bash
docker image prune -a
```

## 보안

1. `.env` 를 커밋하지 않습니다. 서비스 토큰이 유출되면 임의 계정 생성이
   가능합니다. 유출 시 MUD 서버와 게이트웨이 양쪽의 값을 함께 교체합니다.
2. 게이트웨이 포트를 외부에 노출하지 않습니다. 요청 제한이
   `X-Forwarded-For` 를 신뢰합니다.
3. MUD 서버의 어드민 포트(4001)를 외부에 노출하지 않습니다. 계정 생성 경로가
   그 포트에 있습니다.
4. 프로덕션에서는 TLS 를 종단합니다. 클라이언트는 `wss://` 로 붙습니다.
5. 게이트웨이는 데이터베이스에 접근하지 않습니다. 이 성질을 유지합니다. 어드민
   기능은 MUD 서버의 어드민 채널에 있습니다.
6. 로그 로테이션을 설정합니다. `logs/` 는 컨테이너 밖 볼륨입니다.

## 추가 자료

- [프로젝트 README](./README.md)
- 프로토콜 계약: 서버 저장소 `docs/protocol/`
