import { startServer } from './gateway.js';
import { AdminRouter } from './webadmin/admin-router.js';
import { AuthModule } from './webadmin/auth.js';
import { DBClient } from './webadmin/db-client.js';

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

// Web Admin 모듈 인스턴스 생성
const dbClient = new DBClient();
const authModule = new AuthModule();
const adminRouter = new AdminRouter(authModule, dbClient);

const server = startServer({
  port,
  telnetHost,
  telnetPort,
  adminPort,
  maxConnections,
  connectionTimeout,
  adminRouter
});

// 서버 종료 시 DB 연결 정리
const shutdownDb = () => {
  dbClient.close();
  void server;
};

process.on('SIGINT', shutdownDb);
process.on('SIGTERM', shutdownDb);
