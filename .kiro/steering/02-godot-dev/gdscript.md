# GDScript 규칙

`godot-client` 스펙의 Task 1.1 과 12 에 흩어져 있던 규칙을 모았다. 저장소 분리
(2026-08-18) 때 옮겼다.

## 정적 타입

모든 선언에 타입을 붙인다. `project.godot` 의 `[debug]` 가 경고를 오류로 올려
파스 단계에서 막는다.

| 항목 | 수준 |
|---|---|
| `untyped_declaration` | 2 (오류) |
| `unsafe_property_access` | 2 (오류) |
| `unsafe_method_access` | 2 (오류) |
| `unsafe_cast` | 2 (오류) |
| `unsafe_call_argument` | 1 (경고) |
| `return_value_discarded` | 1 (경고) |

뒤의 둘을 경고로 둔 것은 `JSON.parse_string` 결과가 전부 Variant 인 디스패처
경계에서 과도하게 걸리기 때문이다.

타입을 붙이면 런타임 오류가 파스 오류로 바뀐다. `var n: int = "문자열"` 은
`--check-only` 에서 잡힌다. 붙이지 않으면 실행할 때까지 알 수 없다.

4.2.2 에는 `treat_warnings_as_errors` 같은 전역 스위치가 없다.
`debug/gdscript/warnings/*` 47개 항목을 하나씩 지정한다.

## 검사와 테스트

GDScript 런타임 오류는 프로세스를 죽이지 않고 해당 함수만 버린다. 헤드리스
실행의 종료 코드를 게이트로 쓸 수 없다. 정적 타입과 경고 승격으로 파스 시점에
잡는 것이 그 대신이다.

```bash
bash scripts/godot-check.sh    # 스크립트별 파스와 타입
bash scripts/godot-test.sh     # 단위 테스트
```

테스트는 `godot/tests/cases/test_*.gd` 에 두고 `TestCase` 를 상속해 `test_`
메서드를 둔다. gdUnit4 나 GUT 를 쓰지 않는다. 둘 다 저장소 밖에서 받아
`addons/` 에 넣어야 하고, 필요한 검증이 씬 트리도 목도 필요 없는 순수 로직이다.

## 콜드 캐시

`.godot` 가 없는 상태에서 `--editor --quit` 을 돌리면 파스 오류가 쏟아진다.
코드 문제가 아니다. `class_name` 전역 클래스 등록이
`.godot/global_script_class_cache.cfg` 에 들어가는데, `--quit` 은 첫 프레임에
종료하므로 파일 시스템 스캔이 끊겨 캐시가 만들어지지 않는다.

`--import` 를 쓰면 스캔이 끝까지 간다. 두 스크립트가 캐시가 없으면 먼저 그것을
돌린다.

## 파일

한 스크립트는 500행을 넘지 않는다. `test_quality.gd` 가 강제한다.

파일은 LF 와 UTF-8 이다.

`*.gd.uid` 는 무시한다. 4.4 이후 편집기가 만드는 파일이며 이 프로젝트가
대상으로 하는 4.2.2 는 쓰지 않는다.

## 자유 문자 입력

계약이 정한 자리에만 둔다. 채팅, 로그인과 회원가입의 계정 항목, `changename` 의
새 이름, 어드민 패널의 폼 값이다. 어드민은 편집 도구이므로 별도로 다룬다.

명령어 입력창을 두지 않는다. 대상 지정은 uuid 이며 번호를 입력받지 않는다.
`test_quality.gd` 가 씬 파일을 훑어 확인한다.

## 문구

영어 문구는 영국 철자를 쓴다. `test_quality.gd` 가 미국 철자 목록을 대조한다.

서버가 보내는 것은 번역 키다. 문장을 만드는 것은 클라이언트다. 키는
`resources/translations/*.json` 에 있고 `en` 과 `ko` 를 모두 갖춰야 한다.

## 계약

프로토콜 계약은 서버 저장소의 `docs/protocol/` 이 유일한 기준이다. 계약이
바뀌면 `scripts/net/protocol.gd` 를 먼저 고친다.

계약에 없는 `type` 은 무시하고 경고만 남긴다. 상위 버전 서버와의 호환을 위한
규칙이므로 목록에 없다는 이유로 연결을 끊지 않는다.

```bash
python scripts/check-contract-coverage.py
```

계약 문서와 `protocol.gd` 를 대조한다. 서버 저장소의
`check_protocol_consistency.py` 가 계약과 서버 구현을 대조하므로 이것이 남은 한
변을 덮는다.
