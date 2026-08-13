# WebSocket 게이트웨이 이미지
#
# 이 이미지는 게이트웨이와 `/api/register` 를 담는다. 랜딩 정적 자산도 함께
# 넣는다. 프로덕션에서는 nginx 가 서빙하므로 이미지의 사본은 nginx 에 물릴
# 원본이자 정적 서빙을 켰을 때(`LANDING_SERVE_STATIC=1`) 쓰는 자산이다.

# 1단계: 서버 빌드
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY src/server ./src/server
COPY src/shared ./src/shared
COPY tsconfig.server.json ./
COPY tsconfig.build.json ./

# 테스트는 산출물에서 빠진다. tsconfig.build.json 이 제외한다
RUN npm run build:server

# 2단계: 실행 이미지
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production && npm cache clean --force

# 산출물에는 CommonJS 표식(dist/server/package.json)이 함께 들어온다.
# 저장소의 `"type": "module"` 선언을 지우는 우회가 필요하지 않다
COPY --from=builder /app/dist/server ./dist/server

# 랜딩 정적 자산. nginx 가 이 경로를 물어 서빙한다
COPY src/server/public ./public

# 로그 디렉터리. 게이트웨이는 데이터베이스에 접근하지 않는다
RUN mkdir -p logs

ENV LANDING_STATIC_ROOT=/app/public

EXPOSE 3000

CMD ["node", "dist/server/server/start.js"]
