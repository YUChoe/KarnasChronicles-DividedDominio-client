#!/bin/bash

# Docker 이미지 빌드 스크립트
# 사용법: ./scripts/build-docker.sh [version]

set -e

VERSION=${1:-latest}
IMAGE_NAME="browser-telnet-terminal"

echo "=========================================="
echo "Docker 이미지 빌드 시작"
echo "=========================================="
echo "이미지 이름: ${IMAGE_NAME}"
echo "버전: ${VERSION}"
echo ""

# 빌드 전 정리
echo "이전 빌드 정리 중..."
rm -rf dist
mkdir -p logs

# Docker 이미지 빌드
echo "Docker 이미지 빌드 중..."
docker build -t ${IMAGE_NAME}:${VERSION} .

# latest 태그도 추가
if [ "$VERSION" != "latest" ]; then
    echo "latest 태그 추가 중..."
    docker tag ${IMAGE_NAME}:${VERSION} ${IMAGE_NAME}:latest
fi

echo ""
echo "=========================================="
echo "빌드 완료!"
echo "=========================================="
echo "이미지: ${IMAGE_NAME}:${VERSION}"
docker images | grep ${IMAGE_NAME}

echo ""
echo "실행 방법:"
echo "  docker run -p 3000:3000 ${IMAGE_NAME}:${VERSION}"
echo ""
echo "또는 docker-compose 사용:"
echo "  docker-compose up -d"
