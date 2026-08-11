import { startServer } from './gateway.js';

/** 기본 최대 동시 연결 수. 이전에는 코드에 박혀 있었다. */
const DEFAULT_MAX_CONNECTIONS = 200;

/** 기본 유휴 연결 정리 주기 (밀리초). */
const DEFAULT_CONNECTION_TIMEOUT = 300_000;

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

// 게이트웨이는 상태를 갖지 않는다. 데이터베이스에 접근하지 않으며 인증은 MUD
// 서버가 담당한다. 웹 어드민은 어드민 채널(TCP 4001)로 이전했다.
startServer({
  port,
  telnetHost,
  telnetPort,
  adminPort,
  maxConnections,
  connectionTimeout
});
