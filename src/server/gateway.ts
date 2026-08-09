import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { logger } from './logger';
import { ConnectionPool, ClientConnection } from './connection-pool';
import { TelnetClient } from './telnet-client';
import { GatewayMessage } from '../shared/types';
import { LineFramer, LineTooLongError } from './line-framer';
import { sanitize, containsDangerousPatterns } from './sanitizer';
import { AdminRouter } from './webadmin/admin-router';

export class GatewayServer {
  private wss: WebSocketServer | null = null;
  private httpServer: http.Server | null = null;
  private connectionPool: ConnectionPool;
  private port: number;
  private telnetHost: string;
  private telnetPort: number;
  private adminRouter?: AdminRouter;

  constructor(
    port: number = 3000,
    telnetHost: string = 'localhost',
    telnetPort: number = 4000,
    maxConnections: number = 200,
    adminRouter?: AdminRouter
  ) {
    this.port = port;
    this.telnetHost = telnetHost;
    this.telnetPort = telnetPort;
    this.connectionPool = new ConnectionPool(maxConnections);
    this.adminRouter = adminRouter;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      // HTTP 서버 생성 - HTTP 요청은 AdminRouter로 위임
      this.httpServer = http.createServer((req, res) => {
        if (this.adminRouter) {
          this.adminRouter.handleRequest(req, res);
        } else {
          // AdminRouter가 없는 경우 기본 404 응답
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });

      // WebSocket 서버를 noServer 모드로 생성
      this.wss = new WebSocketServer({ noServer: true });

      // HTTP upgrade 이벤트에서 WebSocket 핸들링
      this.httpServer.on('upgrade', (req, socket, head) => {
        this.wss!.handleUpgrade(req, socket, head, (ws) => {
          this.wss!.emit('connection', ws, req);
        });
      });

      this.wss.on('connection', (ws: WebSocket, req) => {
        this.handleConnection(ws, req);
      });

      this.wss.on('error', (error) => {
        logger.error('WebSocket server error', { error: error.message });
      });

      this.httpServer.on('error', (error) => {
        logger.error('HTTP server error', { error: error.message });
      });

      this.httpServer.listen(this.port, () => {
        logger.info('Gateway server started', {
          port: this.port,
          telnetHost: this.telnetHost,
          telnetPort: this.telnetPort
        });
        resolve();
      });
    });
  }

  private async handleConnection(ws: WebSocket, req: any): Promise<void> {
    const clientId = randomUUID();
    const remoteAddress = req.socket.remoteAddress;

    logger.info('New WebSocket connection', { clientId, remoteAddress });

    // 연결 제한 확인 (최대 연결 수)
    const currentSize = this.connectionPool.getSize();
    const maxConnections = this.connectionPool.getMaxConnections();

    if (currentSize >= maxConnections) {
      logger.warn('Connection rejected - capacity reached', {
        clientId,
        current: currentSize,
        max: maxConnections
      });
      this.sendError(ws, 'Server at capacity. Please try again later.');
      ws.close(1008, 'Server at capacity');
      return;
    }

    // 용량 경고 (90% 이상)
    if (currentSize >= maxConnections * 0.9) {
      logger.warn('Connection pool near capacity', {
        current: currentSize,
        max: maxConnections,
        percentage: Math.round((currentSize / maxConnections) * 100)
      });
    }

    // Telnet 클라이언트 생성 및 연결
    const telnetClient = new TelnetClient(this.telnetHost, this.telnetPort);

    try {
      await telnetClient.connect();
    } catch (error) {
      logger.error('Failed to connect to telnet server', {
        clientId,
        error: error instanceof Error ? error.message : String(error)
      });
      this.sendError(ws, 'Failed to connect to game server');
      ws.close(1011, 'Telnet connection failed');
      return;
    }

    // 연결 객체 생성
    const connection: ClientConnection = {
      id: clientId,
      ws,
      telnet: telnetClient,
      framer: new LineFramer(),
      createdAt: new Date()
    };

    // 연결 풀에 추가
    if (!this.connectionPool.add(connection)) {
      logger.error('Failed to add connection to pool', { clientId });
      telnetClient.disconnect();
      this.sendError(ws, 'Failed to establish connection');
      ws.close(1011, 'Connection pool error');
      return;
    }

    // Telnet → WebSocket 데이터 전달
    telnetClient.onData((data: Buffer) => {
      this.forwardTelnetToWebSocket(clientId, data);
    });

    // Telnet 연결 종료 처리
    telnetClient.onClose(() => {
      logger.info('Telnet connection closed', { clientId });
      this.connectionPool.remove(clientId);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Telnet connection closed');
      }
    });

    // Telnet 오류 처리
    telnetClient.onError((error: Error) => {
      logger.error('Telnet error', { clientId, error: error.message });
      this.sendError(ws, 'Telnet connection error');
    });

    // WebSocket 메시지 처리
    ws.on('message', async (data: Buffer | string) => {
      try {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        await this.handleMessage(clientId, buffer);
      } catch (error) {
        logger.error('Message handling error', {
          clientId,
          error: error instanceof Error ? error.message : String(error)
        });
        this.sendError(ws, 'Failed to process message');
      }
    });

    // WebSocket 연결 종료 처리
    ws.on('close', (code, reason) => {
      logger.info('WebSocket connection closed', {
        clientId,
        code,
        reason: reason.toString()
      });
      this.connectionPool.remove(clientId);
    });

    // WebSocket 오류 처리
    ws.on('error', (error) => {
      logger.error('WebSocket error', { clientId, error: error.message });
      // 오류 발생 시에도 연결 정리
      this.connectionPool.remove(clientId);
    });

    // 연결 성공 통지. 서버 버전은 MUD 서버의 welcome 메시지가 제공한다.
    this.sendMessage(ws, {
      type: 'gateway_connected',
      timestamp: Date.now()
    });
  }

  private async handleMessage(clientId: string, data: Buffer): Promise<void> {
    const connection = this.connectionPool.get(clientId);
    if (!connection) {
      logger.warn('Message received for unknown connection', { clientId });
      return;
    }

    // 게이트웨이는 내용을 해석하지 않는다. 프레임을 라인으로 바꿔 전달만 한다.
    this.forwardWebSocketToTelnet(clientId, data.toString('utf-8'));
  }

  private forwardWebSocketToTelnet(clientId: string, frame: string): void {
    const connection = this.connectionPool.get(clientId);
    if (!connection) {
      logger.warn('Cannot forward - connection not found', { clientId });
      return;
    }

    // 프레임 내용의 개행은 라인 경계를 깨뜨리므로 프로토콜 위반이다.
    // JSON 문자열 값의 개행은 \n 이스케이프로 표현되므로 나타날 이유가 없다.
    if (frame.includes('\n') || frame.includes('\r')) {
      logger.error('Frame contains newline - discarded', {
        clientId,
        length: frame.length
      });
      this.sendError(connection.ws, 'Protocol violation: frame contains newline');
      return;
    }

    connection.telnet.sendLine(frame);
    logger.debug('Frame forwarded to telnet', { clientId, length: frame.length });
  }

  private forwardTelnetToWebSocket(clientId: string, data: Buffer): void {
    const connection = this.connectionPool.get(clientId);
    if (!connection) {
      logger.warn('Cannot forward - connection not found', { clientId });
      return;
    }

    if (connection.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // IAC 협상 바이트는 라인 구조를 갖지 않으므로 프레이머 앞에서 제거한다
    const filtered = this.filterTelnetCommands(data);

    let lines: string[];
    try {
      lines = connection.framer.push(filtered);
    } catch (error) {
      if (error instanceof LineTooLongError) {
        logger.error('Line length limit exceeded', {
          clientId,
          bytes: error.bytes,
          limit: error.limit
        });
        this.sendError(connection.ws, 'Protocol violation: line too long');
        connection.ws.close(1009, 'Line too long');
        this.connectionPool.remove(clientId);
        return;
      }
      throw error;
    }

    // 서버 JSON 라인을 봉투로 감싸지 않고 그대로 텍스트 프레임으로 전달한다
    for (const line of lines) {
      connection.ws.send(line);
    }

    if (lines.length > 0) {
      logger.debug('Lines forwarded to WebSocket', {
        clientId,
        count: lines.length
      });
    }
  }

  private filterTelnetCommands(data: Buffer): Buffer {
    const result: number[] = [];
    let i = 0;

    while (i < data.length) {
      const byte = data[i];

      // IAC (0xFF) 시퀀스 처리
      if (byte === 0xFF && i + 1 < data.length) {
        const command = data[i + 1];

        // IAC IAC (0xFF 0xFF) = 리터럴 0xFF
        if (command === 0xFF) {
          result.push(0xFF);
          i += 2;
          continue;
        }

        // IAC WILL/WONT/DO/DONT (3바이트 시퀀스)
        if (command >= 0xFB && command <= 0xFE && i + 2 < data.length) {
          logger.debug('Telnet negotiation filtered', {
            command: command.toString(16),
            option: data[i + 2].toString(16)
          });
          i += 3;
          continue;
        }

        // IAC SB ... IAC SE (서브협상)
        if (command === 0xFA) {
          let j = i + 2;
          while (j < data.length - 1) {
            if (data[j] === 0xFF && data[j + 1] === 0xF0) {
              i = j + 2;
              break;
            }
            j++;
          }
          if (j >= data.length - 1) {
            i = data.length;
          }
          continue;
        }

        // 기타 2바이트 IAC 명령
        i += 2;
        continue;
      }

      // 일반 데이터
      result.push(byte);
      i++;
    }

    return Buffer.from(result);
  }

  private sendMessage(ws: WebSocket, message: GatewayMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, reason: string): void {
    this.sendMessage(ws, {
      type: 'gateway_error',
      reason,
      timestamp: Date.now()
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      logger.info('Stopping Gateway server');

      this.connectionPool.cleanup();

      // WebSocket 서버 종료
      if (this.wss) {
        this.wss.close();
      }

      // HTTP 서버 종료
      if (this.httpServer) {
        this.httpServer.close(() => {
          logger.info('Gateway server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getConnectionCount(): number {
    return this.connectionPool.getSize();
  }
}

// 서버 시작 함수 (외부에서 호출 가능)
export function startServer(
  port: number = 3000,
  telnetHost: string = 'localhost',
  telnetPort: number = 4000,
  adminRouter?: AdminRouter
): GatewayServer {
  const server = new GatewayServer(port, telnetHost, telnetPort, 200, adminRouter);

  server.start().catch((error) => {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    await server.stop();
    process.exit(0);
  });

  return server;
}
