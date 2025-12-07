import { Socket } from 'net';
import { logger } from './logger.js';

export class TelnetClient {
  private socket: Socket | null = null;
  private host: string;
  private port: number;
  private onDataCallback?: (data: Buffer) => void;
  private onCloseCallback?: () => void;
  private onErrorCallback?: (error: Error) => void;

  constructor(host: string = 'localhost', port: number = 4000) {
    this.host = host;
    this.port = port;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new Socket();

      this.socket.on('connect', () => {
        logger.info('Telnet connection established', { 
          host: this.host, 
          port: this.port 
        });
        resolve();
      });

      this.socket.on('data', (data: Buffer) => {
        if (this.onDataCallback) {
          this.onDataCallback(data);
        }
      });

      this.socket.on('close', () => {
        logger.info('Telnet connection closed', { 
          host: this.host, 
          port: this.port 
        });
        if (this.onCloseCallback) {
          this.onCloseCallback();
        }
      });

      this.socket.on('error', (error: Error) => {
        logger.error('Telnet connection error', { 
          host: this.host, 
          port: this.port, 
          error: error.message 
        });
        if (this.onErrorCallback) {
          this.onErrorCallback(error);
        }
        reject(error);
      });

      this.socket.connect(this.port, this.host);
    });
  }

  send(data: string): void {
    if (this.socket && !this.socket.destroyed) {
      this.socket.write(data);
      logger.debug('Data sent to telnet', { 
        length: data.length 
      });
    } else {
      logger.warn('Attempted to send data to closed telnet connection');
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      logger.debug('Telnet client disconnected');
    }
  }

  onData(callback: (data: Buffer) => void): void {
    this.onDataCallback = callback;
  }

  onClose(callback: () => void): void {
    this.onCloseCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }
}
