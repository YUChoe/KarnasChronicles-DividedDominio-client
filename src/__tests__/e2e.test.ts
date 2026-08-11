import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server as TelnetServer, Socket } from 'net';
import WebSocket from 'ws';
import { GAME_PATH, GatewayServer } from '../server/gateway';

/**
 * E2E: WebSocket → 게이트웨이 → MUD 서버 전체 흐름
 *
 * 게이트웨이는 개행 구분 JSON 라인을 그대로 통과시킨다. 봉투(`{type:'data'}`)는
 * gateway-landing Task 2 에서 제거됐다.
 *
 * 여기서 검증하는 것은 `gateway.property.test.ts` 가 덮지 않는 전체 사슬과
 * 다중 사용자 시나리오다.
 */

const GATEWAY_PORT = 3401;
const UPSTREAM_PORT = 4401;

/** 개행으로 종결된 JSON 라인 */
function line(payload: unknown): string {
  return JSON.stringify(payload) + '\n';
}

describe('E2E: JSON 라인 전체 흐름', () => {
  let gateway: GatewayServer;
  let upstream: TelnetServer;
  let sockets: Socket[] = [];

  beforeAll(async () => {
    // 받은 라인을 그대로 되돌려 보내는 최소 상위 서버
    upstream = new TelnetServer((socket) => {
      sockets.push(socket);
      socket.write(line({ type: 'welcome', protocol_version: 1, channel: 'game' }));

      let buffer = '';
      socket.on('data', (data) => {
        buffer += data.toString('utf-8');

        let index = buffer.indexOf('\n');
        while (index !== -1) {
          const received = buffer.slice(0, index);
          buffer = buffer.slice(index + 1);

          try {
            socket.write(line({ type: 'echo', received: JSON.parse(received) }));
          } catch {
            socket.write(line({ type: 'error', reason_code: 'MALFORMED_MESSAGE' }));
          }

          index = buffer.indexOf('\n');
        }
      });
      socket.on('error', () => undefined);
    });

    await new Promise<void>((resolve) => {
      upstream.listen(UPSTREAM_PORT, 'localhost', () => resolve());
    });

    gateway = new GatewayServer({
      port: GATEWAY_PORT,
      telnetHost: 'localhost',
      telnetPort: UPSTREAM_PORT
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

  /** 접속해서 첫 서버 라인까지 받는다 */
  function connect(): Promise<{ ws: WebSocket; frames: string[] }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${GATEWAY_PORT}${GAME_PATH}`);
      const frames: string[] = [];

      const timer = setTimeout(
        () => reject(new Error('welcome 대기 시간 초과')),
        5000
      );

      ws.on('message', (data) => {
        const text = data.toString();
        frames.push(text);

        if (text.includes('"type":"welcome"')) {
          clearTimeout(timer);
          resolve({ ws, frames });
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  /** 다음 프레임 하나를 기다린다 */
  function nextFrame(ws: WebSocket, timeoutMs = 5000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('프레임 대기 시간 초과')),
        timeoutMs
      );
      ws.once('message', (data) => {
        clearTimeout(timer);
        resolve(data.toString());
      });
    });
  }

  it('전체 사슬을 통해 welcome 이 도달한다', async () => {
    const { ws, frames } = await connect();

    try {
      const welcome = frames.find((f) => f.includes('"type":"welcome"'));

      expect(welcome).toBeDefined();
      expect(JSON.parse(welcome!).protocol_version).toBe(1);
      // 게이트웨이 자체 통지도 함께 온다
      expect(frames.some((f) => f.includes('gateway_connected'))).toBe(true);
    } finally {
      ws.close();
    }
  });

  it('클라이언트 라인이 상위 서버까지 오간다', async () => {
    const { ws } = await connect();

    try {
      const pending = nextFrame(ws);
      ws.send(JSON.stringify({ type: 'action', verb: 'look', seq: 7 }));

      const reply = JSON.parse(await pending);

      expect(reply.type).toBe('echo');
      expect(reply.received.verb).toBe('look');
      expect(reply.received.seq).toBe(7);
    } finally {
      ws.close();
    }
  });

  it('여러 사용자가 서로 섞이지 않는다', async () => {
    const users = await Promise.all([connect(), connect(), connect()]);

    try {
      const replies = await Promise.all(
        users.map(({ ws }, index) => {
          const pending = nextFrame(ws);
          ws.send(JSON.stringify({ type: 'action', verb: 'look', seq: index }));
          return pending;
        })
      );

      const seqs = replies.map((raw) => JSON.parse(raw).received.seq);

      expect(seqs.sort()).toEqual([0, 1, 2]);
      expect(gateway.getConnectionCount()).toBe(3);
    } finally {
      for (const { ws } of users) {
        ws.close();
      }
    }
  });

  it('개행이 든 프레임을 거부한다', async () => {
    const { ws } = await connect();

    try {
      const pending = nextFrame(ws);
      // 프레임 안의 개행은 라인 경계를 깨뜨리므로 프로토콜 위반이다
      ws.send('{"type":"action"}\n{"type":"action"}');

      const reply = JSON.parse(await pending);

      expect(reply.type).toBe('gateway_error');
    } finally {
      ws.close();
    }
  });

  it('연결을 닫으면 풀에서 사라진다', async () => {
    const { ws } = await connect();
    const before = gateway.getConnectionCount();

    ws.close();

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(gateway.getConnectionCount()).toBe(before - 1);
  });
});
