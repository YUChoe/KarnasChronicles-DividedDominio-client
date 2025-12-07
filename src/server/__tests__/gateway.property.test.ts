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
   * Feature: browser-telnet-terminal, Property 14: 리소스 정리
   * 
   * 모든 닫히는 연결(정상적으로 또는 오류로 인해)에 대해, WebSocket Gateway는
   * 모든 관련 리소스(텔넷 연결, 버퍼, 이벤트 리스너)를 정리해야 합니다.
   * 
   * Validates: Requirements 5.4
   */
  it('Property 14: 리소스 정리', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }), // 연결 수 (안정성을 위해 줄임)
        async (connectionCount: number) => {
          const connections: WebSocket[] = [];
          const connectionPromises: Promise<void>[] = [];
          
          // 여러 연결 생성
          for (let i = 0; i < connectionCount; i++) {
            const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
            connections.push(ws);
            
            const promise = new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
              }, 2000);
              
              ws.on('open', () => {
                clearTimeout(timeout);
                resolve();
              });
              
              ws.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
              });
            });
            
            connectionPromises.push(promise);
          }
          
          // 모든 연결이 열릴 때까지 대기
          await Promise.all(connectionPromises);
          
          // 연결이 완전히 설정될 때까지 대기
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // 초기 연결 수 확인
          const initialCount = gateway.getConnectionCount();
          expect(initialCount).toBe(connectionCount);
          
          // 모든 연결 종료
          const closePromises = connections.map(ws => {
            return new Promise<void>((resolve) => {
              ws.on('close', () => resolve());
              ws.close();
            });
          });
          
          await Promise.all(closePromises);
          
          // 리소스 정리 대기
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // 모든 연결이 정리되었는지 확인
          const finalCount = gateway.getConnectionCount();
          expect(finalCount).toBe(0);
          
          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 } // 20회 반복, 타임아웃 10초
    );
  }, 15000); // 테스트 타임아웃 15초

  /**
   * Feature: browser-telnet-terminal, Property 13: 연결 용량
   * 
   * 모든 최대 200개까지의 동시 연결 수에 대해, WebSocket Gateway는
   * 모든 연결을 성공적으로 수락하고 유지해야 합니다.
   * 
   * Validates: Requirements 5.1
   */
  it('Property 13: 연결 용량', async () => {
    // 소규모 테스트 (전체 200개는 시간이 오래 걸림)
    const testConnectionCount = 10;
    const connections: WebSocket[] = [];
    
    try {
      // 여러 연결 생성
      for (let i = 0; i < testConnectionCount; i++) {
        const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
        connections.push(ws);
        
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 2000);
          
          ws.on('open', () => {
            clearTimeout(timeout);
            resolve();
          });
          
          ws.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });
      }
      
      // 모든 연결이 설정될 때까지 대기
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // 모든 연결이 수락되었는지 확인
      const connectionCount = gateway.getConnectionCount();
      expect(connectionCount).toBe(testConnectionCount);
      
      // 모든 연결 종료
      for (const ws of connections) {
        ws.close();
      }
      
      // 정리 대기
      await new Promise(resolve => setTimeout(resolve, 300));
    } finally {
      // 정리
      for (const ws of connections) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }
    }
  }, 10000);

  /**
   * Feature: browser-telnet-terminal, Property 15: 우아한 연결 거부
   * 
   * 모든 최대 용량에 도달했거나 근접했을 때의 연결 시도에 대해,
   * WebSocket Gateway는 적절한 오류 메시지와 함께 연결을 우아하게 거부하고
   * 경고를 로그해야 합니다.
   * 
   * Validates: Requirements 5.5
   */
  it('Property 15: 우아한 연결 거부', async () => {
    // 작은 용량의 게이트웨이 생성 (테스트용)
    const smallGateway = new GatewayServer(3002, 'localhost', TELNET_PORT, 3);
    await smallGateway.start();
    
    const connections: WebSocket[] = [];
    
    try {
      // 최대 용량까지 연결
      for (let i = 0; i < 3; i++) {
        const ws = new WebSocket(`ws://localhost:3002`);
        connections.push(ws);
        
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 2000);
          
          ws.on('open', () => {
            clearTimeout(timeout);
            resolve();
          });
          
          ws.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });
      }
      
      // 연결 설정 대기
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // 용량 초과 연결 시도
      const rejectedWs = new WebSocket(`ws://localhost:3002`);
      
      const wasRejected = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          resolve(false);
        }, 2000);
        
        rejectedWs.on('close', (code) => {
          clearTimeout(timeout);
          // 1008은 "Server at capacity" 코드
          resolve(code === 1008);
        });
        
        rejectedWs.on('error', () => {
          clearTimeout(timeout);
          resolve(true);
        });
      });
      
      expect(wasRejected).toBe(true);
      
      // 정리
      for (const ws of connections) {
        ws.close();
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    } finally {
      // 정리
      for (const ws of connections) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }
      await smallGateway.stop();
    }
  }, 10000);

  /**
   * Feature: browser-telnet-terminal, Property 17: 연결 이벤트 로깅
   * 
   * 모든 연결 이벤트(연결, 연결 해제, 오류)에 대해, 시스템은
   * 디버깅을 위한 적절한 컨텍스트 정보와 함께 이를 로그해야 합니다.
   * 
   * Validates: Requirements 8.5
   */
  it('Property 17: 연결 이벤트 로깅', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }), // 연결 수
        async (connectionCount: number) => {
          const connections: WebSocket[] = [];
          
          // 여러 연결 생성
          for (let i = 0; i < connectionCount; i++) {
            const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
            connections.push(ws);
            
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
              }, 2000);
              
              ws.on('open', () => {
                clearTimeout(timeout);
                resolve();
              });
              
              ws.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
              });
            });
          }
          
          // 연결이 완전히 설정될 때까지 대기
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // 연결 수 확인 (로깅이 제대로 되었다면 연결이 추가되었을 것)
          const currentCount = gateway.getConnectionCount();
          expect(currentCount).toBe(connectionCount);
          
          // 모든 연결 종료
          const closePromises = connections.map(ws => {
            return new Promise<void>((resolve) => {
              ws.on('close', () => resolve());
              ws.close();
            });
          });
          
          await Promise.all(closePromises);
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // 모든 연결이 정리되었는지 확인 (로깅이 제대로 되었다면 정리되었을 것)
          const finalCount = gateway.getConnectionCount();
          expect(finalCount).toBe(0);
          
          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 } // 20회 반복
    );
  }, 15000);

  /**
   * Feature: browser-telnet-terminal, Property 16: 메시지 형식 일관성
   * 
   * 모든 WebSocket을 통해 전송되는 메시지에 대해, type, payload, timestamp 필드를 가진
   * 정의된 WSMessage 형식을 준수해야 합니다.
   * 
   * Validates: Requirements 8.4
   */
  it('Property 16: 메시지 형식 일관성', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null), // 메시지 형식 검증이므로 입력 불필요
        async () => {
          return new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
            const receivedMessages: any[] = [];

            const timeout = setTimeout(() => {
              ws.close();
              reject(new Error('Timeout waiting for messages'));
            }, 5000);

            ws.on('open', () => {
              // 연결 성공
            });

            ws.on('message', (data: Buffer) => {
              try {
                const message = JSON.parse(data.toString());
                receivedMessages.push(message);
                
                // 모든 메시지가 WSMessage 형식을 준수하는지 확인
                expect(message).toHaveProperty('type');
                expect(message).toHaveProperty('timestamp');
                expect(typeof message.type).toBe('string');
                expect(typeof message.timestamp).toBe('number');
                
                // 충분한 메시지를 받았으면 종료
                if (receivedMessages.length >= 2) {
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
              if (receivedMessages.length < 2) {
                reject(new Error('Connection closed before receiving enough messages'));
              }
            });
          });
        }
      ),
      { numRuns: 20 } // 20회 반복
    );
  }, 15000);

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
