import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { logger } from './logger';
import { ConnectionPool, ClientConnection } from './connection-pool';
import { TelnetClient } from './telnet-client';
import { WSMessage } from '../shared/types';

export class GatewayServer {
  private wss: WebSocketServer | null = null;
  private connectionPool: ConnectionPool;
  private port: number;
  private telnetHost: string;
  private telnetPort: number;

  constructor(
    port: number = 3000,
    telnetHost: string = 'localhost',
    telnetPort: number = 4000,
    maxConnections: number = 200
  ) {
    this.port = port;
    this.telnetHost = telnetHost;
    this.telnetPort = telnetPort;
    this.connectionPool = new ConnectionPool(maxConnections);
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.port });

      this.wss.on('listening', () => {
        logger.info('WebSocket Gateway started', { 
          port: this.port,
          telnetHost: this.telnetHost,
          telnetPort: this.telnetPort
        });
        resolve();
      });

      this.wss.on('connection', (ws: WebSocket, req) => {
        this.handleConnection(ws, req);
      });

      this.wss.on('error', (error) => {
        logger.error('WebSocket server error', { error: error.message });
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
    ws.on('message', async (data: Buffer) => {
      try {
        await this.handleMessage(clientId, data);
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

    // 연결 성공 메시지 전송
    this.sendMessage(ws, {
      type: 'connect',
      timestamp: Date.now()
    });
  }

  private async handleMessage(clientId: string, data: Buffer): Promise<void> {
    const connection = this.connectionPool.get(clientId);
    if (!connection) {
      logger.warn('Message received for unknown connection', { clientId });
      return;
    }

    let message: WSMessage;
    try {
      message = JSON.parse(data.toString()) as WSMessage;
    } catch (error) {
      logger.error('Invalid message format', { clientId, error });
      this.sendError(connection.ws, 'Invalid message format');
      return;
    }

    logger.debug('Message received', { clientId, type: message.type });

    // 메시지 타입별 처리
    switch (message.type) {
      case 'data':
        if (message.payload !== undefined) {
          this.forwardWebSocketToTelnet(clientId, message.payload);
        }
        break;
      case 'resize':
        if (message.cols !== undefined && message.rows !== undefined) {
          logger.debug('Terminal resize', { 
            clientId, 
            cols: message.cols, 
            rows: message.rows 
          });
        }
        break;
      default:
        logger.warn('Unknown message type', { clientId, type: message.type });
    }
  }

  private forwardWebSocketToTelnet(clientId: string, payload: string): void {
    const connection = this.connectionPool.get(clientId);
    if (!connection) {
      logger.warn('Cannot forward - connection not found', { clientId });
      return;
    }

    connection.telnet.send(payload);
    logger.debug('Data forwarded to telnet', { clientId, length: payload.length });
  }

  private forwardTelnetToWebSocket(clientId: string, data: Buffer): void {
    const connection = this.connectionPool.get(clientId);
    if (!connection) {
      logger.warn('Cannot forward - connection not found', { clientId });
      return;
    }

    if (connection.ws.readyState === WebSocket.OPEN) {
      const message: WSMessage = {
        type: 'data',
        payload: data.toString('utf-8'),
        timestamp: Date.now()
      };
      connection.ws.send(JSON.stringify(message));
      logger.debug('Data forwarded to WebSocket', { 
        clientId, 
        length: data.length 
      });
    }
  }

  private sendMessage(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, errorMessage: string): void {
    const message: WSMessage = {
      type: 'error',
      payload: errorMessage,
      timestamp: Date.now()
    };
    this.sendMessage(ws, message);
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      logger.info('Stopping WebSocket Gateway');
      
      this.connectionPool.cleanup();
      
      if (this.wss) {
        this.wss.close(() => {
          logger.info('WebSocket Gateway stopped');
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

// 서버 시작
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 3000;
  const telnetHost = process.env.TELNET_HOST || 'localhost';
  const telnetPort = process.env.TELNET_PORT ? parseInt(process.env.TELNET_PORT) : 4000;

  const server = new GatewayServer(port, telnetHost, telnetPort);
  
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
}
