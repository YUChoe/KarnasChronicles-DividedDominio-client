import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GatewayServer } from '../server/gateway';
import { Server as TelnetServer, Socket } from 'net';
import WebSocket from 'ws';

/**
 * 부하 테스트: 200개 동시 연결 테스트
 * 
 * 요구사항 5.1, 5.2 검증:
 * - 최소 200개의 동시 WebSocket 연결 지원
 * - 100ms 미만의 응답 시간 유지
 * - 메모리 사용량 모니터링
 */

describe('Load Test: 200 Concurrent Connections', () => {
  let gateway: GatewayServer;
  let mockTelnetServer: TelnetServer;
  let telnetClients: Socket[] = [];
  const GATEWAY_PORT = 3003;
  const TELNET_PORT = 4003;
  const MAX_CONNECTIONS = 200;

  beforeAll(async () => {
    // Mock Telnet 서버 생성
    mockTelnetServer = new TelnetServer((socket) => {
      telnetClients.push(socket);
      socket.write('Welcome!\r\n');

      socket.on('data', (data) => {
        // 즉시 에코
        socket.write(data);
      });

      socket.on('close', () => {
        telnetClients = telnetClients.filter(c => c !== socket);
      });

      socket.on('error', () => {
        // 에러 무시
      });
    });

    await new Promise<void>((resolve) => {
      mockTelnetServer.listen(TELNET_PORT, () => {
        console.log(`[Load Test] Mock Telnet Server listening on port ${TELNET_PORT}`);
        resolve();
      });
    });

    // Gateway 서버 시작 (200개 연결 지원)
    gateway = new GatewayServer(GATEWAY_PORT, 'localhost', TELNET_PORT, MAX_CONNECTIONS);
    await gateway.start();
    console.log(`[Load Test] Gateway Server started on port ${GATEWAY_PORT}`);
  });

  afterAll(async () => {
    // 모든 Telnet 클라이언트 연결 종료
    telnetClients.forEach(client => {
      if (!client.destroyed) {
        client.destroy();
      }
    });

    // Gateway 서버 종료
    await gateway.stop();
    console.log('[Load Test] Gateway Server stopped');

    // Mock Telnet 서버 종료
    await new Promise<void>((resolve) => {
      mockTelnetServer.close(() => {
        console.log('[Load Test] Mock Telnet Server stopped');
        resolve();
      });
    });
  });

  it('should handle 200 concurrent connections', async () => {
    const connections: WebSocket[] = [];
    const startTime = Date.now();

    // 200개 연결 생성
    console.log(`[Load Test] Creating ${MAX_CONNECTIONS} connections...`);
    
    for (let i = 0; i < MAX_CONNECTIONS; i++) {
      const ws = await createConnection(GATEWAY_PORT);
      connections.push(ws);
      
      // 진행 상황 출력 (매 50개마다)
      if ((i + 1) % 50 === 0) {
        console.log(`[Load Test] Created ${i + 1}/${MAX_CONNECTIONS} connections`);
      }
    }

    const connectionTime = Date.now() - startTime;
    console.log(`[Load Test] All ${MAX_CONNECTIONS} connections created in ${connectionTime}ms`);

    // 연결 수 확인
    expect(gateway.getConnectionCount()).toBe(MAX_CONNECTIONS);

    // 메모리 사용량 측정
    const memoryUsage = process.memoryUsage();
    console.log('[Load Test] Memory Usage:', {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
    });

    // 모든 연결 종료
    console.log('[Load Test] Closing all connections...');
    connections.forEach(ws => ws.close());

    // 연결이 정리될 때까지 대기
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 모든 연결이 정리되었는지 확인
    expect(gateway.getConnectionCount()).toBe(0);
    console.log('[Load Test] All connections closed successfully');
  }, 120000); // 2분 타임아웃

  it('should maintain response time under 100ms with 200 connections', async () => {
    const connections: WebSocket[] = [];
    const responseTimes: number[] = [];

    // 200개 연결 생성
    console.log('[Load Test] Creating connections for response time test...');
    for (let i = 0; i < MAX_CONNECTIONS; i++) {
      const ws = await createConnection(GATEWAY_PORT);
      connections.push(ws);
    }

    console.log('[Load Test] Testing response times...');

    // 각 연결에서 메시지 전송 및 응답 시간 측정
    const promises = connections.map((ws, index) => {
      return new Promise<number>((resolve) => {
        const startTime = Date.now();
        
        ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            if (message.type === 'data' && message.payload === 'test') {
              const responseTime = Date.now() - startTime;
              resolve(responseTime);
            }
          } catch (error) {
            // JSON 파싱 실패 - 무시
          }
        });

        // 테스트 메시지 전송
        ws.send(JSON.stringify({
          type: 'data',
          payload: 'test',
          timestamp: Date.now()
        }));
      });
    });

    // 모든 응답 대기
    const times = await Promise.all(promises);
    responseTimes.push(...times);

    // 통계 계산
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const maxResponseTime = Math.max(...responseTimes);
    const minResponseTime = Math.min(...responseTimes);

    console.log('[Load Test] Response Time Statistics:', {
      average: `${avgResponseTime.toFixed(2)}ms`,
      min: `${minResponseTime}ms`,
      max: `${maxResponseTime}ms`,
      samples: responseTimes.length
    });

    // 평균 응답 시간이 100ms 미만인지 확인
    expect(avgResponseTime).toBeLessThan(100);

    // 모든 연결 종료
    connections.forEach(ws => ws.close());
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 120000);

  it('should handle sustained load over time', async () => {
    const connections: WebSocket[] = [];
    const TEST_DURATION = 10000; // 10초
    const MESSAGE_INTERVAL = 100; // 100ms마다 메시지 전송

    // 100개 연결 생성 (지속적인 부하 테스트)
    console.log('[Load Test] Creating 100 connections for sustained load test...');
    for (let i = 0; i < 100; i++) {
      const ws = await createConnection(GATEWAY_PORT);
      connections.push(ws);
    }

    console.log('[Load Test] Starting sustained load test for 10 seconds...');
    const startTime = Date.now();
    let messagesSent = 0;
    let messagesReceived = 0;

    // 각 연결에서 메시지 수신 카운트
    connections.forEach(ws => {
      ws.on('message', () => {
        messagesReceived++;
      });
    });

    // 주기적으로 메시지 전송
    const interval = setInterval(() => {
      connections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'data',
            payload: 'ping',
            timestamp: Date.now()
          }));
          messagesSent++;
        }
      });
    }, MESSAGE_INTERVAL);

    // 테스트 기간 대기
    await new Promise(resolve => setTimeout(resolve, TEST_DURATION));
    clearInterval(interval);

    const duration = Date.now() - startTime;
    console.log('[Load Test] Sustained Load Test Results:', {
      duration: `${duration}ms`,
      messagesSent,
      messagesReceived,
      throughput: `${Math.round((messagesSent / duration) * 1000)} messages/sec`
    });

    // 메모리 사용량 확인
    const memoryUsage = process.memoryUsage();
    console.log('[Load Test] Memory Usage After Sustained Load:', {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`
    });

    // 모든 연결 종료
    connections.forEach(ws => ws.close());
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 메시지가 전송되고 수신되었는지 확인
    expect(messagesSent).toBeGreaterThan(0);
    expect(messagesReceived).toBeGreaterThan(0);
  }, 120000);
});

// 헬퍼 함수: WebSocket 연결 생성
function createConnection(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    
    ws.on('open', () => {
      resolve(ws);
    });

    ws.on('error', (error) => {
      reject(error);
    });

    setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        reject(new Error('Connection timeout'));
      }
    }, 5000);
  });
}
