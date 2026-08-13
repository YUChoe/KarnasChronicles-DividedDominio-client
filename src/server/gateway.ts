import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { logger } from './logger';
import { ConnectionPool, ClientConnection, Channel } from './connection-pool';
import { TelnetClient } from './telnet-client';
import { GatewayMessage } from '../shared/types';
import { LineFramer, LineTooLongError } from './line-framer';

/** 게임 채널 WebSocket 경로 */
export const GAME_PATH = '/ws';

/** 어드민 채널 WebSocket 경로 */
export const ADMIN_PATH = '/admin';

export interface GatewayOptions {
  port?: number;
  telnetHost?: string;
  telnetPort?: number;
  adminPort?: number;
  maxConnections?: number;
  /** 이 시간 동안 프레임이 오가지 않은 연결을 닫는다 (밀리초). */
  connectionTimeout?: number;
  /**
   * 랜딩 라우터. 없으면 HTTP 요청은 모두 404 다.
   *
   * 게이트웨이는 요청을 넘기기만 하고 랜딩의 사정을 알지 않는다.
   */
  landing?: HttpHandler;
}

/** HTTP 요청을 처리했으면 참을 돌려준다. */
export interface HttpHandler {
  handle(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<boolean>;
}

/** 유휴 연결을 확인하는 주기 (밀리초). */
const IDLE_SWEEP_INTERVAL = 30_000;

export class GatewayServer {
  /** 게임 채널 WebSocket 서버 */
  private gameWss: WebSocketServer | null = null;
  /** 어드민 채널 WebSocket 서버 */
  private adminWss: WebSocketServer | null = null;
  private httpServer: http.Server | null = null;
  private connectionPool: ConnectionPool;
  private port: number;
  private telnetHost: string;
  private telnetPort: number;
  private adminPort: number;
  private connectionTimeout: number;
  private idleSweeper: NodeJS.Timeout | null = null;
  private landing: HttpHandler | null;

  constructor(options: GatewayOptions = {}) {
    this.port = options.port ?? 3000;
    this.telnetHost = options.telnetHost ?? 'localhost';
    this.telnetPort = options.telnetPort ?? 4000;
    this.adminPort = options.adminPort ?? 4001;
    this.connectionTimeout = options.connectionTimeout ?? 300_000;
    this.connectionPool = new ConnectionPool(options.maxConnections ?? 200);
    this.landing = options.landing ?? null;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      // HTTP 요청은 랜딩 라우터가 처리한다. 라우터가 없거나 처리하지 않은
      // 경로는 404 다. 웹 어드민은 MUD 서버의 어드민 채널로 이전했다
      this.httpServer = http.createServer((req, res) => {
        void this.handleHttp(req, res);
      });

      // 채널마다 별도 WebSocket 서버를 둔다. 경로로 라우팅한다
      this.gameWss = new WebSocketServer({ noServer: true });
      this.adminWss = new WebSocketServer({ noServer: true });

      this.gameWss.on('connection', (ws: WebSocket, req) => {
        this.handleConnection(ws, req, 'game');
      });

      this.adminWss.on('connection', (ws: WebSocket, req) => {
        this.handleConnection(ws, req, 'admin');
      });

      for (const wss of [this.gameWss, this.adminWss]) {
        wss.on('error', (error) => {
          logger.error('WebSocket server error', { error: error.message });
        });
      }

      // 업그레이드 경로를 검증한다. 정의되지 않은 경로는 거부한다
      this.httpServer.on('upgrade', (req, socket, head) => {
        const path = _requestPath(req.url);
        const target =
          path === GAME_PATH
            ? this.gameWss
            : path === ADMIN_PATH
              ? this.adminWss
              : null;

        if (target === null) {
          logger.warn('Upgrade rejected - unknown path', { path });
          socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
          socket.destroy();
          return;
        }

        target.handleUpgrade(req, socket, head, (ws) => {
          target.emit('connection', ws, req);
        });
      });

      this.httpServer.on('error', (error) => {
        logger.error('HTTP server error', { error: error.message });
      });

      // 유휴 연결 정리. 계약은 클라이언트가 60초마다 ping 을 보내도록 규정한다
      this.idleSweeper = setInterval(() => {
        this.connectionPool.removeIdle(this.connectionTimeout);
      }, IDLE_SWEEP_INTERVAL);

      this.httpServer.listen(this.port, () => {
        logger.info('Gateway server started', {
          port: this.port,
          telnetHost: this.telnetHost,
          gamePath: GAME_PATH,
          gamePort: this.telnetPort,
          adminPath: ADMIN_PATH,
          adminPort: this.adminPort
        });
        resolve();
      });
    });
  }

  private async handleHttp(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    try {
      if (this.landing !== null && (await this.landing.handle(req, res))) {
        return;
      }
    } catch (error) {
      logger.error('HTTP handling error', {
        url: req.url,
        error: error instanceof Error ? error.message : String(error)
      });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'internal' }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private async handleConnection(
    ws: WebSocket,
    req: any,
    channel: Channel
  ): Promise<void> {
    const clientId = randomUUID();
    const remoteAddress = req.socket.remoteAddress;

    logger.info('New WebSocket connection', { clientId, channel, remoteAddress });

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

    // 채널에 맞는 서버 포트로 연결한다
    const upstreamPort = channel === 'admin' ? this.adminPort : this.telnetPort;
    const telnetClient = new TelnetClient(this.telnetHost, upstreamPort);

    try {
      await telnetClient.connect();
    } catch (error) {
      logger.error('Failed to connect to upstream server', {
        clientId,
        channel,
        port: upstreamPort,
        error: error instanceof Error ? error.message : String(error)
      });
      this.sendError(ws, 'Failed to connect to game server');
      ws.close(1011, 'Upstream connection failed');
      return;
    }

    // 연결 객체 생성
    const connection: ClientConnection = {
      id: clientId,
      ws,
      telnet: telnetClient,
      framer: new LineFramer(),
      channel,
      createdAt: new Date(),
      lastActivity: new Date()
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

    this.connectionPool.touch(clientId);
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

    // IAC 협상 바이트는 라인 구조를 갖지 않으므로 프레이머 앞에서 제거한다.
    // 어드민 채널은 협상을 하지 않으므로 필터를 거치지 않는다
    const framed =
      connection.channel === 'admin' ? data : this.filterTelnetCommands(data);

    let lines: string[];
    try {
      lines = connection.framer.push(framed);
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

    if (lines.length > 0) {
      this.connectionPool.touch(clientId);
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

      if (this.idleSweeper !== null) {
        clearInterval(this.idleSweeper);
        this.idleSweeper = null;
      }

      this.connectionPool.cleanup();

      // WebSocket 서버 종료
      this.gameWss?.close();
      this.adminWss?.close();

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

/**
 * 업그레이드 요청의 경로만 뽑는다.
 *
 * 쿼리 문자열이 붙어 있어도 경로만 비교한다.
 */
export function _requestPath(url: string | undefined): string {
  if (!url) {
    return '/';
  }

  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

// 서버 시작 함수 (외부에서 호출 가능)
export function startServer(options: GatewayOptions = {}): GatewayServer {
  const server = new GatewayServer(options);

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
