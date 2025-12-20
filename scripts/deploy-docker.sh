#!/bin/bash

# Docker 컨테이너 배포 스크립트
# 사용법: ./scripts/deploy-docker.sh [environment]

set -e

ENVIRONMENT=${1:-production}
IMAGE_NAME="karnas-chronicles-terminal"
CONTAINER_NAME="telnet-gateway"

echo "=========================================="
echo "Docker 컨테이너 배포"
echo "=========================================="
echo "환경: ${ENVIRONMENT}"
echo ""

# 환경 변수 파일 확인
ENV_FILE=".env.${ENVIRONMENT}"
if [ ! -f "$ENV_FILE" ]; then
    echo "경고: ${ENV_FILE} 파일이 없습니다. 기본 설정을 사용합니다."
    ENV_FILE=".env"
fi

# 기존 컨테이너 중지 및 제거
echo "기존 컨테이너 확인 중..."
if [ "$(docker ps -aq -f name=${CONTAINER_NAME})" ]; then
    echo "기존 컨테이너 중지 및 제거 중..."
    docker stop ${CONTAINER_NAME} || true
    docker rm ${CONTAINER_NAME} || true
fi

# docker-compose 사용
if [ -f "docker-compose.yml" ]; then
    echo "docker-compose로 배포 중..."

    # 환경별 docker-compose 파일 확인
    COMPOSE_FILE="docker-compose.yml"
    if [ -f "docker-compose.${ENVIRONMENT}.yml" ]; then
        COMPOSE_FILE="docker-compose.${ENVIRONMENT}.yml"
    fi

    docker-compose -f ${COMPOSE_FILE} down
    docker-compose -f ${COMPOSE_FILE} up -d

    echo ""
    echo "컨테이너 상태:"
    docker-compose -f ${COMPOSE_FILE} ps
else
    # 단일 컨테이너 실행
    echo "Docker 컨테이너 실행 중..."
    docker run -d \
        --name ${CONTAINER_NAME} \
        --env-file ${ENV_FILE} \
        -p 3000:3000 \
        -v $(pwd)/logs:/app/logs \
        --restart unless-stopped \
        ${IMAGE_NAME}:latest

    echo ""
    echo "컨테이너 상태:"
    docker ps -f name=${CONTAINER_NAME}
fi

echo ""
echo "=========================================="
echo "배포 완료!"
echo "=========================================="
echo ""
echo "로그 확인:"
echo "  docker logs -f ${CONTAINER_NAME}"
echo ""
echo "컨테이너 중지:"
echo "  docker stop ${CONTAINER_NAME}"
echo ""
echo "컨테이너 재시작:"
echo "  docker restart ${CONTAINER_NAME}"
