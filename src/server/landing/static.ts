/**
 * 랜딩 정적 파일 서빙.
 *
 * 프로덕션은 nginx 가 서빙한다. 여기는 개발 편의용이며 `LANDING_SERVE_STATIC`
 * 으로만 켜진다. 두 곳이 동시에 서빙하면 캐시 헤더와 경로 규칙이 갈라진다.
 *
 * 랜딩에는 계정 생성이 없다. 계정 생성은 Godot 클라이언트가 게임 채널의
 * `register` 로 직접 한다. 게이트웨이는 WebSocket 을 TCP 로 옮기는 일만 한다.
 */

import type http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../logger.js';

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

export interface StaticOptions {
  /** 정적 파일 루트 */
  staticRoot: string;
}

export class StaticFiles {
  private readonly staticRoot: string;

  constructor(options: StaticOptions) {
    this.staticRoot = path.resolve(options.staticRoot);
  }

  /** 요청을 처리했으면 참을 돌려준다. 거짓이면 호출자가 404 를 응답한다. */
  async handle(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<boolean> {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return false;
    }

    const resolved = resolveStaticPath(
      this.staticRoot,
      requestPath(req.url)
    );

    if (resolved === null) {
      logger.warn('Static path rejected', { url: req.url });
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
      res.end(req.method === 'HEAD' ? undefined : content);
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
