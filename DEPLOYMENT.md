# 배포 가이드

이 문서는 Browser Telnet Terminal 애플리케이션을 Docker를 사용하여 배포하는 방법을 설명합니다.

## 목차

1. [사전 요구사항](#사전-요구사항)
2. [환경 변수 설정](#환경-변수-설정)
3. [Docker 빌드](#docker-빌드)
4. [Docker 배포](#docker-배포)
5. [Docker Compose 사용](#docker-compose-사용)
6. [모니터링 및 로그](#모니터링-및-로그)
7. [문제 해결](#문제-해결)

## 사전 요구사항

- Docker 20.10 이상
- Docker Compose 1.29 이상 (선택사항)
- 최소 2GB RAM
- 최소 5GB 디스크 공간

## 환경 변수 설정

### 1. 환경 변수 파일 생성

```bash
# .env.example을 복사하여 .env 파일 생성
cp .env.example .env
```

### 2. 환경 변수 설명

| 변수 | 설명 | 기본값 | 필수 |
|------|------|--------|------|
| `NODE_ENV` | Node.js 실행 환경 | `production` | ✓ |
| `WS_PORT` | WebSocket Gateway 포트 | `3000` | ✓ |
| `TELNET_HOST` | 텔넷 서버 호스트 | `localhost` | ✓ |
| `TELNET_PORT` | 텔넷 서버 포트 | `4000` | ✓ |
| `MAX_CONNECTIONS` | 최대 동시 연결 수 | `200` | ✓ |
| `CONNECTION_TIMEOUT` | 연결 타임아웃 (ms) | `30000` | - |
| `LOG_LEVEL` | 로그 레벨 (error, warn, info, debug) | `info` | - |
| `VITE_WS_URL` | 클라이언트 WebSocket URL | `ws://localhost:3000` | - |

### 3. 환경별 설정 파일

개발, 스테이징, 프로덕션 환경별로 다른 설정을 사용할 수 있습니다:

```bash
# 개발 환경
.env.development

# 스테이징 환경
.env.staging

# 프로덕션 환경
.env.production
```

## Docker 빌드

### 자동 빌드 스크립트 사용

```bash
# 스크립트에 실행 권한 부여
chmod +x scripts/build-docker.sh

# 빌드 실행 (latest 태그)
./scripts/build-docker.sh

# 특정 버전으로 빌드
./scripts/build-docker.sh v1.0.0
```

### 수동 빌드

```bash
# 기본 빌드
docker build -t browser-telnet-terminal:latest .

# 특정 버전으로 빌드
docker build -t browser-telnet-terminal:v1.0.0 .

# 빌드 캐시 없이 빌드
docker build --no-cache -t browser-telnet-terminal:latest .
```

### 빌드 확인

```bash
# 이미지 목록 확인
docker images | grep browser-telnet-terminal

# 이미지 상세 정보 확인
docker inspect browser-telnet-terminal:latest
```

## Docker 배포

### 자동 배포 스크립트 사용

```bash
# 스크립트에 실행 권한 부여
chmod +x scripts/deploy-docker.sh

# 프로덕션 배포
./scripts/deploy-docker.sh production

# 개발 환경 배포
./scripts/deploy-docker.sh development
```

### 수동 배포

```bash
# 단일 컨테이너 실행
docker run -d \
  --name telnet-gateway \
  --env-file .env \
  -p 3000:3000 \
  -v $(pwd)/logs:/app/logs \
  --restart unless-stopped \
  browser-telnet-terminal:latest

# 컨테이너 상태 확인
docker ps -f name=telnet-gateway
```

### 컨테이너 관리

```bash
# 컨테이너 중지
docker stop telnet-gateway

# 컨테이너 시작
docker start telnet-gateway

# 컨테이너 재시작
docker restart telnet-gateway

# 컨테이너 제거
docker rm -f telnet-gateway
```

## Docker Compose 사용

Docker Compose를 사용하면 여러 서비스를 한 번에 관리할 수 있습니다.

### 서비스 구성

`docker-compose.yml` 파일은 다음 서비스를 포함합니다:

1. **gateway**: WebSocket Gateway 서버

**참고**: 클라이언트 정적 파일은 별도의 웹 서버에서 서빙하는 것을 권장합니다.

### 실행

```bash
# 모든 서비스 시작 (백그라운드)
docker-compose up -d

# 특정 서비스만 시작
docker-compose up -d gateway

# 로그 출력과 함께 시작
docker-compose up
```

### 관리

```bash
# 서비스 상태 확인
docker-compose ps

# 로그 확인
docker-compose logs -f

# 특정 서비스 로그 확인
docker-compose logs -f gateway

# 서비스 중지
docker-compose stop

# 서비스 중지 및 제거
docker-compose down

# 볼륨까지 제거
docker-compose down -v
```

### 클라이언트 배포

클라이언트 정적 파일은 별도로 배포해야 합니다:

```bash
# 클라이언트 빌드
npm run build:client

# 빌드된 파일은 dist/client 디렉토리에 생성됨
# 이 파일들을 웹 서버(nginx, Apache, CDN 등)에 배포
```

**Nginx 설정 예시** (`nginx.conf` 파일 참조):
```bash
# dist/client 디렉토리를 nginx 웹 루트로 복사
cp -r dist/client/* /var/www/html/

# 또는 nginx 설정에서 직접 참조
# root /path/to/dist/client;
```

### 스케일링

```bash
# Gateway 서비스를 3개 인스턴스로 확장
docker-compose up -d --scale gateway=3

# 로드 밸런서(nginx, HAProxy 등) 설정 필요
```

## 모니터링 및 로그

### 로그 확인

```bash
# 실시간 로그 확인
docker logs -f telnet-gateway

# 최근 100줄 확인
docker logs --tail 100 telnet-gateway

# 타임스탬프와 함께 확인
docker logs -t telnet-gateway
```

### 로그 파일

로그는 `logs/` 디렉토리에 저장됩니다:

```bash
# 전체 로그
tail -f logs/combined.log

# 에러 로그만
tail -f logs/error.log

# 특정 패턴 검색
grep "ERROR" logs/combined.log
```

### 리소스 모니터링

```bash
# 컨테이너 리소스 사용량 확인
docker stats telnet-gateway

# 모든 컨테이너 리소스 확인
docker stats

# 디스크 사용량 확인
docker system df
```

### Health Check

```bash
# 컨테이너 상태 확인
docker inspect --format='{{.State.Health.Status}}' telnet-gateway

# Health check 로그 확인
docker inspect --format='{{json .State.Health}}' telnet-gateway | jq
```

## 클라이언트 정적 파일 서빙

### 옵션 1: Nginx 사용

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/dist/client;
    index index.html;

    # Gzip 압축
    gzip on;
    gzip_types text/plain text/css application/javascript application/json;

    # 정적 파일 캐싱
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 옵션 2: CDN 사용

AWS S3 + CloudFront, Netlify, Vercel 등의 CDN 서비스에 배포:

```bash
# 예: AWS S3에 배포
aws s3 sync dist/client s3://your-bucket-name --delete
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

### 옵션 3: Docker로 Nginx와 함께 배포

필요한 경우 `nginx.conf` 파일을 사용하여 클라이언트도 컨테이너화할 수 있습니다:

```bash
docker run -d \
  --name telnet-client \
  -p 8080:80 \
  -v $(pwd)/dist/client:/usr/share/nginx/html:ro \
  -v $(pwd)/nginx.conf:/etc/nginx/conf.d/default.conf:ro \
  nginx:alpine
```

## 프로덕션 배포 체크리스트

배포 전 다음 사항을 확인하세요:

**Gateway 서버:**
- [ ] 환경 변수가 올바르게 설정되었는지 확인
- [ ] 텔넷 서버가 실행 중이고 접근 가능한지 확인
- [ ] 방화벽 규칙이 올바르게 설정되었는지 확인 (포트 3000)
- [ ] 로그 로테이션이 설정되었는지 확인
- [ ] 모니터링 및 알림이 설정되었는지 확인
- [ ] 부하 테스트를 수행했는지 확인

**클라이언트:**
- [ ] 클라이언트가 빌드되었는지 확인 (`npm run build:client`)
- [ ] WebSocket URL이 올바르게 설정되었는지 확인
- [ ] 정적 파일이 웹 서버에 배포되었는지 확인
- [ ] SSL/TLS 인증서가 설정되었는지 확인 (프로덕션)
- [ ] CORS 설정이 올바른지 확인
- [ ] CDN 캐싱이 설정되었는지 확인

## 문제 해결

### 컨테이너가 시작되지 않음

```bash
# 컨테이너 로그 확인
docker logs telnet-gateway

# 컨테이너 상세 정보 확인
docker inspect telnet-gateway

# 이벤트 로그 확인
docker events --filter container=telnet-gateway
```

### 포트 충돌

```bash
# 포트 사용 확인
netstat -tulpn | grep 3000

# 다른 포트로 실행
docker run -d -p 3001:3000 browser-telnet-terminal:latest
```

### 메모리 부족

```bash
# 메모리 제한 설정
docker run -d --memory="2g" browser-telnet-terminal:latest

# 메모리 사용량 확인
docker stats --no-stream telnet-gateway
```

### 네트워크 문제

```bash
# 네트워크 확인
docker network ls

# 컨테이너 네트워크 정보 확인
docker inspect --format='{{.NetworkSettings.Networks}}' telnet-gateway

# 네트워크 재생성
docker network rm telnet-network
docker network create telnet-network
```

### 이미지 정리

```bash
# 사용하지 않는 이미지 제거
docker image prune -a

# 모든 리소스 정리
docker system prune -a --volumes
```

## 보안 권장사항

1. **환경 변수 보호**
   - `.env` 파일을 Git에 커밋하지 마세요
   - 민감한 정보는 Docker Secrets 사용

2. **네트워크 격리**
   - 프로덕션에서는 별도의 Docker 네트워크 사용
   - 불필요한 포트 노출 최소화

3. **이미지 보안**
   - 정기적으로 이미지 업데이트
   - 취약점 스캔 도구 사용 (예: Trivy)

4. **로그 관리**
   - 민감한 정보가 로그에 포함되지 않도록 주의
   - 로그 로테이션 설정

5. **리소스 제한**
   - 메모리 및 CPU 제한 설정
   - 연결 수 제한 적용

## 추가 리소스

- [Docker 공식 문서](https://docs.docker.com/)
- [Docker Compose 문서](https://docs.docker.com/compose/)
- [프로젝트 README](./README.md)
