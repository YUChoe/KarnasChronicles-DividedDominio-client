/**
 * 채널 라우팅 검증
 *
 * `/ws` 는 게임 채널(TCP 4000), `/admin` 은 어드민 채널(TCP 4001)로 중계한다.
 * 그 밖의 경로는 거부한다. 어드민 채널은 IAC 협상을 하지 않으므로 필터를
 * 적용하지 않는다.
 *
 * 계약: docs/protocol/admin.md
 */

import net from 'net';
import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_PATH,
  GAME_PATH,
  GatewayServer,
  _requestPath
} from '../gateway';

const WS_PORT = 3210;
const GAME_PORT = 4210;
const ADMIN_PORT = 4211;

/** 접속한 클라이언트에 지정한 라인을 보내는 최소 TCP 서버 */
function makeUpstream(port: number, greeting: string): net.Server {
  const server = net.createServer((socket) => {
    socket.write(greeting);
  });
  server.listen(port, 'localhost');
  return server;
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

/** 첫 텍스트 프레임을 기다린다 */
function firstFrame(url: string, timeoutMs = 4000): Promise<string> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('프레임 대기 시간 초과'));
    }, timeoutMs);

    ws.on('message', (data) => {
      const text = data.toString();
      // 게이트웨이 자체 통지는 건너뛰고 서버 라인을 기다린다
      if (text.includes('gateway_connected')) {
        return;
      }
      clearTimeout(timer);
      ws.close();
      resolve(text);
    });

    ws.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

describe('채널 라우팅', () => {
  let gateway: GatewayServer;
  let gameUpstream: net.Server;
  let adminUpstream: net.Server;

  beforeEach(async () => {
    gameUpstream = makeUpstream(GAME_PORT, '{"type":"welcome","channel":"game"}\n');
    adminUpstream = makeUpstream(
      ADMIN_PORT,
      '{"type":"welcome","channel":"admin"}\n'
    );

    gateway = new GatewayServer({
      port: WS_PORT,
      telnetHost: 'localhost',
      telnetPort: GAME_PORT,
      adminPort: ADMIN_PORT
    });
    await gateway.start();
  });

  afterEach(async () => {
    await gateway.stop();
    await closeServer(gameUpstream);
    await closeServer(adminUpstream);
  });

  it('경로가 없는 업그레이드를 거부한다', async () => {
    await expect(firstFrame(`ws://localhost:${WS_PORT}`)).rejects.toThrow();
  });

  it('정의되지 않은 경로를 거부한다', async () => {
    await expect(
      firstFrame(`ws://localhost:${WS_PORT}/nope`)
    ).rejects.toThrow();
  });

  it(`${GAME_PATH} 는 게임 포트로 중계한다`, async () => {
    const frame = await firstFrame(`ws://localhost:${WS_PORT}${GAME_PATH}`);

    expect(JSON.parse(frame).channel).toBe('game');
  });

  it(`${ADMIN_PATH} 는 어드민 포트로 중계한다`, async () => {
    const frame = await firstFrame(`ws://localhost:${WS_PORT}${ADMIN_PATH}`);

    expect(JSON.parse(frame).channel).toBe('admin');
  });

  it('쿼리 문자열이 붙어도 경로로 라우팅한다', async () => {
    const frame = await firstFrame(
      `ws://localhost:${WS_PORT}${ADMIN_PATH}?token=x`
    );

    expect(JSON.parse(frame).channel).toBe('admin');
  });
});

describe('경로 추출', () => {
  it('쿼리 문자열을 떼어낸다', () => {
    expect(_requestPath('/admin?token=x')).toBe('/admin');
    expect(_requestPath('/ws')).toBe('/ws');
  });

  it('경로가 없으면 루트로 본다', () => {
    expect(_requestPath(undefined)).toBe('/');
    expect(_requestPath('')).toBe('/');
  });
});
