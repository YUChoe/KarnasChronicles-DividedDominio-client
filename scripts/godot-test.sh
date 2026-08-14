#!/usr/bin/env bash
#
# Godot 클라이언트 단위 테스트
#
# `godot/tests/cases/test_*.gd` 를 러너로 돌린다. 서버 없이 검증 가능한 것만
# 다룬다. 통신이 필요한 것은 서버와 게이트웨이를 띄워 확인한다.
#
# `--script` 경로의 종료 코드는 신뢰할 수 있다. 게임 실행이나 `--editor --quit`
# 의 종료 코드는 그렇지 않아 이 경로를 쓴다. 그래도 외부 타임아웃을 건다.
# GDScript 런타임 오류는 해당 함수만 중단시키므로 `quit()` 에 닿지 못하면
# 프로세스가 그대로 멈춘다.
#
# 사용법:
#   bash scripts/godot-test.sh
#   GODOT_BIN=/path/to/godot bash scripts/godot-test.sh

set -uo pipefail

GODOT_BIN="${GODOT_BIN:-/c/Users/USER/Documents/Godot_v4.2.2-stable_win64/Godot_v4.2.2-stable_win64_console.exe}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../godot" && pwd)"
TEST_TIMEOUT="${TEST_TIMEOUT:-120}"

if [ ! -x "$GODOT_BIN" ]; then
  echo "Godot 실행 파일을 찾을 수 없습니다: $GODOT_BIN" >&2
  echo "GODOT_BIN 환경 변수로 경로를 지정하세요." >&2
  exit 2
fi

# 전역 클래스 캐시가 없으면 먼저 만든다. `class_name` 등록이 그 캐시에 들어가며,
# 없으면 러너가 테스트 클래스를 미선언 식별자로 본다. 새로 클론했거나 `.godot`
# 를 지운 뒤 첫 실행이 그렇다.
if [ ! -f "$PROJECT_DIR/.godot/global_script_class_cache.cfg" ]; then
  timeout "$TEST_TIMEOUT" "$GODOT_BIN" --headless --path "$PROJECT_DIR" \
    --import > /dev/null 2>&1
fi

output=$(timeout "$TEST_TIMEOUT" "$GODOT_BIN" --headless --path "$PROJECT_DIR" \
  --script res://tests/runner.gd 2>&1)
status=$?

# 종료 시 엔진이 뱉는 정리 관련 잡음은 걸러낸다. 테스트 결과가 아니다.
echo "$output" | grep -vE "BUG: Unreferenced|PagedAllocator|ObjectDB instances leaked|Resources still in use|^ *at: "

if [ "$status" -eq 124 ]; then
  echo "TIMEOUT 테스트가 ${TEST_TIMEOUT}초 안에 끝나지 않았습니다" >&2
  exit 1
fi

exit "$status"
