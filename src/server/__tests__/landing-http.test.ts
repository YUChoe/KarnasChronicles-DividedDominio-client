/**
 * 랜딩 사이트의 HTTP 경로 검증
 *
 * `/api/register` 의 응답 매핑, 정적 서빙 여부, 계정 생성 클라이언트의 왕복을
 * 확인한다. 포트는 커널이 고르게 한다. 고정 포트는 앞 테스트의 소켓과 부딪친다.
 *
 * 계정 생성 결과는 대역으로 바꿔 응답만 검사한다. 실제 계정 생성은 서버 저장소의
 * 어드민 채널 테스트가 다룬다.
 */

import http from 'http';
import net from 'net';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccountClient, AccountOutcome } from '../landing/account-client';
import { LandingRouter, MAX_BODY_BYTES } from '../landing/router';
import { RateLimiter } from '../landing/rate-limit';

const STATIC_ROOT = path.resolve('src/server/public');

function boundPort(server: http.Server): number {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('server is not bound to a port');
  }
  return address.port;
}

/** 정해진 결과만 돌려주는 계정 생성 대역 */
function stubAccountClient(outcome: AccountOutcome, seen: string[] = []) {
  return {
    createAccount: async (request: { username: string }) => {
      seen.push(request.username);
      return outcome;
    }
  } as unknown as AccountClient;
}

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    username: 'newplayer',
    password: 'longenough',
    passwordConfirm: 'longenough',
    ...overrides
  };
}

describe('회원가입 엔드포인트', () => {
  let server: http.Server | null = null;

  function listen(router: LandingRouter): Promise<void> {
    server = http.createServer((req, res) => {
      void router.handle(req, res).then((handled) => {
        if (!handled) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });
    });

    return new Promise((resolve) => {
      server?.listen(0, '127.0.0.1', () => resolve());
    });
  }

  async function post(body: unknown, raw?: string): Promise<Response> {
    return fetch(`http://127.0.0.1:${boundPort(server!)}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw ?? JSON.stringify(body)
    });
  }

  beforeEach(() => {
    server = null;
  });

  afterEach(async () => {
    const current = server;
    server = null;
    if (current !== null) {
      await new Promise<void>((resolve) => current.close(() => resolve()));
    }
  });

  it('계정을 만들면 201 을 준다', async () => {
    const seen: string[] = [];
    await listen(
      new LandingRouter({
        accountClient: stubAccountClient({ ok: true, playerId: 'abc' }, seen)
      })
    );

    const response = await post(validInput());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, username: 'newplayer' });
    expect(seen).toEqual(['newplayer']);
  });

  it('중복 사용자명을 409 로 옮긴다', async () => {
    await listen(
      new LandingRouter({
        accountClient: stubAccountClient({
          ok: false,
          reasonCode: 'USERNAME_TAKEN'
        })
      })
    );

    const response = await post(validInput());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: 'username_taken' });
  });

  it('상위 서버에 닿지 못하면 502 를 준다', async () => {
    await listen(
      new LandingRouter({
        accountClient: stubAccountClient({
          ok: false,
          reasonCode: 'UPSTREAM_UNAVAILABLE',
          detail: 'timed out'
        })
      })
    );

    expect((await post(validInput())).status).toBe(502);
  });

  it('검증 실패는 어느 항목인지 알려준다', async () => {
    await listen(
      new LandingRouter({
        accountClient: stubAccountClient({ ok: true, playerId: 'abc' })
      })
    );

    const response = await post(validInput({ username: 'ab' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'validation',
      field: 'username',
      rule: 'length'
    });
  });

  it('상위 서버에 보내기 전에 걸러낸다', async () => {
    const seen: string[] = [];
    await listen(
      new LandingRouter({
        accountClient: stubAccountClient({ ok: true, playerId: 'abc' }, seen)
      })
    );

    await post(validInput({ passwordConfirm: 'different1' }));
    expect(seen).toEqual([]);
  });

  it('JSON 이 아닌 본문을 400 으로 거절한다', async () => {
    await listen(
      new LandingRouter({
        accountClient: stubAccountClient({ ok: true, playerId: 'abc' })
      })
    );

    const response = await post(null, 'not json');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'bad_request' });
  });

  it('본문 상한을 넘으면 413 을 준다', async () => {
    await listen(
      new LandingRouter({
        accountClient: stubAccountClient({ ok: true, playerId: 'abc' })
      })
    );

    const oversized = JSON.stringify({
      username: 'newplayer',
      password: 'x'.repeat(MAX_BODY_BYTES)
    });
    const response = await post(null, oversized);
    expect(response.status).toBe(413);
  });

  it('상한을 넘긴 요청을 429 로 거절한다', async () => {
    await listen(
      new LandingRouter({
        accountClient: stubAccountClient({ ok: true, playerId: 'abc' }),
        rateLimiter: new RateLimiter({ limit: 1, windowMs: 60_000 })
      })
    );

    expect((await post(validInput())).status).toBe(201);
    const second = await post(validInput());
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({ ok: false, error: 'rate_limited' });
  });

  it('토큰이 없는 배포는 503 을 준다', async () => {
    await listen(new LandingRouter());

    const response = await post(validInput());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'registration_disabled'
    });
  });

  it('POST 가 아닌 요청을 405 로 거절한다', async () => {
    await listen(
      new LandingRouter({
        accountClient: stubAccountClient({ ok: true, playerId: 'abc' })
      })
    );

    const response = await fetch(
      `http://127.0.0.1:${boundPort(server!)}/api/register`
    );
    expect(response.status).toBe(405);
  });
});

describe('정적 서빙', () => {
  let server: http.Server | null = null;

  function listen(router: LandingRouter): Promise<void> {
    server = http.createServer((req, res) => {
      void router.handle(req, res).then((handled) => {
        if (!handled) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });
    });

    return new Promise((resolve) => {
      server?.listen(0, '127.0.0.1', () => resolve());
    });
  }

  afterEach(async () => {
    const current = server;
    server = null;
    if (current !== null) {
      await new Promise<void>((resolve) => current.close(() => resolve()));
    }
  });

  it('꺼져 있으면 정적 파일을 주지 않는다', async () => {
    // 프로덕션에서는 nginx 가 서빙한다. 두 곳이 동시에 서빙하지 않게 한다
    await listen(new LandingRouter({ staticRoot: STATIC_ROOT }));

    const response = await fetch(`http://127.0.0.1:${boundPort(server!)}/index.html`);
    expect(response.status).toBe(404);
  });

  it('켜면 index.html 을 준다', async () => {
    await listen(
      new LandingRouter({ staticRoot: STATIC_ROOT, serveStatic: true })
    );

    const response = await fetch(`http://127.0.0.1:${boundPort(server!)}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('data-i18n');
  });

  it('경로 순회 요청을 404 로 막는다', async () => {
    await listen(
      new LandingRouter({ staticRoot: STATIC_ROOT, serveStatic: true })
    );

    const response = await fetch(
      `http://127.0.0.1:${boundPort(server!)}/../package.json`
    );
    expect(response.status).toBe(404);
  });
});

describe('계정 생성 클라이언트', () => {
  let upstream: net.Server | null = null;

  afterEach(async () => {
    const current = upstream;
    upstream = null;
    if (current !== null) {
      await new Promise<void>((resolve) => current.close(() => resolve()));
    }
  });

  /** 어드민 채널을 흉내내는 최소 서버. 받은 라인에 규약대로 답한다. */
  function makeUpstream(createResult: object): Promise<number> {
    upstream = net.createServer((socket) => {
      socket.write(
        JSON.stringify({ type: 'welcome', protocol_version: 1, channel: 'admin' }) +
          '\n'
      );

      let buffer = '';
      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf-8');
        let index: number;
        while ((index = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 1);
          const message = JSON.parse(line) as Record<string, unknown>;

          if (message.type === 'service_login') {
            socket.write(
              JSON.stringify({
                type: 'service_login_result',
                seq: message.seq,
                success: true,
                service: message.service
              }) + '\n'
            );
            continue;
          }

          if (message.type === 'account_create') {
            socket.write(
              JSON.stringify({
                type: 'account_create_result',
                seq: message.seq,
                ...createResult
              }) + '\n'
            );
          }
        }
      });
    });

    return new Promise((resolve) => {
      upstream?.listen(0, '127.0.0.1', () => {
        const address = upstream?.address();
        if (address === null || address === undefined || typeof address === 'string') {
          throw new Error('upstream is not bound to a port');
        }
        resolve(address.port);
      });
    });
  }

  it('인증 후 계정을 만든다', async () => {
    const port = await makeUpstream({ success: true, player_id: 'a1b2c3' });

    const { AccountClient: Client } = await import('../landing/account-client');
    const client = new Client({ host: '127.0.0.1', port, token: 'secret' });

    expect(await client.createAccount({
      username: 'newplayer',
      password: 'longenough'
    })).toEqual({ ok: true, playerId: 'a1b2c3' });
  });

  it('서버의 거절 사유를 그대로 전한다', async () => {
    const port = await makeUpstream({
      success: false,
      reason_code: 'USERNAME_TAKEN'
    });

    const { AccountClient: Client } = await import('../landing/account-client');
    const client = new Client({ host: '127.0.0.1', port, token: 'secret' });

    expect(await client.createAccount({
      username: 'newplayer',
      password: 'longenough'
    })).toEqual({ ok: false, reasonCode: 'USERNAME_TAKEN' });
  });

  it('서버가 없으면 상위 불가로 처리한다', async () => {
    // 열어 두고 바로 닫아 아무도 듣지 않는 포트를 얻는다
    const closed = await makeUpstream({});
    await new Promise<void>((resolve) => upstream?.close(() => resolve()));
    upstream = null;

    const { AccountClient: Client } = await import('../landing/account-client');
    const client = new Client({
      host: '127.0.0.1',
      port: closed,
      token: 'secret',
      timeoutMs: 1000
    });

    const outcome = await client.createAccount({
      username: 'newplayer',
      password: 'longenough'
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reasonCode).toBe(
      'UPSTREAM_UNAVAILABLE'
    );
  });
});
