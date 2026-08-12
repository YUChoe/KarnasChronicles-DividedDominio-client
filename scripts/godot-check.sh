#!/usr/bin/env bash
#
# Godot 클라이언트 정적 검사
#
# GDScript 런타임 오류는 프로세스를 죽이지 않고 해당 함수만 버린다. 종료 코드도
# 신뢰할 수 없다. `--editor --quit` 은 정상 프로젝트에서도 1을 돌려주고, 런타임
# 오류가 난 실행은 0을 돌려주거나 아예 멈춘다. 그래서 두 층으로 검사한다.
#
#   1. 스크립트별 `--check-only`. 종료 코드가 신뢰할 수 있는 유일한 경로다.
#   2. 프로젝트 전체 임포트. 미참조 스크립트와 씬·리소스 참조를 훑는다.
#      종료 코드를 무시하고 출력에서 오류를 찾는다.
#
# 두 층 모두 외부 타임아웃을 걸어 멈춘 프로세스를 회수한다.
#
# 사용법:
#   bash scripts/godot-check.sh
#   GODOT_BIN=/path/to/godot bash scripts/godot-check.sh

set -uo pipefail

GODOT_BIN="${GODOT_BIN:-/c/Users/USER/Documents/Godot_v4.2.2-stable_win64/Godot_v4.2.2-stable_win64_console.exe}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../godot" && pwd)"
CHECK_TIMEOUT="${CHECK_TIMEOUT:-30}"
IMPORT_TIMEOUT="${IMPORT_TIMEOUT:-120}"

if [ ! -x "$GODOT_BIN" ]; then
  echo "Godot 실행 파일을 찾을 수 없습니다: $GODOT_BIN" >&2
  echo "GODOT_BIN 환경 변수로 경로를 지정하세요." >&2
  exit 2
fi

echo "Godot: $("$GODOT_BIN" --version)"
echo "프로젝트: $PROJECT_DIR"
echo

failed=0

# 1층. 스크립트별 파스와 타입 검사
echo "== 스크립트 검사 =="
script_count=0
while IFS= read -r path; do
  rel="${path#"$PROJECT_DIR"/}"
  script_count=$((script_count + 1))

  output=$(timeout "$CHECK_TIMEOUT" "$GODOT_BIN" --headless --path "$PROJECT_DIR" \
    --check-only --script "res://$rel" 2>&1)
  status=$?

  if [ "$status" -eq 124 ]; then
    echo "TIMEOUT $rel"
    failed=$((failed + 1))
  elif [ "$status" -ne 0 ]; then
    echo "FAIL    $rel"
    echo "$output" | grep -E "SCRIPT ERROR|ERROR:" | sed 's/^/        /'
    failed=$((failed + 1))
  else
    echo "OK      $rel"
  fi
done < <(find "$PROJECT_DIR" -name '*.gd' -not -path '*/.godot/*' | sort)

echo "스크립트 $script_count개"
echo

# 2층. 프로젝트 전체 임포트. 종료 코드를 쓰지 않고 출력으로 판정한다
echo "== 프로젝트 임포트 =="
import_output=$(timeout "$IMPORT_TIMEOUT" "$GODOT_BIN" --headless --path "$PROJECT_DIR" \
  --editor --quit 2>&1)
import_status=$?

if [ "$import_status" -eq 124 ]; then
  echo "TIMEOUT 임포트가 ${IMPORT_TIMEOUT}초 안에 끝나지 않았습니다"
  failed=$((failed + 1))
else
  errors=$(echo "$import_output" | grep -E "SCRIPT ERROR|ERROR:")
  if [ -n "$errors" ]; then
    echo "FAIL"
    echo "$errors" | sed 's/^/        /'
    failed=$((failed + 1))
  else
    echo "OK      오류 없음"
  fi
fi

echo
if [ "$failed" -eq 0 ]; then
  echo "전체 통과"
  exit 0
fi
echo "실패 ${failed}건"
exit 1
