/**
 * 랜딩 사이트 라우터.
 *
 * 정적 자산은 프로덕션에서 nginx 가 서빙한다. 게이트웨이의 서빙은 개발 편의용
 * 이며 `LANDING_SERVE_STATIC` 으로만 켜진다. 두 곳이 동시에 서빙하면 캐시
 * 헤더와 경로 규칙이 갈라진다.
 *
 * `/api/register` 는 두 배포에서 모두 게이트웨이가 처리한다. 서비스 토큰이
 * 서버측에만 있어야 하기 때문이다.
 */

import type http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../logger.js';
import { AccountClient } from './account-client.js';
import { RateLimiter, clientAddress } from './rate-limit.js';
import { readRegistrationInput, validateRegistration } from './validate.js';

/** 회원가입 엔드포인트 경로 */
export const REGISTER_PATH = '/api/register';

/** 요청 본문 상한. 회원가입 항목 네 개에 필요한 양을 넘는다. */
export const MAX_BODY_BYTES = 8 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip'
};

export interface LandingOptions {
  /** 정적 파일 루트. 서빙을 켜면 필요하다. */
  staticRoot?: string;
  /** 개발 환경에서만 켠다. 프로덕션은 nginx 가 서빙한다. */
  serveStatic?: boolean;
  /** 서비스 토큰이 없는 배포는 회원가입 경로를 닫는다. */
  accountClient?: AccountClient;
  rateLimiter?: RateLimiter;
}

export class LandingRouter {
  private readonly staticRoot: string | null;
  private readonly serveStatic: boolean;
  private readonly accountClient: AccountClient | null;
  private readonly rateLimiter: RateLimiter;

  constructor(options: LandingOptions = {}) {
    this.serveStatic = options.serveStatic ?? false;
    this.staticRoot =
      options.staticRoot !== undefined ? path.resolve(options.staticRoot) : null;
    this.accountClient = options.accountClient ?? null;
    this.rateLimiter = options.rateLimiter ?? new RateLimiter();
  }

  /** 요청을 처리했으면 참을 돌려준다. 거짓이면 호출자가 404 를 응답한다. */
  async handle(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<boolean> {
    const url = requestPath(req.url);

    if (url === REGISTER_PATH) {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
        return true;
      }
      await this.register(req, res);
      return true;
    }

    if (!this.serveStatic || this.staticRoot === null) {
      return false;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return false;
    }

    return this.sendStatic(url, req.method === 'HEAD', res);
  }

  private async register(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    if (this.accountClient === null) {
      // 서비스 토큰이 없는 배포다. 서버도 이 경로를 등록하지 않는다
      sendJson(res, 503, { ok: false, error: 'registration_disabled' });
      return;
    }

    const address = clientAddress(
      req.headers['x-forwarded-for'],
      req.socket.remoteAddress
    );

    if (!this.rateLimiter.allow(address)) {
      logger.warn('Registration rate limited', { address });
      sendJson(res, 429, { ok: false, error: 'rate_limited' });
      return;
    }

    let body: string;
    try {
      body = await readBody(req);
    } catch (error) {
      const tooLarge = error instanceof BodyTooLargeError;
      // 남은 본문을 읽지 않고 응답한다. 연결을 이어 쓰면 읽지 않은 바이트가
      // 다음 요청의 앞부분으로 해석되므로 닫는다
      sendJson(
        res,
        tooLarge ? 413 : 400,
        { ok: false, error: tooLarge ? 'body_too_large' : 'bad_request' },
        { Connection: 'close' }
      );
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      sendJson(res, 400, { ok: false, error: 'bad_request' });
      return;
    }

    const input = readRegistrationInput(parsed);
    const failure = validateRegistration(input);

    if (failure !== null) {
      // 비밀번호 값은 남기지 않는다. 어느 규칙을 어겼는지만 남긴다
      logger.info('Registration validation failed', {
        address,
        field: failure.field,
        rule: failure.rule
      });
      sendJson(res, 400, {
        ok: false,
        error: 'validation',
        field: failure.field,
        rule: failure.rule
      });
      return;
    }

    const outcome = await this.accountClient.createAccount({
      username: input.username,
      password: input.password,
      email: input.email,
      preferredLocale: input.preferredLocale
    });

    if (outcome.ok) {
      sendJson(res, 201, { ok: true, username: input.username });
      return;
    }

    if (outcome.reasonCode === 'USERNAME_TAKEN') {
      sendJson(res, 409, { ok: false, error: 'username_taken' });
      return;
    }

    if (outcome.reasonCode === 'VALIDATION_FAILED') {
      // 서버는 어느 항목이 문제인지 알려주지 않는다. 그대로 전한다
      sendJson(res, 400, { ok: false, error: 'validation' });
      return;
    }

    sendJson(res, 502, { ok: false, error: 'upstream_unavailable' });
  }

  private async sendStatic(
    url: string,
    headOnly: boolean,
    res: http.ServerResponse
  ): Promise<boolean> {
    const root = this.staticRoot;
    if (root === null) {
      return false;
    }

    const resolved = resolveStaticPath(root, url);
    if (resolved === null) {
      logger.warn('Static path rejected', { url });
      return false;
    }

    try {
      const content = await fs.readFile(resolved);
      const type =
        CONTENT_TYPES[path.extname(resolved).toLowerCase()] ??
        'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': content.length
      });
      res.end(headOnly ? undefined : content);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * 요청 경로를 정적 파일 경로로 바꾼다. 루트를 벗어나면 null 이다.
 *
 * 경로 순회는 `..` 뿐 아니라 퍼센트 인코딩(`%2e%2e`)으로도 들어온다. 디코딩을
 * 먼저 하고 정규화한 뒤 루트 안에 있는지 확인한다. 널 바이트는 파일 API 가
 * 예외를 던지지만 여기서 먼저 막는다.
 */
export function resolveStaticPath(root: string, url: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    return null;
  }

  if (decoded.includes('\0')) {
    return null;
  }

  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const resolved = path.resolve(root, relative);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;

  if (resolved !== root && !resolved.startsWith(prefix)) {
    return null;
  }

  return resolved;
}

/** 쿼리와 프래그먼트를 뗀 경로 */
export function requestPath(url: string | undefined): string {
  if (url === undefined || url.length === 0) {
    return '/';
  }

  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

export class BodyTooLargeError extends Error {
  constructor() {
    super('Request body exceeds limit');
    this.name = 'BodyTooLargeError';
  }
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        // 소켓을 끊지 않는다. 끊으면 응답이 나가기 전에 연결이 사라진다
        req.pause();
        reject(new BodyTooLargeError());
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', (error) => reject(error));
  });
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  payload: unknown,
  headers: Record<string, string> = {}
): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...headers
  });
  res.end(body);
}
