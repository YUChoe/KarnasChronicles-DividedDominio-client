import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GatewayServer } from '../server/gateway';
import { Server as TelnetServer, Socket } from 'net';
import WebSocket from 'ws';

/**
 * E2E 테스트: 브라우저 텔넷 터미널 전체 시나리오
 * 
 * 이 테스트는 다음을 검증합니다:
 * - WebSocket Gateway 시작 및 종료
 * - Mock Telnet 서버와의 연결
 * - 전체 데이터 흐름 (클라이언트 → Gateway → Telnet → Gateway → 클라이언트)
 * - 다중 사용자 시나리오
 * - 연결 해제 및 리소스 정리
 */

describe('E2E: Browser Telnet Terminal', () => {
  let gateway: GatewayServer;
  let mockTelnetServer: TelnetServer;
  let telnetClients: Socket[] = [];
  const GATEWAY_PORT = 3001;
  const TELNET_PORT = 4001;

  // Mock Telnet 서버 시작
  beforeAll(async () => {
    // Mock Telnet 서버 생성
    mockTelnetServer = new TelnetServer((socket) => {
      console.log('[Mock Telnet] Client connected');
      telnetClients.push(socket);

      // 초기 환영 메시지 전송
      socket.write('Welcome to the MUD server!\r\n');
      socket.write('Type "help" for commands.\r\n');
      socket.write('> ');

      socket.on('data', (data) => {
        const command = data.toString().trim();
        console.log(`[Mock Telnet] Received command: ${command}`);

        // 명령어 에코
        socket.write(`\r\nYou typed: ${command}\r\n`);

        // 특수 명령어 처리
        if (command === 'help') {
          socket.write('Available commands:\r\n');
          socket.write('  help - Show this help\r\n');
          socket.write('  quit - Disconnect\r\n');
          socket.write('  echo <text> - Echo text back\r\n');
        } else if (command === 'quit') {
          socket.write('Goodbye!\r\n');
          socket.end();
        } else if (command.startsWith('echo ')) {
          const text = command.substring(5);
          socket.write(`Echo: ${text}\r\n`);
        }

        socket.write('> ');
      });

      socket.on('close', () => {
        console.log('[Mock Telnet] Client disconnected');
        telnetClients = telnetClients.filter(c => c !== socket);
      });

      socket.on('error', (error) => {
        console.error('[Mock Telnet] Socket error:', error);
      });
    });

    await new Promise<void>((resolve) => {
      mockTelnetServer.listen(TELNET_PORT, () => {
        console.log(`[Mock Telnet] Server listening on port ${TELNET_PORT}`);
        resolve();
      });
    });

    // Gateway 서버 시작
    gateway = new GatewayServer(GATEWAY_PORT, 'localhost', TELNET_PORT, 200);
    await gateway.start();
    console.log(`[Gateway] Server started on port ${GATEWAY_PORT}`);
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
    console.log('[Gateway] Server stopped');

    // Mock Telnet 서버 종료
    await new Promise<void>((resolve) => {
      mockTelnetServer.close(() => {
        console.log('[Mock Telnet] Server stopped');
        resolve();
      });
    });
  });

  it('should establish complete connection chain (WebSocket → Gateway → Telnet)', async () => {
    const messages: any[] = [];
    const ws = await createWebSocketConnection(GATEWAY_PORT, messages);

    // 메시지 수신 대기
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 연결 메시지 확인
    const connectMessage = messages.find(m => m.type === 'connect');
    expect(connectMessage).toBeDefined();
    expect(connectMessage.type).toBe('connect');

    // 버전 메시지 확인
    const versionMessage = messages.find(m => m.type === 'version');
    expect(versionMessage).toBeDefined();
    expect(versionMessage.type).toBe('version');
    expect(versionMessage.payload).toBeDefined();

    // 초기 환영 메시지 확인
    const welcomeMessage = messages.find(m => m.type === 'data' && m.payload?.includes('Welcome'));
    expect(welcomeMessage).toBeDefined();
    expect(welcomeMessage.payload).toContain('Welcome to the MUD server');

    ws.close();
  }, 10000);

  it('should forward commands from WebSocket to Telnet and receive responses', async () => {
    const messages: any[] = [];
    const ws = await createWebSocketConnection(GATEWAY_PORT, messages);

    // 초기 메시지 대기
    await new Promise(resolve => setTimeout(resolve, 500));

    // 명령어 전송
    ws.send(JSON.stringify({
      type: 'data',
      payload: 'help\r\n',
      timestamp: Date.now()
    }));

    // 응답 대기
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 응답 확인
    const helpResponse = messages.find(m => m.type === 'data' && m.payload?.includes('Available commands'));
    expect(helpResponse).toBeDefined();
    expect(helpResponse.payload).toContain('Available commands');

    ws.close();
  }, 10000);

  it('should handle multiple concurrent users', async () => {
    const messageArrays = [[], [], []] as any[][];
    const connections = await Promise.all([
      createWebSocketConnection(GATEWAY_PORT, messageArrays[0]),
      createWebSocketConnection(GATEWAY_PORT, messageArrays[1]),
      createWebSocketConnection(GATEWAY_PORT, messageArrays[2])
    ]);

    // 초기 메시지 대기
    await new Promise(resolve => setTimeout(resolve, 500));

    // 각 연결이 독립적으로 작동하는지 확인
    for (let i = 0; i < connections.length; i++) {
      const ws = connections[i];
      const messages = messageArrays[i];

      // 각 클라이언트가 고유한 명령어 전송
      ws.send(JSON.stringify({
        type: 'data',
        payload: `echo client-${i}\r\n`,
        timestamp: Date.now()
      }));
    }

    // 응답 대기
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 각 클라이언트의 응답 확인
    for (let i = 0; i < messageArrays.length; i++) {
      const messages = messageArrays[i];
      const echoResponse = messages.find(m => m.type === 'data' && m.payload?.includes(`client-${i}`));
      expect(echoResponse).toBeDefined();
      expect(echoResponse.payload).toContain(`client-${i}`);
    }

    // 모든 연결 종료
    connections.forEach(ws => ws.close());

    // 연결이 정리될 때까지 대기
    await new Promise(resolve => setTimeout(resolve, 200));

    // Gateway 연결 수 확인
    expect(gateway.getConnectionCount()).toBe(0);
  }, 15000);

  it('should handle connection and disconnection lifecycle', async () => {
    const initialCount = gateway.getConnectionCount();

    // 연결 생성
    const messages: any[] = [];
    const ws = await createWebSocketConnection(GATEWAY_PORT, messages);
    
    // 초기 메시지 대기
    await new Promise(resolve => setTimeout(resolve, 500));

    // 연결 수 증가 확인
    expect(gateway.getConnectionCount()).toBe(initialCount + 1);

    // 연결 종료
    ws.close();

    // 연결이 정리될 때까지 대기
    await new Promise(resolve => setTimeout(resolve, 200));

    // 연결 수 감소 확인
    expect(gateway.getConnectionCount()).toBe(initialCount);
  }, 10000);

  it('should handle Telnet server disconnection gracefully', async () => {
    const messages: any[] = [];
    const ws = await createWebSocketConnection(GATEWAY_PORT, messages);

    // 초기 메시지 대기
    await new Promise(resolve => setTimeout(resolve, 500));

    // quit 명령어로 Telnet 연결 종료
    ws.send(JSON.stringify({
      type: 'data',
      payload: 'quit\r\n',
      timestamp: Date.now()
    }));

    // Goodbye 메시지 대기
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Goodbye 메시지 확인
    const goodbyeMessage = messages.find(m => m.type === 'data' && m.payload?.includes('Goodbye'));
    expect(goodbyeMessage).toBeDefined();
    expect(goodbyeMessage.payload).toContain('Goodbye');

    // WebSocket도 자동으로 닫힐 때까지 대기
    await new Promise<void>((resolve) => {
      ws.on('close', () => resolve());
      setTimeout(resolve, 2000); // 타임아웃
    });

    expect(ws.readyState).toBe(WebSocket.CLOSED);
  }, 10000);

  it('should reject connections when capacity is reached', async () => {
    // 작은 용량의 Gateway 생성
    const smallGateway = new GatewayServer(3002, 'localhost', TELNET_PORT, 2);
    await smallGateway.start();

    try {
      // 최대 용량만큼 연결
      const messages1: any[] = [];
      const messages2: any[] = [];
      const conn1 = await createWebSocketConnection(3002, messages1);
      const conn2 = await createWebSocketConnection(3002, messages2);

      // 초기 메시지 대기
      await new Promise(resolve => setTimeout(resolve, 500));

      // 추가 연결 시도 (거부되어야 함)
      const messages3: any[] = [];
      const conn3 = await createWebSocketConnection(3002, messages3);
      
      // 연결이 닫혔는지 확인 (용량 초과로 인해)
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(conn3.readyState).toBe(WebSocket.CLOSED);

      conn1.close();
      conn2.close();
    } finally {
      await smallGateway.stop();
    }
  }, 15000);
});

// 헬퍼 함수: WebSocket 연결 생성
function createWebSocketConnection(port: number, messages?: any[]): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    
    // 메시지 수집
    if (messages) {
      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          messages.push(message);
        } catch (error) {
          // JSON 파싱 실패 - 무시
        }
      });
    }
    
    ws.on('open', () => {
      console.log(`[Test] WebSocket connected to port ${port}`);
      resolve(ws);
    });

    ws.on('error', (error) => {
      console.error(`[Test] WebSocket connection error:`, error);
      reject(new Error('WebSocket connection failed'));
    });

    // 타임아웃 설정
    setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }
    }, 5000);
  });
}


