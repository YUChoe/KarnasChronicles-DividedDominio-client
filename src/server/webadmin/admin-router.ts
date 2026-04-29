import http from 'http';
import fs from 'fs';
import path from 'path';
import { AuthModule } from './auth.js';
import { DBClient } from './db-client.js';
import { logger } from '../logger.js';

/** Content-Type 매핑 */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** API 라우트 파라미터 */
export interface RouteParams {
  id?: string;
  query: URLSearchParams;
}

/**
 * Admin Panel HTTP 라우터
 * /webadmin 경로의 HTTP 요청을 처리한다
 */
export class AdminRouter {
  private readonly auth: AuthModule;
  private readonly db: DBClient;
  private readonly publicDir: string;

  constructor(auth: AuthModule, db: DBClient) {
    this.auth = auth;
    this.db = db;

    // public/ 디렉토리 경로 결정
    // CommonJS 환경: __dirname 사용
    this.publicDir = path.join(__dirname, 'public');
  }

  /**
   * HTTP 요청을 처리하고 적절한 핸들러로 라우팅한다
   */
  handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    try {
      const parsedUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const pathname = parsedUrl.pathname;
      const method = (req.method ?? 'GET').toUpperCase();

      // /webadmin 경로가 아니면 404
      if (!pathname.startsWith('/webadmin')) {
        this.sendError(res, 404, 'Not found');
        return;
      }

      // /webadmin/api/auth/* → 인증 API (인증 불필요)
      if (pathname.startsWith('/webadmin/api/auth/')) {
        this.handleAuthApi(req, res, method, pathname);
        return;
      }

      // /webadmin/api/* → 인증 검증 후 리소스별 API 핸들러
      if (pathname.startsWith('/webadmin/api/')) {
        this.handleProtectedApi(req, res, method, pathname, parsedUrl.searchParams);
        return;
      }

      // /webadmin/* → 정적 파일 서빙 (인증 검증 포함)
      this.handleStaticFile(req, res, pathname);
    } catch (error) {
      logger.error('Admin router error', {
        url: req.url,
        error: error instanceof Error ? error.message : String(error),
      });
      this.sendError(res, 500, 'Internal server error');
    }
  }

  // ── 인증 API 핸들러 ──

  /**
   * /webadmin/api/auth/* 요청 처리 (인증 불필요)
   */
  private handleAuthApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    method: string,
    pathname: string,
  ): void {
    if (pathname === '/webadmin/api/auth/login' && method === 'POST') {
      this.handleLogin(req, res);
      return;
    }

    if (pathname === '/webadmin/api/auth/logout' && method === 'POST') {
      this.handleLogout(req, res);
      return;
    }

    if (pathname === '/webadmin/api/auth/check' && method === 'GET') {
      this.handleAuthCheck(req, res);
      return;
    }

    this.sendError(res, 404, 'Auth endpoint not found');
  }

  /**
   * POST /webadmin/api/auth/login
   */
  private async handleLogin(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.parseBody(req);
      const { username, password } = body;

      if (!username || !password) {
        this.sendError(res, 400, 'Username and password are required');
        return;
      }

      const session = this.auth.login(username, password);
      if (!session) {
        this.sendError(res, 401, 'Invalid credentials');
        return;
      }

      const cookie = this.auth.createSessionCookie(session.id);
      res.setHeader('Set-Cookie', cookie);
      this.sendJson(res, 200, { authenticated: true });
    } catch (error) {
      logger.error('Login handler error', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.sendError(res, 500, 'Internal server error');
    }
  }

  /**
   * POST /webadmin/api/auth/logout
   */
  private handleLogout(req: http.IncomingMessage, res: http.ServerResponse): void {
    try {
      const sessionId = this.auth.getSessionFromCookie(req.headers.cookie);
      if (sessionId) {
        this.auth.logout(sessionId);
      }

      const clearCookie = this.auth.createClearCookie();
      res.setHeader('Set-Cookie', clearCookie);
      this.sendJson(res, 200, { authenticated: false });
    } catch (error) {
      logger.error('Logout handler error', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.sendError(res, 500, 'Internal server error');
    }
  }

  /**
   * GET /webadmin/api/auth/check
   */
  private handleAuthCheck(req: http.IncomingMessage, res: http.ServerResponse): void {
    try {
      const sessionId = this.auth.getSessionFromCookie(req.headers.cookie);
      const valid = sessionId ? this.auth.validateSession(sessionId) : false;
      this.sendJson(res, 200, { authenticated: valid });
    } catch (error) {
      logger.error('Auth check handler error', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.sendError(res, 500, 'Internal server error');
    }
  }

  // ── 보호된 API 핸들러 ──

  /**
   * /webadmin/api/* 요청 처리 (인증 필요)
   */
  private handleProtectedApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    method: string,
    pathname: string,
    query: URLSearchParams,
  ): void {
    // 인증 검증
    const sessionId = this.auth.getSessionFromCookie(req.headers.cookie);
    if (!sessionId || !this.auth.validateSession(sessionId)) {
      this.sendError(res, 401, 'Authentication required');
      return;
    }

    // API 경로에서 /webadmin/api/ 접두사 제거
    const apiPath = pathname.slice('/webadmin/api/'.length);
    const segments = apiPath.split('/').filter(Boolean);

    if (segments.length === 0) {
      this.sendError(res, 404, 'API endpoint not found');
      return;
    }

    const resource = segments[0];
    const params: RouteParams = {
      id: segments[1],
      query,
    };

    // 리소스별 라우팅
    try {
      switch (resource) {
        case 'map':
          this.handleMapApi(req, res, method, params);
          break;
        case 'stats':
          this.handleStatsApi(req, res, method, params);
          break;
        case 'players':
          this.handlePlayersApi(req, res, method, params, segments);
          break;
        case 'rooms':
          this.handleRoomsApi(req, res, method, params, segments);
          break;
        case 'room-connections':
          this.handleRoomConnectionsApi(req, res, method, params);
          break;
        case 'monsters':
          this.handleMonstersApi(req, res, method, params);
          break;
        case 'objects':
          this.handleObjectsApi(req, res, method, params);
          break;
        default:
          this.sendError(res, 404, 'API endpoint not found');
      }
    } catch (error) {
      logger.error('API handler error', {
        resource,
        method,
        error: error instanceof Error ? error.message : String(error),
      });
      this.sendError(res, 500, 'Internal server error');
    }
  }

  // ── 리소스별 API 스텁 (후속 태스크 7.2~7.7에서 실제 구현) ──

  /** GET /webadmin/api/map */
  private handleMapApi(
    _req: http.IncomingMessage,
    res: http.ServerResponse,
    method: string,
    _params: RouteParams,
  ): void {
    if (method !== 'GET') {
      this.sendError(res, 405, 'Method not allowed');
      return;
    }
    const data = this.db.getMapData();
    this.sendJson(res, 200, data);
  }

  /** GET /webadmin/api/stats */
  private handleStatsApi(
    _req: http.IncomingMessage,
    res: http.ServerResponse,
    method: string,
    _params: RouteParams,
  ): void {
    if (method !== 'GET') {
      this.sendError(res, 405, 'Method not allowed');
      return;
    }
    const data = this.db.getStats();
    this.sendJson(res, 200, data);
  }

  /** /webadmin/api/players/* */
  private async handlePlayersApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    method: string,
    params: RouteParams,
    segments: string[],
  ): Promise<void> {
    try {
      // GET /webadmin/api/players/:id/inventory
      if (segments.length === 3 && segments[2] === 'inventory' && method === 'GET') {
        const items = this.db.getPlayerInventory(segments[1]);
        this.sendJson(res, 200, items);
        return;
      }

      // /webadmin/api/players/:id (단일 리소스)
      if (params.id) {
        switch (method) {
          case 'GET': {
            const player = this.db.getPlayerById(params.id);
            if (!player) {
              this.sendError(res, 404, 'Player not found');
              return;
            }
            this.sendJson(res, 200, player);
            return;
          }
          case 'PUT': {
            const body = await this.parseBody(req);
            const updated = this.db.updatePlayer(params.id, body);
            if (!updated) {
              this.sendError(res, 404, 'Player not found');
              return;
            }
            this.sendJson(res, 200, updated);
            return;
          }
          case 'DELETE': {
            const deleted = this.db.deletePlayer(params.id);
            if (!deleted) {
              this.sendError(res, 404, 'Player not found');
              return;
            }
            this.sendJson(res, 200, { success: true });
            return;
          }
          default:
            this.sendError(res, 405, 'Method not allowed');
            return;
        }
      }

      // /webadmin/api/players (컬렉션)
      switch (method) {
        case 'GET': {
          const page = parseInt(params.query.get('page') ?? '1', 10) || 1;
          const limit = parseInt(params.query.get('limit') ?? '20', 10) || 20;
          const result = this.db.getPlayers(page, limit);
          this.sendJson(res, 200, result);
          return;
        }
        case 'POST': {
          const body = await this.parseBody(req);
          // 필수 필드 검증
          if (!body.username || typeof body.username !== 'string') {
            this.sendError(res, 400, 'username is required', 'username');
            return;
          }
          if (!body.password || typeof body.password !== 'string') {
            this.sendError(res, 400, 'password is required', 'password');
            return;
          }
          try {
            const created = this.db.createPlayer(body as import('./db-client.js').CreatePlayerInput);
            this.sendJson(res, 201, created);
          } catch (error) {
            if (error instanceof Error && error.name === 'UniqueConstraintError') {
              this.sendError(res, 409, error.message);
              return;
            }
            throw error;
          }
          return;
        }
        default:
          this.sendError(res, 405, 'Method not allowed');
          return;
      }
    } catch (error) {
      logger.error('Players API handler error', {
        method,
        segments,
        error: error instanceof Error ? error.message : String(error),
      });
      this.sendError(res, 500, 'Internal server error');
    }
  }

  /** /webadmin/api/rooms/* */
  private async handleRoomsApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    method: string,
    params: RouteParams,
    segments: string[],
  ): Promise<void> {
    try {
      // GET /webadmin/api/rooms/:id/connections
      if (segments.length === 3 && segments[2] === 'connections' && method === 'GET') {
        const room = this.db.getRoomById(segments[1]);
        if (!room) {
          this.sendError(res, 404, 'Room not found');
          return;
        }
        const connections = this.db.getRoomConnections(room.x, room.y);
        this.sendJson(res, 200, connections);
        return;
      }

      // /webadmin/api/rooms/:id (단일 리소스)
      if (params.id) {
        switch (method) {
          case 'GET': {
            const room = this.db.getRoomById(params.id);
            if (!room) {
              this.sendError(res, 404, 'Room not found');
              return;
            }
            this.sendJson(res, 200, room);
            return;
          }
          case 'PUT': {
            const body = await this.parseBody(req);
            const updated = this.db.updateRoom(params.id, body);
            if (!updated) {
              this.sendError(res, 404, 'Room not found');
              return;
            }
            this.sendJson(res, 200, updated);
            return;
          }
          case 'DELETE': {
            const deleted = this.db.deleteRoom(params.id);
            if (!deleted) {
              this.sendError(res, 404, 'Room not found');
              return;
            }
            this.sendJson(res, 200, { success: true });
            return;
          }
          default:
            this.sendError(res, 405, 'Method not allowed');
            return;
        }
      }

      // /webadmin/api/rooms (컬렉션)
      switch (method) {
        case 'GET': {
          const page = parseInt(params.query.get('page') ?? '1', 10) || 1;
          const limit = parseInt(params.query.get('limit') ?? '20', 10) || 20;
          const result = this.db.getRooms(page, limit);
          this.sendJson(res, 200, result);
          return;
        }
        case 'POST': {
          const body = await this.parseBody(req);
          // 필수 필드 검증: x, y (숫자 타입)
          if (body.x === undefined || body.x === null || typeof body.x !== 'number') {
            this.sendError(res, 400, 'x is required and must be a number', 'x');
            return;
          }
          if (body.y === undefined || body.y === null || typeof body.y !== 'number') {
            this.sendError(res, 400, 'y is required and must be a number', 'y');
            return;
          }
          try {
            const created = this.db.createRoom(body as import('./db-client.js').CreateRoomInput);
            this.sendJson(res, 201, created);
          } catch (error) {
            if (error instanceof Error && error.name === 'UniqueConstraintError') {
              this.sendError(res, 409, error.message);
              return;
            }
            throw error;
          }
          return;
        }
        default:
          this.sendError(res, 405, 'Method not allowed');
          return;
      }
    } catch (error) {
      logger.error('Rooms API handler error', {
        method,
        segments,
        error: error instanceof Error ? error.message : String(error),
      });
      this.sendError(res, 500, 'Internal server error');
    }
  }

  /** /webadmin/api/room-connections/* */
  private async handleRoomConnectionsApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    method: string,
    params: RouteParams,
  ): Promise<void> {
    try {
      // DELETE /webadmin/api/room-connections/:id
      if (params.id) {
        if (method === 'DELETE') {
          const deleted = this.db.deleteRoomConnection(params.id);
          if (!deleted) {
            this.sendError(res, 404, 'Room connection not found');
            return;
          }
          this.sendJson(res, 200, { success: true });
          return;
        }
        this.sendError(res, 405, 'Method not allowed');
        return;
      }

      // POST /webadmin/api/room-connections
      if (method === 'POST') {
        const body = await this.parseBody(req);
        // 필수 필드 검증: from_x, from_y, to_x, to_y (숫자 타입)
        if (body.from_x === undefined || body.from_x === null || typeof body.from_x !== 'number') {
          this.sendError(res, 400, 'from_x is required and must be a number', 'from_x');
          return;
        }
        if (body.from_y === undefined || body.from_y === null || typeof body.from_y !== 'number') {
          this.sendError(res, 400, 'from_y is required and must be a number', 'from_y');
          return;
        }
        if (body.to_x === undefined || body.to_x === null || typeof body.to_x !== 'number') {
          this.sendError(res, 400, 'to_x is required and must be a number', 'to_x');
          return;
        }
        if (body.to_y === undefined || body.to_y === null || typeof body.to_y !== 'number') {
          this.sendError(res, 400, 'to_y is required and must be a number', 'to_y');
          return;
        }
        const created = this.db.createRoomConnection(
          body as import('./db-client.js').CreateRoomConnectionInput,
        );
        this.sendJson(res, 201, created);
        return;
      }

      this.sendError(res, 405, 'Method not allowed');
    } catch (error) {
      logger.error('Room connections API handler error', {
        method,
        error: error instanceof Error ? error.message : String(error),
      });
      this.sendError(res, 500, 'Internal server error');
    }
  }

  /** /webadmin/api/monsters/* */
  private async handleMonstersApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    method: string,
    params: RouteParams,
  ): Promise<void> {
    try {
      // /webadmin/api/monsters/:id (단일 리소스)
      if (params.id) {
        switch (method) {
          case 'GET': {
            const monster = this.db.getMonsterById(params.id);
            if (!monster) {
              this.sendError(res, 404, 'Monster not found');
              return;
            }
            this.sendJson(res, 200, monster);
            return;
          }
          case 'PUT': {
            const body = await this.parseBody(req);
            const updated = this.db.updateMonster(params.id, body);
            if (!updated) {
              this.sendError(res, 404, 'Monster not found');
              return;
            }
            this.sendJson(res, 200, updated);
            return;
          }
          case 'DELETE': {
            const deleted = this.db.deleteMonster(params.id);
            if (!deleted) {
              this.sendError(res, 404, 'Monster not found');
              return;
            }
            this.sendJson(res, 200, { success: true });
            return;
          }
          default:
            this.sendError(res, 405, 'Method not allowed');
            return;
        }
      }

      // /webadmin/api/monsters (컬렉션)
      switch (method) {
        case 'GET': {
          const page = parseInt(params.query.get('page') ?? '1', 10) || 1;
          const limit = parseInt(params.query.get('limit') ?? '20', 10) || 20;
          const result = this.db.getMonsters(page, limit);
          this.sendJson(res, 200, result);
          return;
        }
        case 'POST': {
          const body = await this.parseBody(req);
          // 필수 필드 검증: name_en, name_ko
          if (!body.name_en || typeof body.name_en !== 'string') {
            this.sendError(res, 400, 'name_en is required', 'name_en');
            return;
          }
          if (!body.name_ko || typeof body.name_ko !== 'string') {
            this.sendError(res, 400, 'name_ko is required', 'name_ko');
            return;
          }
          const created = this.db.createMonster(body as import('./db-client.js').CreateMonsterInput);
          this.sendJson(res, 201, created);
          return;
        }
        default:
          this.sendError(res, 405, 'Method not allowed');
          return;
      }
    } catch (error) {
      logger.error('Monsters API handler error', {
        method,
        error: error instanceof Error ? error.message : String(error),
      });
      this.sendError(res, 500, 'Internal server error');
    }
  }

  /** /webadmin/api/objects/* */
  private async handleObjectsApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    method: string,
    params: RouteParams,
  ): Promise<void> {
    try {
      // /webadmin/api/objects/:id (단일 리소스)
      if (params.id) {
        switch (method) {
          case 'GET': {
            const obj = this.db.getGameObjectById(params.id);
            if (!obj) {
              this.sendError(res, 404, 'Game object not found');
              return;
            }
            this.sendJson(res, 200, obj);
            return;
          }
          case 'PUT': {
            const body = await this.parseBody(req);
            const updated = this.db.updateGameObject(params.id, body);
            if (!updated) {
              this.sendError(res, 404, 'Game object not found');
              return;
            }
            this.sendJson(res, 200, updated);
            return;
          }
          case 'DELETE': {
            const deleted = this.db.deleteGameObject(params.id);
            if (!deleted) {
              this.sendError(res, 404, 'Game object not found');
              return;
            }
            this.sendJson(res, 200, { success: true });
            return;
          }
          default:
            this.sendError(res, 405, 'Method not allowed');
            return;
        }
      }

      // /webadmin/api/objects (컬렉션)
      switch (method) {
        case 'GET': {
          const page = parseInt(params.query.get('page') ?? '1', 10) || 1;
          const limit = parseInt(params.query.get('limit') ?? '20', 10) || 20;
          const result = this.db.getGameObjects(page, limit);
          this.sendJson(res, 200, result);
          return;
        }
        case 'POST': {
          const body = await this.parseBody(req);
          // 필수 필드 검증: name_en, name_ko, location_type
          if (!body.name_en || typeof body.name_en !== 'string') {
            this.sendError(res, 400, 'name_en is required', 'name_en');
            return;
          }
          if (!body.name_ko || typeof body.name_ko !== 'string') {
            this.sendError(res, 400, 'name_ko is required', 'name_ko');
            return;
          }
          if (!body.location_type || typeof body.location_type !== 'string') {
            this.sendError(res, 400, 'location_type is required', 'location_type');
            return;
          }
          const created = this.db.createGameObject(body as import('./db-client.js').CreateGameObjectInput);
          this.sendJson(res, 201, created);
          return;
        }
        default:
          this.sendError(res, 405, 'Method not allowed');
          return;
      }
    } catch (error) {
      logger.error('Objects API handler error', {
        method,
        error: error instanceof Error ? error.message : String(error),
      });
      this.sendError(res, 500, 'Internal server error');
    }
  }

  // ── 정적 파일 서빙 ──

  /**
   * /webadmin/* 정적 파일 서빙
   * SPA 라우팅: 비-API, 비-파일 경로는 index.html 반환
   */
  private handleStaticFile(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
  ): void {
    // /webadmin 또는 /webadmin/ → index.html
    let relativePath = pathname.slice('/webadmin'.length) || '/';
    if (relativePath === '/') {
      relativePath = '/index.html';
    }

    // 경로 순회 공격 방지
    const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(this.publicDir, safePath);

    // public 디렉토리 밖으로 나가는 경로 차단
    if (!filePath.startsWith(this.publicDir)) {
      this.sendError(res, 403, 'Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        // 파일이 없으면 SPA 라우팅: index.html 반환
        const indexPath = path.join(this.publicDir, 'index.html');
        fs.readFile(indexPath, (indexErr, indexData) => {
          if (indexErr) {
            this.sendError(res, 404, 'Not found');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(indexData);
        });
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  }

  // ── 유틸리티 메서드 ──

  /**
   * JSON 요청 본문 파싱
   * Content-Type이 application/json이 아니어도 JSON 파싱 시도
   */
  parseBody(req: http.IncomingMessage): Promise<Record<string, any>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf-8');
          if (!raw || raw.trim().length === 0) {
            resolve({});
            return;
          }
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * URL 경로에서 리소스 ID 추출
   * /webadmin/api/resource/:id → id
   */
  extractResourceId(pathname: string): string | undefined {
    const segments = pathname.split('/').filter(Boolean);
    // ['webadmin', 'api', 'resource', 'id']
    return segments.length >= 4 ? segments[3] : undefined;
  }

  /**
   * JSON 응답 전송
   */
  sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  }

  /**
   * JSON 오류 응답 전송
   */
  sendError(res: http.ServerResponse, statusCode: number, message: string, field?: string): void {
    const body: Record<string, string> = { error: message };
    if (field) {
      body.field = field;
    }
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  }
}
