#!/usr/bin/env bash
#
# Godot 클라이언트 내보내기
#
# 내보내기 전에 전역 클래스 캐시를 만든다. `class_name` 등록이 그 캐시에
# 들어가므로, 캐시가 없으면 autoload 스크립트가 전역 클래스를 못 찾고 실제와
# 무관한 파스 오류가 쏟아진다. `--editor --quit` 은 첫 프레임에 종료해 파일
# 시스템 스캔이 끊기므로 캐시를 만들지 못한다. `--import` 를 쓴다.
#
# 내보내기 템플릿이 없으면 여기서 멈추고 설치 방법을 알린다. 템플릿은 엔진
# 배포물에 들어 있지 않고 편집기가 따로 받는다.
#
# 사용법:
#   bash scripts/godot-build.sh              # 릴리스 내보내기
#   bash scripts/godot-build.sh --debug      # 디버그 내보내기
#   bash scripts/godot-build.sh --pack-only  # .pck 만. 템플릿이 필요 없다
#   GODOT_BIN=/path/to/godot bash scripts/godot-build.sh

set -uo pipefail

GODOT_BIN="${GODOT_BIN:-/c/Users/USER/Documents/Godot_v4.2.2-stable_win64/Godot_v4.2.2-stable_win64_console.exe}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="$REPO_DIR/godot"
PRESET="${PRESET:-Windows Desktop}"
BUILD_DIR="${BUILD_DIR:-$REPO_DIR/build/windows}"
EXE_NAME="${EXE_NAME:-Echoes of the Fallen Age.exe}"
IMPORT_TIMEOUT="${IMPORT_TIMEOUT:-180}"
EXPORT_TIMEOUT="${EXPORT_TIMEOUT:-300}"

mode="release"
case "${1:-}" in
  --debug) mode="debug" ;;
  --pack-only) mode="pack" ;;
  "") ;;
  *) echo "알 수 없는 인자: $1" >&2; exit 2 ;;
esac

if [ ! -x "$GODOT_BIN" ]; then
  echo "Godot 실행 파일을 찾을 수 없습니다: $GODOT_BIN" >&2
  echo "GODOT_BIN 환경 변수로 경로를 지정하세요." >&2
  exit 2
fi

if [ ! -f "$PROJECT_DIR/export_presets.cfg" ]; then
  echo "내보내기 설정이 없습니다: $PROJECT_DIR/export_presets.cfg" >&2
  echo "이 파일은 저장소에 없습니다. 편집기의 프로젝트 > 내보내기에서" >&2
  echo "'$PRESET' 프리셋을 만들거나 다른 개발자의 설정을 받아야 합니다." >&2
  exit 2
fi

version="$("$GODOT_BIN" --version | tr -d '\r')"
echo "Godot: $version"
echo "프리셋: $PRESET ($mode)"

# 전역 클래스 캐시 준비
if [ ! -f "$PROJECT_DIR/.godot/global_script_class_cache.cfg" ]; then
  echo "전역 클래스 캐시를 만듭니다"
  timeout "$IMPORT_TIMEOUT" "$GODOT_BIN" --headless --path "$PROJECT_DIR" \
    --import > /dev/null 2>&1
  if [ ! -f "$PROJECT_DIR/.godot/global_script_class_cache.cfg" ]; then
    echo "캐시를 만들지 못했습니다. scripts/godot-check.sh 로 원인을 보세요." >&2
    exit 1
  fi
fi

mkdir -p "$BUILD_DIR"

if [ "$mode" = "pack" ]; then
  target="$BUILD_DIR/game.pck"
  echo "대상: $target"
  output=$(timeout "$EXPORT_TIMEOUT" "$GODOT_BIN" --headless --path "$PROJECT_DIR" \
    --export-pack "$PRESET" "$target" 2>&1)
else
  # 템플릿 확인. 없으면 내보내기가 설정 오류로 실패한다
  template_dir="$APPDATA/Godot/export_templates/${version%%.stable*}.stable"
  if [ ! -d "$template_dir" ]; then
    echo
    echo "내보내기 템플릿이 없습니다: $template_dir" >&2
    echo "다음 중 하나로 설치하세요." >&2
    echo "  1. 편집기 > 편집기 > 내보내기 템플릿 관리 > 다운로드" >&2
    echo "  2. Godot_v${version%%.stable*}-stable_export_templates.tpz 를 받아" >&2
    echo "     위 디렉터리에 압축을 풀기" >&2
    echo >&2
    echo "템플릿 없이 리소스 묶음만 확인하려면 --pack-only 를 쓰세요." >&2
    exit 1
  fi

  target="$BUILD_DIR/$EXE_NAME"
  echo "대상: $target"
  flag="--export-release"
  [ "$mode" = "debug" ] && flag="--export-debug"
  output=$(timeout "$EXPORT_TIMEOUT" "$GODOT_BIN" --headless --path "$PROJECT_DIR" \
    "$flag" "$PRESET" "$target" 2>&1)
fi

status=$?

if [ "$status" -eq 124 ]; then
  echo "TIMEOUT 내보내기가 ${EXPORT_TIMEOUT}초 안에 끝나지 않았습니다" >&2
  exit 1
fi

# 종료 코드만으로는 판정하지 않는다. 설정 오류는 코드 0 으로도 나온다
errors=$(echo "$output" | grep -E "^ERROR:|Project export .* failed")
if [ -n "$errors" ] || [ ! -e "$target" ]; then
  echo "FAIL 내보내기 실패" >&2
  echo "$output" | grep -vE "^\s*savepack" | tail -20 >&2
  exit 1
fi

echo
echo "완료"
ls -la "$BUILD_DIR"
