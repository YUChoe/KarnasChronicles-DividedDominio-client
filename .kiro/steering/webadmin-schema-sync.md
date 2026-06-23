---
inclusion: fileMatch
fileMatchPattern: 'src/server/webadmin/**'
---

# webadmin ↔ 서버 스키마 동기화 가이드

## 배경

webadmin은 게임 서버(Python MUD Engine)의 SQLite DB(`mud_engine.db`)를
`better-sqlite3`로 직접 읽고 씁니다. 별도의 ORM이 없으므로 서버가 스키마를
바꾸면 webadmin 코드도 수동으로 맞춰야 합니다.

- 프로덕션에서 클라이언트 `data/`는 서버 `data/`의 심볼릭 링크입니다.
  따라서 `data/DATABASE_SCHEMA.md`의 정본은 서버 저장소이며, webadmin은
  동일한 DB 파일을 바라봅니다.
- 스키마 문서가 아니라 실제 DB가 소스 오브 트루스입니다. 컬럼 존재 여부는
  반드시 `.schema <table>` 또는 `PRAGMA table_info(<table>)`로 확인합니다.
  (과거 `DATABASE_SCHEMA.md`가 실제 DB에 없는 `game_objects.object_type`을
  잘못 기재한 사례가 있었습니다.)

## 서버 스키마 변경 시 갱신 대상 레이어

서버에서 컬럼/테이블이 추가·변경되면 아래 레이어를 순서대로 점검합니다.

1. `src/server/webadmin/db-client.ts`
   - 엔티티 인터페이스(`Xxx`)와 입력 타입(`CreateXxxInput`, `UpdateXxxInput`)
   - 목록/상세 `SELECT` 컬럼 목록
   - `INSERT`/`UPDATE` 구문과 기본값
   - JSON 컬럼은 `parseJsonField`로 파싱, 저장 시 `JSON.stringify`
   - 맵에 표시되는 필드면 `getMapData`의 rooms/monsters 쿼리와 매핑도 갱신

2. `src/server/webadmin/admin-router.ts`
   - 신규 테이블이면 `handleProtectedApi`의 `switch`에 리소스 case 추가
   - 리소스 핸들러(`handleXxxApi`)와 필수 필드 검증
   - 복합 PK는 `segments`로 경로 분해 (예: `/faction-relations/:a/:b`)

3. `src/server/webadmin/public/app.js`
   - 신규 섹션이면 `SECTIONS` 배열과 `renderers` 맵에 등록
   - 목록 테이블 컬럼, 생성/수정 폼 필드, 폼 수집 로직
   - 드롭다운 상수(예: `ROOM_TYPES`, `STANCE_OPTIONS`)는 서버 허용값과 일치

4. `src/server/webadmin/public/index.html`
   - 신규 섹션이면 사이드바 nav 링크와 `section-<name>` div 추가

5. `data/DATABASE_SCHEMA.md`
   - 서버 저장소의 정본을 기준으로 동기화 (프로덕션은 심볼릭 링크)

## 검증 (필수)

webadmin 변경 후 반드시 실행:

```bash
npm run type-check:server
npm run test:server
```

## 체크리스트

- [ ] 실제 DB에서 `.schema`로 컬럼/타입 확인 (문서 맹신 금지)
- [ ] db-client 인터페이스·SELECT·INSERT·UPDATE 갱신
- [ ] JSON 컬럼 파싱/직렬화 처리
- [ ] admin-router 라우팅·핸들러·검증 갱신
- [ ] app.js 섹션·목록·폼 갱신, 드롭다운 값 일치
- [ ] index.html nav·섹션 추가 (신규 테이블)
- [ ] DATABASE_SCHEMA.md 동기화
- [ ] type-check 및 테스트 통과
