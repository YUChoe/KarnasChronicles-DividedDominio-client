import { WebSocket } from 'ws';
import { logger } from './logger';
import { TelnetClient } from './telnet-client';
import { LineFramer } from './line-framer';

/**
 * 연결이 붙은 채널.
 *
 * 게임은 TCP 4000, 어드민은 TCP 4001 로 중계한다. 어드민 채널은 IAC 협상을
 * 하지 않으므로 필터를 적용하지 않는다.
 */
export type Channel = 'game' | 'admin';

export interface ClientConnection {
  id: string;
  ws: WebSocket;
  telnet: TelnetClient;
  /** TCP 청크를 라인으로 복원한다. 연결마다 하나씩 보유한다. */
  framer: LineFramer;
  channel: Channel;
  createdAt: Date;
  /** 마지막으로 프레임이 오간 시각. 유휴 정리 판정에 쓴다. */
  lastActivity: Date;
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

  /** 프레임이 오갔음을 기록한다. */
  touch(id: string): void {
    const connection = this.connections.get(id);

    if (connection) {
      connection.lastActivity = new Date();
    }
  }

  /**
   * 지정한 시간 동안 프레임이 오가지 않은 연결을 닫는다.
   *
   * 계약은 클라이언트가 60초마다 ping 을 보내도록 규정한다. 그보다 오래 조용한
   * 연결은 살아 있지 않다고 본다.
   *
   * @returns 닫은 연결 수
   */
  removeIdle(idleMs: number): number {
    const deadline = Date.now() - idleMs;
    const stale = Array.from(this.connections.values()).filter(
      (connection) => connection.lastActivity.getTime() < deadline
    );

    for (const connection of stale) {
      logger.info('Closing idle connection', {
        clientId: connection.id,
        channel: connection.channel,
        idleMs: Date.now() - connection.lastActivity.getTime()
      });
      this.remove(connection.id);
    }

    return stale.length;
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
