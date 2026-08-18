# Karnas Chronicles: Divided Dominion — Godot 클라이언트

MUD 서버 `Echoes-of-the-Fallen-Age` 에 붙는 게임 클라이언트입니다. Godot 4.2.2
로 만들었고 Windows 실행 파일과 웹(wasm)으로 내보냅니다.

서버에 직접 붙지 않습니다. WebSocket 게이트웨이를 거칩니다. 게이트웨이와 랜딩
사이트는 별도 저장소인 `karnas-gateway` 에 있습니다.

```
Godot 클라이언트 ──wss──▶ nginx ──▶ 게이트웨이 :3000 ──TCP──▶ MUD 서버 :4000
```

## 요구 사항

- Godot 4.2.2 (`C:\Users\USER\Documents\Godot_v4.2.2-stable_win64`)
- Python 3.10 이상 (계약 대조 스크립트)
- 내보내려면 같은 버전의 내보내기 템플릿

Node 는 필요하지 않습니다. 스크립트를 직접 부릅니다.

## 검사와 테스트

```bash
bash scripts/godot-check.sh              # 스크립트별 파스와 타입 (62개)
bash scripts/godot-test.sh               # 단위 테스트 (176건)
python scripts/check-contract-coverage.py # 계약과 메시지 타입 대조
```

`check-contract-coverage.py` 는 서버 저장소를 형제 디렉터리에서 찾습니다. 다른
곳에 있으면 `SERVER_REPO` 로 지정합니다.

## 내보내기

```bash
bash scripts/godot-build.sh              # 상용 데스크톱. build/windows/
bash scripts/godot-build.sh --dev        # 개발 데스크톱. build/windows-dev/
bash scripts/godot-build.sh --web        # 웹(wasm). build/web/
bash scripts/godot-build.sh --pack-only  # 템플릿 없이 리소스 묶음만 확인
```

배포하는 것은 `build/windows/` 입니다. `embed_pck=true` 라 실행 파일 하나이며
그것만 올리면 됩니다.

개발 빌드는 내보내기 프리셋의 `custom_features` 가 `devbuild` 라 클라이언트가
자신을 개발 빌드로 알고 `ws://localhost:3000` 을 봅니다. 콘솔 창이 함께 뜨고
디버그로 내보내므로 오류 위치가 자세합니다. 배포하지 않습니다.

내보내기 템플릿은 엔진 배포물에 없습니다. 편집기의 `편집기 > 내보내기 템플릿
관리 > 다운로드` 로 받거나 `Godot_v4.2.2-stable_export_templates.tpz` 를
`%APPDATA%/Godot/export_templates/4.2.2.stable/` 에 풉니다. 없으면 빌드
스크립트가 그 경로를 알려 주고 멈춥니다.

`export_presets.cfg` 는 저장소에 있습니다. 서명 자격 정보를 담지 않습니다.

## 접속 대상

`user://client.cfg` 의 `[network] profile` 이 정합니다.

| 프로파일 | 주소 | 기본으로 쓰이는 때 |
|---|---|---|
| `dev` | `ws://localhost:3000/ws` | 편집기 실행과 개발 빌드 |
| `production` | `wss://mud.noizze.net/ws` | 상용 빌드와 웹 빌드 |
| `custom` | `host`·`port`·`secure` 를 파일에서 읽는다 | 그 밖의 대상 |

우선순위는 명령줄 > `client.cfg` > 위 기본값입니다.

```bash
"build/windows/Echoes of the Fallen Age.exe" --profile=dev
godot --path godot -- --profile=production
```

편집기로 한 번 돌린 기계에는 `profile="dev"` 가 적힌 `client.cfg` 가 남습니다.
상용 빌드를 확인할 때는 그 파일을 지우거나 `--profile=production` 을 붙이십시오.
Windows 에서 그 파일은 `%APPDATA%/Godot/app_userdata/Echoes of the Fallen
Age/client.cfg` 입니다.

접속이 되지 않으면 그 파일과 기동 로그의 `접속 대상:` 줄을 먼저 봅니다.

도메인이나 포트를 바꾸려면 `godot/scripts/net/client_config.gd` 의 `PROFILES`
를 고칩니다. `godot/tests/cases/test_client_config.gd` 가 그 값을 검증하므로
함께 고쳐야 합니다.

## 웹 배포

`build/web/` 을 게이트웨이 저장소가 관리하는 nginx 의 `/play/` 로 복사합니다.

```bash
sudo cp build/web/* /var/www/mud/play/
```

Godot 4.2 의 웹 빌드는 `SharedArrayBuffer` 를 씁니다. 교차 출처 격리
헤더(`Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`)가 없으면
로더에서 멈춥니다. `wasm` 형식도 맞아야 합니다. 두 가지 모두 게이트웨이 저장소의
`nginx.conf` 가 처리합니다.

## 구조

```
├── godot/
│   ├── scenes/         화면. boot 가 조립 지점이다
│   ├── scripts/
│   │   ├── net/        연결, 디스패처, 액션 송신, 접속 설정
│   │   ├── state/      상태 저장소
│   │   ├── rules/      액션 규칙과 거절 처리
│   │   ├── i18n/       번역
│   │   └── admin/      어드민 채널
│   ├── resources/translations/   번역 파일
│   └── tests/          러너와 케이스
├── scripts/            검사, 테스트, 내보내기
└── .kiro/specs/godot-client/
```

## 계약

프로토콜 계약은 서버 저장소의 `docs/protocol/` 이 유일한 기준입니다. 세
저장소가 그것을 기준으로 삼습니다. 계약이 바뀌면
`godot/scripts/net/protocol.gd` 를 먼저 고칩니다.

## 저장소

| 저장소 | 내용 |
|---|---|
| `Echoes-of-the-Fallen-Age` | MUD 서버. 프로토콜 계약 |
| `karnas-gateway` | WebSocket 게이트웨이, 랜딩, nginx 설정, 배포 |
| 이 저장소 | Godot 클라이언트 |

2026-08-18 에 게이트웨이가 이 저장소에서 갈라져 나갔습니다. 그 이전 이력은 여기
남아 있습니다.
