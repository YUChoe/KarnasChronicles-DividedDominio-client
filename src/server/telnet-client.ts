import { Socket } from 'net';
import { logger } from './logger';

export class TelnetClient {
  private socket: Socket | null = null;
  private host: string;
  private port: number;
  private onDataCallback?: (data: Buffer) => void;
  private onCloseCallback?: () => void;
  private onErrorCallback?: (error: Error) => void;
  private isCleanedUp: boolean = false;

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

  /**
   * 라인 하나를 전송한다. 개행을 붙여 라인 경계를 만든다.
   * 내용에 개행이 있으면 경계가 깨지므로 호출자가 미리 검증해야 한다.
   */
  sendLine(line: string): void {
    if (this.socket && !this.socket.destroyed) {
      this.socket.write(line + '\n');
      logger.debug('Line sent to telnet', {
        length: line.length
      });
    } else {
      logger.warn('Attempted to send data to closed telnet connection');
    }
  }

  disconnect(): void {
    if (this.isCleanedUp) {
      return;
    }

    this.isCleanedUp = true;

    if (this.socket) {
      // 모든 이벤트 리스너 제거
      this.socket.removeAllListeners('data');
      this.socket.removeAllListeners('close');
      this.socket.removeAllListeners('error');
      this.socket.removeAllListeners('connect');

      // 소켓 종료
      if (!this.socket.destroyed) {
        this.socket.destroy();
      }
      
      this.socket = null;
      logger.debug('Telnet client disconnected and cleaned up');
    }

    // 콜백 참조 제거 (메모리 누수 방지)
    this.onDataCallback = undefined;
    this.onCloseCallback = undefined;
    this.onErrorCallback = undefined;
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
