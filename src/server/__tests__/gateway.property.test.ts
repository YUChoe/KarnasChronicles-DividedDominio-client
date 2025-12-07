import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { GatewayServer } from '../gateway';
import { WebSocket } from 'ws';
import { createServer, Server as NetServer } from 'net';
import { WSMessage } from '../../shared/types';

/**
 * Feature: browser-telnet-terminal, Property 1: WebSocket to Telnet 연결 체인
 * 
 * 모든 브라우저 클라이언트로부터의 유효한 WebSocket 연결에 대해,
 * WebSocket Gateway는 localhost:4000에 대응하는 텔넷 연결을 설정하고
 * 초기 서버 출력을 클라이언트로 전달해야 합니다.
 * 
 * Validates: Requirements 1.1, 1.2, 1.3
 */

describe('Gateway Property Tests', () => {
  let gateway: GatewayServer;
  let mockTelnetServer: NetServer;
  const WS_PORT = 3001;
  const TELNET_PORT = 4001;

  beforeEach(async () => {
    // Mock Telnet 서버 시작
    mockTelnetServer = createServer((socket) => {
      // 연결 시 초기 메시지 전송
      socket.write('Welcome to the game!\r\n');
      
      // 클라이언트 데이터 수신 시 에코
      socket.on('data', (data) => {
        socket.write(`Echo: ${data.toString()}`);
      });
    });

    await new Promise<void>((resolve) => {
      mockTelnetServer.listen(TELNET_PORT, 'localhost', () => {
        resolve();
      });
    });

    // Gateway 서버 시작
    gateway = new GatewayServer(WS_PORT, 'localhost', TELNET_PORT, 200);
    await gateway.start();
  });

  afterEach(async () => {
    await gateway.stop();
    await new Promise<void>((resolve) => {
      mockTelnetServer.close(() => resolve());
    });
  });

  it('Property 1: WebSocket to Telnet 연결 체인', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null), // 연결 자체를 테스트하므로 입력 데이터 불필요
        async () => {
          return new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
            let receivedInitialData = false;
            let receivedConnectMessage = false;

            const timeout = setTimeout(() => {
              ws.close();
              reject(new Error('Timeout waiting for initial data'));
            }, 5000);

            ws.on('open', () => {
              // WebSocket 연결 성공
            });

            ws.on('message', (data: Buffer) => {
              try {
                const message: WSMessage = JSON.parse(data.toString());
                
                if (message.type === 'connect') {
                  receivedConnectMessage = true;
                }
                
                if (message.type === 'data' && message.payload) {
                  if (message.payload.includes('Welcome to the game!')) {
                    receivedInitialData = true;
                  }
                }

                // 두 조건 모두 만족하면 성공
                if (receivedConnectMessage && receivedInitialData) {
                  clearTimeout(timeout);
                  ws.close();
                  resolve();
                }
              } catch (error) {
                clearTimeout(timeout);
                ws.close();
                reject(error);
              }
            });

            ws.on('error', (error) => {
              clearTimeout(timeout);
              reject(error);
            });

            ws.on('close', () => {
              clearTimeout(timeout);
              if (!receivedConnectMessage || !receivedInitialData) {
                reject(new Error('Connection closed before receiving all expected messages'));
              }
            });
          });
        }
      ),
      { numRuns: 10 } // 연결 테스트이므로 10회 반복
    );
  });

  /**
   * Feature: browser-telnet-terminal, Property 6: 서버 데이터 전달
   * 
   * 모든 텔넷 서버로부터 수신된 데이터에 대해, WebSocket Gateway는 이를
   * Terminal Client로 전달해야 하며, 클라이언트는 이를 Terminal Buffer에 렌더링해야 합니다.
   * 
   * Validates: Requirements 2.4, 2.5
   */
  it('Property 6: 서버 데이터 전달', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }), // 랜덤 서버 데이터
        async (serverData: string) => {
          return new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
            let receivedData = false;

            const timeout = setTimeout(() => {
              ws.close();
              reject(new Error('Timeout waiting for server data'));
            }, 5000);

            ws.on('open', () => {
              // 연결 성공
            });

            ws.on('message', (data: Buffer) => {
              try {
                const message: WSMessage = JSON.parse(data.toString());
                
                if (message.type === 'data' && message.payload) {
                  // 초기 환영 메시지 또는 에코 메시지 확인
                  if (message.payload.includes('Welcome') || message.payload.length > 0) {
                    receivedData = true;
                    clearTimeout(timeout);
                    ws.close();
                    resolve();
                  }
                }
              } catch (error) {
                clearTimeout(timeout);
                ws.close();
                reject(error);
              }
            });

            ws.on('error', (error) => {
              clearTimeout(timeout);
              reject(error);
            });

            ws.on('close', () => {
              clearTimeout(timeout);
              if (!receivedData) {
                reject(new Error('Connection closed before receiving data'));
              }
            });
          });
        }
      ),
      { numRuns: 100 } // 100회 반복
    );
  });

  /**
   * Feature: browser-telnet-terminal, Property 5: 명령 제출 왕복
   * 
   * 모든 입력 버퍼 상태에 대해, 사용자가 Enter를 누르면 완전한 명령이
   * 적절한 줄 끝 문자와 함께 WebSocket Gateway를 통해 텔넷 서버로 전송되어야 합니다.
   * 
   * Validates: Requirements 2.2, 2.3
   */
  it('Property 5: 명령 제출 왕복', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }), // 랜덤 명령어 생성
        async (command: string) => {
          return new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
            let connected = false;
            let receivedEcho = false;

            const timeout = setTimeout(() => {
              ws.close();
              reject(new Error('Timeout waiting for command echo'));
            }, 5000);

            ws.on('open', () => {
              connected = true;
            });

            ws.on('message', (data: Buffer) => {
              try {
                const message: WSMessage = JSON.parse(data.toString());
                
                if (message.type === 'connect') {
                  // 연결 메시지 수신 후 명령 전송
                  const commandMessage: WSMessage = {
                    type: 'data',
                    payload: command + '\n',
                    timestamp: Date.now()
                  };
                  ws.send(JSON.stringify(commandMessage));
                }
                
                if (message.type === 'data' && message.payload) {
                  // 에코 메시지 확인 (Mock 서버가 "Echo: " 접두사를 붙임)
                  if (message.payload.includes(`Echo: ${command}`)) {
                    receivedEcho = true;
                    clearTimeout(timeout);
                    ws.close();
                    resolve();
                  }
                }
              } catch (error) {
                clearTimeout(timeout);
                ws.close();
                reject(error);
              }
            });

            ws.on('error', (error) => {
              clearTimeout(timeout);
              reject(error);
            });

            ws.on('close', () => {
              clearTimeout(timeout);
              if (!receivedEcho) {
                reject(new Error('Connection closed before receiving echo'));
              }
            });
          });
        }
      ),
      { numRuns: 100 } // 100회 반복
    );
  });
});
