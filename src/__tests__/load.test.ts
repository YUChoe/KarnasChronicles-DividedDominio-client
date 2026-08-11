import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server as TelnetServer, Socket } from 'net';
import WebSocket from 'ws';
import { GAME_PATH, GatewayServer } from '../server/gateway';

/**
 * 부하 특성 확인
 *
 * 동시 연결 상한과 응답 시간을 본다. 게이트웨이는 개행 구분 JSON 라인을 그대로
 * 통과시킨다. 봉투는 gateway-landing Task 2 에서 제거됐다.
 */

const GATEWAY_PORT = 3403;
const UPSTREAM_PORT = 4403;
const MAX_CONNECTIONS = 200;

function line(payload: unknown): string {
  return JSON.stringify(payload) + '\n';
}

describe('부하 특성', () => {
  let gateway: GatewayServer;
  let upstream: TelnetServer;
  let sockets: Socket[] = [];

  beforeAll(async () => {
    upstream = new TelnetServer((socket) => {
      sockets.push(socket);
      socket.write(line({ type: 'welcome', protocol_version: 1, channel: 'game' }));

      socket.on('data', () => {
        socket.write(line({ type: 'pong', server_time: Date.now() }));
      });
      socket.on('error', () => undefined);
    });

    await new Promise<void>((resolve) => {
      upstream.listen(UPSTREAM_PORT, 'localhost', () => resolve());
    });

    gateway = new GatewayServer({
      port: GATEWAY_PORT,
      telnetHost: 'localhost',
      telnetPort: UPSTREAM_PORT,
      maxConnections: MAX_CONNECTIONS
    });
    await gateway.start();
  });

  afterAll(async () => {
    await gateway.stop();
    for (const socket of sockets) {
      if (!socket.destroyed) {
        socket.destroy();
      }
    }
    sockets = [];
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  /** 접속해서 welcome 까지 받는다 */
  function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${GATEWAY_PORT}${GAME_PATH}`);
      const timer = setTimeout(
        () => reject(new Error('welcome 대기 시간 초과')),
        10000
      );

      ws.on('message', (data) => {
        if (data.toString().includes('"type":"welcome"')) {
          clearTimeout(timer);
          resolve(ws);
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function closeAll(connections: WebSocket[]): Promise<void> {
    for (const ws of connections) {
      ws.close();
    }
    return new Promise((resolve) => setTimeout(resolve, 800));
  }

  it('동시 연결 100개를 받는다', async () => {
    const count = 100;
    const connections: WebSocket[] = [];

    try {
      for (let i = 0; i < count; i += 20) {
        const batch = await Promise.all(
          Array.from({ length: Math.min(20, count - i) }, () => connect())
        );
        connections.push(...batch);
      }

      expect(connections).toHaveLength(count);
      expect(gateway.getConnectionCount()).toBe(count);
    } finally {
      await closeAll(connections);
    }
  }, 60000);

  it('상한을 넘는 연결을 거부한다', async () => {
    const small = new GatewayServer({
      port: 3404,
      telnetHost: 'localhost',
      telnetPort: UPSTREAM_PORT,
      maxConnections: 3
    });
    await small.start();

    const accepted: WebSocket[] = [];

    try {
      for (let i = 0; i < 3; i++) {
        accepted.push(
          await new Promise<WebSocket>((resolve, reject) => {
            const ws = new WebSocket(`ws://localhost:3404${GAME_PATH}`);
            ws.on('message', (data) => {
              if (data.toString().includes('"type":"welcome"')) {
                resolve(ws);
              }
            });
            ws.on('error', reject);
          })
        );
      }

      const rejected = await new Promise<string>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:3404${GAME_PATH}`);
        const timer = setTimeout(() => reject(new Error('거부 응답 없음')), 5000);
        ws.on('message', (data) => {
          const text = data.toString();
          if (text.includes('gateway_error')) {
            clearTimeout(timer);
            resolve(text);
          }
        });
        ws.on('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });

      expect(JSON.parse(rejected).reason).toContain('capacity');
    } finally {
      for (const ws of accepted) {
        ws.close();
      }
      await small.stop();
    }
  }, 40000);

  it('연결 50개에서 왕복이 200ms 이내다', async () => {
    const count = 50;
    const connections: WebSocket[] = [];

    try {
      for (let i = 0; i < count; i += 10) {
        const batch = await Promise.all(
          Array.from({ length: 10 }, () => connect())
        );
        connections.push(...batch);
      }

      const started = Date.now();

      await Promise.all(
        connections.map(
          (ws) =>
            new Promise<void>((resolve, reject) => {
              const timer = setTimeout(
                () => reject(new Error('pong 대기 시간 초과')),
                10000
              );
              ws.once('message', () => {
                clearTimeout(timer);
                resolve();
              });
              ws.send(JSON.stringify({ type: 'ping', seq: 1 }));
            })
        )
      );

      const elapsed = Date.now() - started;
      const perConnection = elapsed / count;

      console.log(
        `연결 ${count}개 왕복: 총 ${elapsed}ms, 연결당 ${perConnection.toFixed(1)}ms`
      );

      expect(perConnection).toBeLessThan(200);
    } finally {
      await closeAll(connections);
    }
  }, 60000);
});
