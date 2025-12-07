import { WebSocket } from 'ws';
import { logger } from './logger';
import { TelnetClient } from './telnet-client';

export interface ClientConnection {
  id: string;
  ws: WebSocket;
  telnet: TelnetClient;
  createdAt: Date;
}

export class ConnectionPool {
  private connections: Map<string, ClientConnection>;
  private maxConnections: number;

  constructor(maxConnections: number = 200) {
    this.connections = new Map();
    this.maxConnections = maxConnections;
  }

  add(connection: ClientConnection): boolean {
    if (this.connections.size >= this.maxConnections) {
      logger.warn('Connection limit reached', { 
        current: this.connections.size, 
        max: this.maxConnections 
      });
      return false;
    }

    this.connections.set(connection.id, connection);
    logger.info('Connection added', { 
      id: connection.id, 
      total: this.connections.size 
    });
    return true;
  }

  remove(id: string): void {
    const connection = this.connections.get(id);
    if (!connection) {
      return;
    }

    logger.debug('Removing connection', { id });

    // Telnet 연결 정리
    try {
      connection.telnet.disconnect();
    } catch (error) {
      logger.error('Error disconnecting telnet', { 
        id, 
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    // WebSocket 연결 정리
    try {
      // 모든 이벤트 리스너 제거
      connection.ws.removeAllListeners('message');
      connection.ws.removeAllListeners('close');
      connection.ws.removeAllListeners('error');
      connection.ws.removeAllListeners('ping');
      connection.ws.removeAllListeners('pong');

      // WebSocket 종료
      if (connection.ws.readyState === WebSocket.OPEN || 
          connection.ws.readyState === WebSocket.CONNECTING) {
        connection.ws.close(1000, 'Connection closed');
      }
    } catch (error) {
      logger.error('Error closing WebSocket', { 
        id, 
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    // Map에서 제거
    this.connections.delete(id);
    
    logger.info('Connection removed and cleaned up', { 
      id, 
      remaining: this.connections.size 
    });
  }

  get(id: string): ClientConnection | undefined {
    return this.connections.get(id);
  }

  getSize(): number {
    return this.connections.size;
  }

  getMaxConnections(): number {
    return this.maxConnections;
  }

  cleanup(): void {
    const count = this.connections.size;
    logger.info('Cleaning up all connections', { count });
    
    // 모든 연결 ID를 배열로 복사 (순회 중 수정 방지)
    const connectionIds = Array.from(this.connections.keys());
    
    for (const id of connectionIds) {
      this.remove(id);
    }
    
    // 최종 확인
    if (this.connections.size > 0) {
      logger.warn('Some connections were not cleaned up', { 
        remaining: this.connections.size 
      });
      this.connections.clear();
    }
    
    logger.info('All connections cleaned up');
  }
}
