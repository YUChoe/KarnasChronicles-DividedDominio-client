import { WebSocket } from 'ws';
import { logger } from './logger.js';
import { TelnetClient } from './telnet-client.js';

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
    if (connection) {
      // 리소스 정리
      try {
        connection.telnet.disconnect();
      } catch (error) {
        logger.error('Error disconnecting telnet', { id, error });
      }
      
      try {
        if (connection.ws.readyState === WebSocket.OPEN) {
          connection.ws.close();
        }
      } catch (error) {
        logger.error('Error closing WebSocket', { id, error });
      }
      
      this.connections.delete(id);
      
      logger.info('Connection removed', { 
        id, 
        remaining: this.connections.size 
      });
    }
  }

  get(id: string): ClientConnection | undefined {
    return this.connections.get(id);
  }

  getSize(): number {
    return this.connections.size;
  }

  cleanup(): void {
    logger.info('Cleaning up all connections', { count: this.connections.size });
    for (const [id] of this.connections) {
      this.remove(id);
    }
  }
}
