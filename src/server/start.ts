import path from 'path';
import { startServer } from './gateway.js';
import { logger } from './logger.js';
import { AccountClient } from './landing/account-client.js';
import { LandingRouter } from './landing/router.js';
import { RateLimiter } from './landing/rate-limit.js';

/** 기본 최대 동시 연결 수. 이전에는 코드에 박혀 있었다. */
const DEFAULT_MAX_CONNECTIONS = 200;

/** 기본 유휴 연결 정리 주기 (밀리초). */
const DEFAULT_CONNECTION_TIMEOUT = 300_000;

/** 랜딩 회원가입 허용 횟수와 윈도우 */
const DEFAULT_REGISTER_LIMIT = 5;
const DEFAULT_REGISTER_WINDOW_MS = 60 * 60 * 1000;

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const port = intFromEnv('WS_PORT', 3000);
const telnetHost = process.env.TELNET_HOST || 'localhost';
const telnetPort = intFromEnv('TELNET_PORT', 4000);
const adminPort = intFromEnv('ADMIN_PORT', 4001);
const maxConnections = intFromEnv('MAX_CONNECTIONS', DEFAULT_MAX_CONNECTIONS);
const connectionTimeout = intFromEnv(
  'CONNECTION_TIMEOUT',
  DEFAULT_CONNECTION_TIMEOUT
);

// 서비스 토큰이 없으면 회원가입 경로를 만들지 않는다. MUD 서버도 토큰이 없는
// 배포에서는 이 경로를 등록하지 않으므로 양쪽이 같은 규칙을 따른다.
const serviceToken = process.env.LANDING_SERVICE_TOKEN ?? '';

const accountClient =
  serviceToken.length > 0
    ? new AccountClient({
        host: telnetHost,
        port: adminPort,
        token: serviceToken
      })
    : undefined;

if (accountClient === undefined) {
  logger.warn('LANDING_SERVICE_TOKEN not set - registration disabled');
}

// 정적 자산은 프로덕션에서 nginx 가 서빙한다. 게이트웨이의 서빙은 개발용이다
const serveStatic = process.env.LANDING_SERVE_STATIC === '1';
const staticRoot =
  process.env.LANDING_STATIC_ROOT ??
  path.resolve(process.cwd(), 'src/server/public');

const landing = new LandingRouter({
  staticRoot,
  serveStatic,
  accountClient,
  rateLimiter: new RateLimiter({
    limit: intFromEnv('REGISTER_LIMIT', DEFAULT_REGISTER_LIMIT),
    windowMs: intFromEnv('REGISTER_WINDOW_MS', DEFAULT_REGISTER_WINDOW_MS)
  })
});

if (serveStatic) {
  logger.info('Serving landing assets from gateway', { staticRoot });
}

// 게이트웨이는 상태를 갖지 않는다. 데이터베이스에 접근하지 않으며 인증은 MUD
// 서버가 담당한다. 웹 어드민은 어드민 채널(TCP 4001)로 이전했다.
startServer({
  port,
  telnetHost,
  telnetPort,
  adminPort,
  maxConnections,
  connectionTimeout,
  landing
});
