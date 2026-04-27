import { startServer } from './gateway.js';
import { AdminRouter } from './webadmin/admin-router.js';
import { AuthModule } from './webadmin/auth.js';
import { DBClient } from './webadmin/db-client.js';

const port = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 3000;
const telnetHost = process.env.TELNET_HOST || 'localhost';
const telnetPort = process.env.TELNET_PORT ? parseInt(process.env.TELNET_PORT) : 4000;

// Web Admin 모듈 인스턴스 생성
const dbClient = new DBClient();
const authModule = new AuthModule();
const adminRouter = new AdminRouter(authModule, dbClient);

startServer(port, telnetHost, telnetPort, adminRouter);

// 서버 종료 시 DB 연결 정리
const shutdownDb = () => {
  dbClient.close();
};

process.on('SIGINT', shutdownDb);
process.on('SIGTERM', shutdownDb);
