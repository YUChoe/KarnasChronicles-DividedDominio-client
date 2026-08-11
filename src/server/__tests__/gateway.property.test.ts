import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { GatewayServer } from '../gateway';
import { WebSocket } from 'ws';
import { createServer, Server as NetServer } from 'net';

/**
 * 게이트웨이 통합 속성 테스트.
 *
 * 페이즈2에서 게이트웨이는 텍스트를 중계하지 않고 JSON 라인을 WebSocket
 * 프레임으로 변환한다. 서버 라인은 봉투 없이 그대로 통과하며, 게이트웨이가
 * 자체 생성하는 제어 메시지만 `gateway_` 접두어 타입을 갖는다.
 *
 * Validates: gateway-landing Requirements 3.1~3.10, 4.7
 */

/** 모의 MUD 서버가 접속 즉시 보내는 환영 라인 */
const WELCOME_LINE = JSON.stringify({
  type: 'welcome',
  protocol_version: 1,
  server_version: 'test@mock'
});

/** 개행을 포함하지 않는 임의 텍스트. 프레임 내용으로 쓸 수 있다. */
const frameTextArbitrary = fc
  .fullUnicodeString({ minLength: 1, maxLength: 60 })
  .filter((s) => !s.includes('\n') && !s.includes('\r'));

/** 게이트웨이가 스스로 만든 제어 메시지인지 판별한다 */
function isGatewayControl(json: unknown): boolean {
  return (
    typeof json === 'object' &&
    json !== null &&
    typeof (json as { type?: unknown }).type === 'string' &&
    (json as { type: string }).type.startsWith('gateway_')
  );
}

describe('Gateway Property Tests', () => {
  let gateway: GatewayServer;
  let mockTelnetServer: NetServer;
  const WS_PORT = 3001;
  const TELNET_PORT = 4001;

  beforeEach(async () => {
    mockTelnetServer = createServer((socket) => {
      // CRLF로 종결해 보낸다. 게이트웨이가 CR을 제거해야 한다.
      socket.write(WELCOME_LINE + '\r\n');

      socket.on('data', (data) => {
        // 게이트웨이가 개행으로 종결한 프레임이 도착한다. 테스트 프레임은
        // 작아서 한 번의 write가 통째로 도착하므로 단순 분할로 충분하다.
        for (const line of data.toString('utf-8').split('\n')) {
          if (line.length === 0) {
            continue;
          }

          let request: { type?: string; count?: number };
          try {
            request = JSON.parse(line);
          } catch {
            continue;
          }

          // 여러 JSON 라인을 한 번의 write로 보내 청크 뭉침을 재현한다
          if (request.type === 'burst' && typeof request.count === 'number') {
            let payload = '';
            for (let i = 0; i < request.count; i++) {
              payload += JSON.stringify({ type: 'burst_item', index: i }) + '\n';
            }
            socket.write(payload);
            continue;
          }

          socket.write(JSON.stringify({ type: 'echo', command: line }) + '\n');
        }
      });
    });

    await new Promise<void>((resolve) => {
      mockTelnetServer.listen(TELNET_PORT, 'localhost', () => {
        resolve();
      });
    });

    gateway = new GatewayServer({ port: WS_PORT, telnetHost: 'localhost', telnetPort: TELNET_PORT, maxConnections: 200 });
    await gateway.start();
  });

  afterEach(async () => {
    await gateway.stop();
    await new Promise<void>((resolve) => {
      mockTelnetServer.close(() => resolve());
    });
  });

  /**
   * Property 1: WebSocket to MUD 서버 연결 체인
   *
   * 유효한 WebSocket 연결에 대해 게이트웨이는 MUD 서버에 대응하는 TCP 연결을
   * 설정하고, gateway_connected 통지와 서버의 첫 JSON 라인을 전달해야 한다.
   *
   * Validates: Requirements 3.1, 3.6
   */
  it('Property 1: WebSocket to Telnet 연결 체인', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        return new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(`ws://localhost:${WS_PORT}/ws`);
          let receivedWelcome = false;
          let receivedConnectMessage = false;

          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Timeout waiting for initial data'));
          }, 5000);

          ws.on('message', (data: Buffer) => {
            try {
              const raw = data.toString('utf-8');
              const message = JSON.parse(raw);

              if (message.type === 'gateway_connected') {
                receivedConnectMessage = true;
              }

              // 서버 라인은 봉투 없이, CR이 제거된 상태로 그대로 도착한다
              if (message.type === 'welcome') {
                expect(raw).toBe(WELCOME_LINE);
                receivedWelcome = true;
              }

              if (receivedConnectMessage && receivedWelcome) {
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
            if (!receivedConnectMessage || !receivedWelcome) {
              reject(
                new Error('Connection closed before receiving all expected messages')
              );
            }
          });
        });
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6: 서버 데이터 전달
   *
   * 하나의 TCP 청크에 여러 JSON 라인이 담겨 도착하면 게이트웨이는 각 라인을
   * 개별 WebSocket 프레임으로 전달해야 한다.
   *
   * Validates: Requirements 3.1, 3.4
   */
  it('Property 6: 서버 데이터 전달', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 20 }), async (count: number) => {
        return new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(`ws://localhost:${WS_PORT}/ws`);
          const items: number[] = [];

          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Timeout waiting for server data'));
          }, 5000);

          ws.on('message', (data: Buffer) => {
            try {
              const message = JSON.parse(data.toString('utf-8'));

              if (message.type === 'gateway_connected') {
                ws.send(JSON.stringify({ type: 'burst', count }));
              }

              if (message.type === 'burst_item') {
                items.push(message.index);

                if (items.length === count) {
                  // 라인 수와 순서가 보존되어야 한다
                  expect(items).toEqual(
                    Array.from({ length: count }, (_, i) => i)
                  );
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
            if (items.length !== count) {
              reject(new Error('Connection closed before receiving all lines'));
            }
          });
        });
      }),
      { numRuns: 30 }
    );
  });

  /**
   * Property 14: 리소스 정리
   *
   * 닫히는 모든 연결에 대해 게이트웨이는 관련 리소스를 정리해야 한다.
   *
   * Validates: Requirements 4.4
   */
  it('Property 14: 리소스 정리', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }),
        async (connectionCount: number) => {
          const connections: WebSocket[] = [];
          const connectionPromises: Promise<void>[] = [];

          for (let i = 0; i < connectionCount; i++) {
            const ws = new WebSocket(`ws://localhost:${WS_PORT}/ws`);
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

          await Promise.all(connectionPromises);
          await new Promise((resolve) => setTimeout(resolve, 300));

          const initialCount = gateway.getConnectionCount();
          expect(initialCount).toBe(connectionCount);

          const closePromises = connections.map((ws) => {
            return new Promise<void>((resolve) => {
              ws.on('close', () => resolve());
              ws.close();
            });
          });

          await Promise.all(closePromises);
          await new Promise((resolve) => setTimeout(resolve, 300));

          const finalCount = gateway.getConnectionCount();
          expect(finalCount).toBe(0);

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  }, 15000);

  /**
   * Property 13: 연결 용량
   *
   * 상한 이내의 동시 연결은 모두 수락되고 유지되어야 한다.
   *
   * Validates: Requirements 4.4
   */
  it('Property 13: 연결 용량', async () => {
    const testConnectionCount = 10;
    const connections: WebSocket[] = [];

    try {
      for (let i = 0; i < testConnectionCount; i++) {
        const ws = new WebSocket(`ws://localhost:${WS_PORT}/ws`);
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

      await new Promise((resolve) => setTimeout(resolve, 300));

      const connectionCount = gateway.getConnectionCount();
      expect(connectionCount).toBe(testConnectionCount);

      for (const ws of connections) {
        ws.close();
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    } finally {
      for (const ws of connections) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }
    }
  }, 10000);

  /**
   * Property 15: 우아한 연결 거부
   *
   * 용량에 도달한 상태의 연결 시도는 오류 통지와 함께 거부되어야 한다.
   *
   * Validates: Requirements 4.4
   */
  it('Property 15: 우아한 연결 거부', async () => {
    const smallGateway = new GatewayServer({ port: 3002, telnetHost: 'localhost', telnetPort: TELNET_PORT, maxConnections: 3 });
    await smallGateway.start();

    const connections: WebSocket[] = [];

    try {
      for (let i = 0; i < 3; i++) {
        const ws = new WebSocket(`ws://localhost:3002/ws`);
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

      await new Promise((resolve) => setTimeout(resolve, 300));

      const rejectedWs = new WebSocket(`ws://localhost:3002/ws`);
      let rejectionReason: string | undefined;

      const wasRejected = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          resolve(false);
        }, 2000);

        rejectedWs.on('message', (data: Buffer) => {
          const message = JSON.parse(data.toString('utf-8'));
          if (message.type === 'gateway_error') {
            rejectionReason = message.reason;
          }
        });

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
      // 거부 통지는 게이트웨이 제어 메시지여야 한다
      if (rejectionReason !== undefined) {
        expect(rejectionReason).toContain('capacity');
      }

      for (const ws of connections) {
        ws.close();
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    } finally {
      for (const ws of connections) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }
      await smallGateway.stop();
    }
  }, 10000);

  /**
   * Property 17: 연결 이벤트 로깅
   *
   * 연결과 해제가 연결 풀 상태에 정확히 반영되어야 한다.
   *
   * Validates: Requirements 4.4
   */
  it('Property 17: 연결 이벤트 로깅', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }),
        async (connectionCount: number) => {
          const connections: WebSocket[] = [];

          for (let i = 0; i < connectionCount; i++) {
            const ws = new WebSocket(`ws://localhost:${WS_PORT}/ws`);
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

          await new Promise((resolve) => setTimeout(resolve, 300));

          const currentCount = gateway.getConnectionCount();
          expect(currentCount).toBe(connectionCount);

          const closePromises = connections.map((ws) => {
            return new Promise<void>((resolve) => {
              ws.on('close', () => resolve());
              ws.close();
            });
          });

          await Promise.all(closePromises);
          await new Promise((resolve) => setTimeout(resolve, 300));

          const finalCount = gateway.getConnectionCount();
          expect(finalCount).toBe(0);

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  }, 15000);

  /**
   * Property 16: 프레임 형식 일관성
   *
   * 게이트웨이 제어 메시지는 `gateway_` 접두어 타입과 timestamp를 갖는다.
   * 서버 라인은 어떤 필드도 추가되지 않은 상태로 통과한다.
   *
   * Validates: Requirements 3.7, 3.10, 4.7
   */
  it('Property 16: 메시지 형식 일관성', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        return new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(`ws://localhost:${WS_PORT}/ws`);
          const receivedMessages: unknown[] = [];

          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Timeout waiting for messages'));
          }, 5000);

          ws.on('message', (data: Buffer, isBinary: boolean) => {
            try {
              // 텍스트 프레임만 사용한다
              expect(isBinary).toBe(false);

              const raw = data.toString('utf-8');
              const message = JSON.parse(raw);
              receivedMessages.push(message);

              expect(message).toHaveProperty('type');
              expect(typeof message.type).toBe('string');

              if (isGatewayControl(message)) {
                expect(typeof message.timestamp).toBe('number');
              } else {
                // 서버 라인은 변형 없이 통과해야 한다
                expect(raw).toBe(WELCOME_LINE);
                expect(message).not.toHaveProperty('timestamp');
                expect(message).not.toHaveProperty('payload');
              }

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
              reject(
                new Error('Connection closed before receiving enough messages')
              );
            }
          });
        });
      }),
      { numRuns: 20 }
    );
  }, 15000);

  /**
   * Property 5: 프레임 왕복
   *
   * 클라이언트가 보낸 JSON 라인은 개행으로 종결되어 MUD 서버에 도달하고,
   * 내용은 변형되지 않아야 한다.
   *
   * Validates: Requirements 3.5, 3.10
   */
  it('Property 5: 명령 제출 왕복', async () => {
    await fc.assert(
      fc.asyncProperty(frameTextArbitrary, async (text: string) => {
        const sentFrame = JSON.stringify({ type: 'chat', text });

        return new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(`ws://localhost:${WS_PORT}/ws`);
          let receivedEcho = false;

          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Timeout waiting for command echo'));
          }, 5000);

          ws.on('message', (data: Buffer) => {
            try {
              const message = JSON.parse(data.toString('utf-8'));

              if (message.type === 'gateway_connected') {
                ws.send(sentFrame);
              }

              if (message.type === 'echo') {
                // 서버가 라인으로 받은 내용이 보낸 프레임과 정확히 일치해야 한다
                expect(message.command).toBe(sentFrame);
                expect(JSON.parse(message.command).text).toBe(text);
                receivedEcho = true;
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
            if (!receivedEcho) {
              reject(new Error('Connection closed before receiving echo'));
            }
          });
        });
      }),
      { numRuns: 50 }
    );
  });

  /**
   * 개행을 포함한 프레임은 라인 경계를 깨뜨리므로 버려야 한다.
   *
   * Validates: Requirements 3.6
   */
  it('개행이 포함된 프레임을 버리고 오류를 통지한다', async () => {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${WS_PORT}/ws`);
      let echoed = false;

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Timeout waiting for gateway_error'));
      }, 5000);

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString('utf-8'));

          if (message.type === 'gateway_connected') {
            ws.send('{"type":"chat","text":"a"}\n{"type":"chat","text":"b"}');
          }

          if (message.type === 'echo') {
            echoed = true;
          }

          if (message.type === 'gateway_error') {
            expect(message.reason).toContain('newline');
            expect(echoed).toBe(false);
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
    });
  });
});
