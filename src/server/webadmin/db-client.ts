/**
 * SQLite3 데이터 접근 계층
 * better-sqlite3를 사용한 동기 DB 클라이언트
 */

import Database from 'better-sqlite3';
import type { Database as DatabaseType, Statement } from 'better-sqlite3';
import crypto from 'crypto';
import { logger } from '../logger.js';

// ── 대시보드 맵 데이터 타입 ──

export interface MapData {
  rooms: MapRoom[];
  stats: DashboardStats;
}

export interface MapRoom {
  id: string;
  x: number;
  y: number;
  description_en: string | null;
  description_ko: string | null;
  blocked_exits: string[];
  creatures: MapCreature[];
  players: MapPlayer[];
  items: MapItem[];
  enter_connections: { to_x: number; to_y: number }[];
}

export interface MapCreature {
  id: string;
  name_en: string;
  name_ko: string;
  hp: number;
  faction: string;
  faction_id: string;
}

export interface MapPlayer {
  id: string;
  username: string;
  is_admin: boolean;
}

export interface MapItem {
  id: string;
  name_en: string;
  name_ko: string;
  category: string;
}

export interface DashboardStats {
  players: number;
  rooms: number;
  monsters: number;
  gameObjects: number;
}

/**
 * 페이지네이션 공통 타입
 */
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ── 플레이어 타입 ──

export interface Player {
  id: string;
  username: string;
  email: string | null;
  preferred_locale: string;
  is_admin: boolean;
  display_name: string | null;
  faction_id: string;
  last_login: string | null;
  last_room_x: number;
  last_room_y: number;
  stat_strength: number;
  stat_dexterity: number;
  stat_intelligence: number;
  stat_wisdom: number;
  stat_constitution: number;
  stat_charisma: number;
  created_at: string;
}

export interface CreatePlayerInput {
  username: string;
  password: string;
  email?: string;
  preferred_locale?: string;
  is_admin?: boolean;
  display_name?: string;
  faction_id?: string;
}

export interface UpdatePlayerInput {
  username?: string;
  email?: string;
  preferred_locale?: string;
  is_admin?: boolean;
  display_name?: string;
  faction_id?: string;
  last_room_x?: number;
  last_room_y?: number;
  stat_strength?: number;
  stat_dexterity?: number;
  stat_intelligence?: number;
  stat_wisdom?: number;
  stat_constitution?: number;
  stat_charisma?: number;
}

// ── 방 타입 ──

export interface Room {
  id: string;
  x: number;
  y: number;
  description_en: string | null;
  description_ko: string | null;
  blocked_exits: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateRoomInput {
  x: number;
  y: number;
  description_en?: string;
  description_ko?: string;
  blocked_exits?: string[];
}

export interface UpdateRoomInput {
  x?: number;
  y?: number;
  description_en?: string;
  description_ko?: string;
  blocked_exits?: string[];
}

// ── 방 연결 타입 ──

export interface RoomConnection {
  id: string;
  from_x: number;
  from_y: number;
  to_x: number;
  to_y: number;
  created_at: string;
}

export interface CreateRoomConnectionInput {
  from_x: number;
  from_y: number;
  to_x: number;
  to_y: number;
}

// ── 게임 오브젝트 타입 (인벤토리 조회용) ──

export interface GameObject {
  id: string;
  name_en: string;
  name_ko: string;
  description_en: string | null;
  description_ko: string | null;
  location_type: string;
  location_id: string | null;
  properties: Record<string, unknown>;
  weight: number;
  max_stack: number;
  category: string;
  equipment_slot: string | null;
  is_equipped: boolean;
  created_at: string;
}

// ── 게임 오브젝트 입력 타입 ──

export interface CreateGameObjectInput {
  name_en: string;
  name_ko: string;
  location_type: string;
  location_id?: string;
  description_en?: string;
  description_ko?: string;
  properties?: Record<string, unknown>;
  weight?: number;
  max_stack?: number;
  category?: string;
  equipment_slot?: string;
  is_equipped?: boolean;
}

export interface UpdateGameObjectInput {
  name_en?: string;
  name_ko?: string;
  description_en?: string;
  description_ko?: string;
  location_type?: string;
  location_id?: string;
  properties?: Record<string, unknown>;
  weight?: number;
  max_stack?: number;
  category?: string;
  equipment_slot?: string;
  is_equipped?: boolean;
}

// ── 몬스터 타입 ──

export interface Monster {
  id: string;
  name_en: string;
  name_ko: string;
  description_en: string | null;
  description_ko: string | null;
  monster_type: string;
  behavior: string;
  stats: Record<string, unknown>;
  drop_items: unknown[];
  respawn_time: number;
  is_alive: boolean;
  aggro_range: number;
  roaming_range: number;
  properties: Record<string, unknown>;
  x: number | null;
  y: number | null;
  faction_id: string | null;
  created_at: string;
}

export interface CreateMonsterInput {
  name_en: string;
  name_ko: string;
  description_en?: string;
  description_ko?: string;
  monster_type?: string;
  behavior?: string;
  stats?: Record<string, unknown>;
  drop_items?: unknown[];
  respawn_time?: number;
  aggro_range?: number;
  roaming_range?: number;
  properties?: Record<string, unknown>;
  x?: number;
  y?: number;
  faction_id?: string;
}

export interface UpdateMonsterInput {
  name_en?: string;
  name_ko?: string;
  description_en?: string;
  description_ko?: string;
  monster_type?: string;
  behavior?: string;
  stats?: Record<string, unknown>;
  drop_items?: unknown[];
  respawn_time?: number;
  aggro_range?: number;
  roaming_range?: number;
  properties?: Record<string, unknown>;
  x?: number;
  y?: number;
  faction_id?: string;
}

export class DBClient {
  private db: DatabaseType;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? (process.env.DATA_DIR
      ? `${process.env.DATA_DIR}/mud_engine.db`
      : 'data/mud_engine.db');

    try {
      this.db = new Database(resolvedPath);
      this.db.pragma('journal_mode = WAL');
      logger.info('DB connection opened', { path: resolvedPath });
    } catch (error) {
      logger.error('Failed to open DB', {
        path: resolvedPath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * DB 연결 종료
   */
  close(): void {
    try {
      this.db.close();
      logger.info('DB connection closed');
    } catch (error) {
      logger.error('Failed to close DB', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * UUID v4 생성
   */
  protected generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * 공통 페이지네이션 헬퍼
   *
   * @param countSql - 전체 레코드 수를 조회하는 SQL (SELECT COUNT(*) AS count FROM ...)
   * @param dataSql  - 데이터를 조회하는 SQL (LIMIT/OFFSET 없이)
   * @param params   - countSql, dataSql 공통 바인딩 파라미터
   * @param page     - 페이지 번호 (1부터 시작)
   * @param limit    - 페이지당 레코드 수
   * @returns PaginatedResult<T>
   */
  protected paginate<T>(
    countSql: string,
    dataSql: string,
    params: Record<string, unknown>,
    page: number,
    limit: number,
  ): PaginatedResult<T> {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const offset = (safePage - 1) * safeLimit;

    try {
      const countRow = this.db.prepare(countSql).get(params) as { count: number };
      const total = countRow.count;
      const totalPages = Math.ceil(total / safeLimit);

      const rows = this.db
        .prepare(`${dataSql} LIMIT @limit OFFSET @offset`)
        .all({ ...params, limit: safeLimit, offset }) as T[];

      return {
        data: rows,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      logger.error('Pagination query failed', {
        countSql,
        dataSql,
        params,
        page: safePage,
        limit: safeLimit,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 대시보드 맵 데이터 조회
   * rooms 전체 + 각 방 좌표에 위치한 monsters, players, game_objects, room_connections 조인
   */
  getMapData(): MapData {
    try {
      // 1) 전체 방 목록 조회
      const rooms = this.db.prepare(
        'SELECT id, x, y, description_en, description_ko, blocked_exits FROM rooms',
      ).all() as Array<{
        id: string;
        x: number;
        y: number;
        description_en: string | null;
        description_ko: string | null;
        blocked_exits: string | null;
      }>;

      // 2) 전체 몬스터 + faction 이름 조회 (LEFT JOIN factions)
      const monsters = this.db.prepare(`
        SELECT m.id, m.x, m.y, m.name_en, m.name_ko, m.stats, m.faction_id,
               COALESCE(f.name_en, '') AS faction_name
        FROM monsters m
        LEFT JOIN factions f ON m.faction_id = f.id
        WHERE m.x IS NOT NULL AND m.y IS NOT NULL
      `).all() as Array<{
        id: string;
        x: number;
        y: number;
        name_en: string;
        name_ko: string;
        stats: string | null;
        faction_id: string | null;
        faction_name: string;
      }>;

      // 3) 전체 플레이어 조회
      const players = this.db.prepare(
        'SELECT id, username, is_admin, last_room_x, last_room_y FROM players',
      ).all() as Array<{
        id: string;
        username: string;
        is_admin: number;
        last_room_x: number;
        last_room_y: number;
      }>;

      // 4) 방에 위치한 게임 오브젝트 조회
      const objects = this.db.prepare(`
        SELECT go.id, go.name_en, go.name_ko, go.category, go.location_id
        FROM game_objects go
        WHERE go.location_type = 'ROOM'
      `).all() as Array<{
        id: string;
        name_en: string;
        name_ko: string;
        category: string;
        location_id: string | null;
      }>;

      // 5) 전체 room_connections 조회
      const connections = this.db.prepare(
        'SELECT from_x, from_y, to_x, to_y FROM room_connections',
      ).all() as Array<{
        from_x: number;
        from_y: number;
        to_x: number;
        to_y: number;
      }>;

      // ── 좌표별 그룹핑 ──

      // 몬스터: 좌표 키 → MapCreature[]
      const monsterMap = new Map<string, MapCreature[]>();
      for (const m of monsters) {
        const key = `${m.x},${m.y}`;
        let hp = 0;
        if (m.stats) {
          try {
            const parsed = JSON.parse(m.stats);
            hp = typeof parsed.current_hp === 'number' ? parsed.current_hp : 0;
          } catch { /* JSON 파싱 실패 시 hp=0 */ }
        }
        const creature: MapCreature = {
          id: m.id,
          name_en: m.name_en,
          name_ko: m.name_ko,
          hp,
          faction: m.faction_name,
          faction_id: m.faction_id ?? '',
        };
        const arr = monsterMap.get(key);
        if (arr) arr.push(creature);
        else monsterMap.set(key, [creature]);
      }

      // 플레이어: 좌표 키 → MapPlayer[]
      const playerMap = new Map<string, MapPlayer[]>();
      for (const p of players) {
        const key = `${p.last_room_x},${p.last_room_y}`;
        const player: MapPlayer = {
          id: p.id,
          username: p.username,
          is_admin: Boolean(p.is_admin),
        };
        const arr = playerMap.get(key);
        if (arr) arr.push(player);
        else playerMap.set(key, [player]);
      }

      // 오브젝트: room id → MapItem[]
      const objectMap = new Map<string, MapItem[]>();
      for (const o of objects) {
        if (!o.location_id) continue;
        const item: MapItem = {
          id: o.id,
          name_en: o.name_en,
          name_ko: o.name_ko,
          category: o.category,
        };
        const arr = objectMap.get(o.location_id);
        if (arr) arr.push(item);
        else objectMap.set(o.location_id, [item]);
      }

      // room_connections: 좌표 키 → { to_x, to_y }[]
      const connectionMap = new Map<string, { to_x: number; to_y: number }[]>();
      for (const c of connections) {
        const key = `${c.from_x},${c.from_y}`;
        const entry = { to_x: c.to_x, to_y: c.to_y };
        const arr = connectionMap.get(key);
        if (arr) arr.push(entry);
        else connectionMap.set(key, [entry]);
      }

      // ── 방별 데이터 조합 ──
      const mapRooms: MapRoom[] = rooms.map((r) => {
        const coordKey = `${r.x},${r.y}`;
        let blockedExits: string[] = [];
        if (r.blocked_exits) {
          try {
            blockedExits = JSON.parse(r.blocked_exits);
          } catch { /* JSON 파싱 실패 시 빈 배열 */ }
        }

        return {
          id: r.id,
          x: r.x,
          y: r.y,
          description_en: r.description_en,
          description_ko: r.description_ko,
          blocked_exits: blockedExits,
          creatures: monsterMap.get(coordKey) ?? [],
          players: playerMap.get(coordKey) ?? [],
          items: objectMap.get(r.id) ?? [],
          enter_connections: connectionMap.get(coordKey) ?? [],
        };
      });

      const stats = this.getStats();

      return { rooms: mapRooms, stats };
    } catch (error) {
      logger.error('Failed to get map data', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 대시보드 통계 조회
   * players, rooms, monsters, game_objects 각 테이블의 레코드 수 반환
   */
  getStats(): DashboardStats {
    try {
      const countQuery = (table: string): number => {
        const row = this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
        return row.count;
      };

      return {
        players: countQuery('players'),
        rooms: countQuery('rooms'),
        monsters: countQuery('monsters'),
        gameObjects: countQuery('game_objects'),
      };
    } catch (error) {
      logger.error('Failed to get stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 내부 DB 인스턴스 접근 (서브클래스 및 CRUD 메서드용)
   */
  protected getDb(): DatabaseType {
    return this.db;
  }

  // ── 플레이어 CRUD ──

  /**
   * 페이지네이션된 플레이어 목록 조회
   */
  getPlayers(page: number, limit: number): PaginatedResult<Omit<Player, 'email' | 'preferred_locale' | 'stat_strength' | 'stat_dexterity' | 'stat_intelligence' | 'stat_wisdom' | 'stat_constitution' | 'stat_charisma' | 'created_at'>> {
    const countSql = 'SELECT COUNT(*) AS count FROM players';
    const dataSql = `
      SELECT id, username, display_name, is_admin, faction_id,
             last_login, last_room_x, last_room_y
      FROM players
      ORDER BY created_at DESC`;

    const result = this.paginate<any>(countSql, dataSql, {}, page, limit);

    // is_admin: 0/1 → boolean 변환
    result.data = result.data.map((row: any) => ({
      ...row,
      is_admin: Boolean(row.is_admin),
    }));

    return result;
  }

  /**
   * 플레이어 상세 조회 (password_hash 제외)
   */
  getPlayerById(id: string): Player | null {
    try {
      const row = this.db.prepare(`
        SELECT id, username, email, preferred_locale, is_admin,
               display_name, faction_id, last_login,
               last_room_x, last_room_y,
               stat_strength, stat_dexterity, stat_intelligence,
               stat_wisdom, stat_constitution, stat_charisma,
               created_at
        FROM players
        WHERE id = @id
      `).get({ id }) as any | undefined;

      if (!row) return null;

      return {
        ...row,
        is_admin: Boolean(row.is_admin),
      };
    } catch (error) {
      logger.error('Failed to get player by id', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 새 플레이어 생성
   * - UUID 생성, 비밀번호 SHA-256 해싱
   * - 기본 스탯 값: 모두 1
   * - username 중복 시 에러 throw
   */
  createPlayer(data: CreatePlayerInput): Player {
    const id = this.generateId();
    const passwordHash = crypto.createHash('sha256').update(data.password).digest('hex');

    try {
      this.db.prepare(`
        INSERT INTO players (
          id, username, password_hash, email, preferred_locale,
          is_admin, display_name, faction_id,
          stat_strength, stat_dexterity, stat_intelligence,
          stat_wisdom, stat_constitution, stat_charisma,
          last_room_x, last_room_y
        ) VALUES (
          @id, @username, @password_hash, @email, @preferred_locale,
          @is_admin, @display_name, @faction_id,
          1, 1, 1, 1, 1, 1, 0, 0
        )
      `).run({
        id,
        username: data.username,
        password_hash: passwordHash,
        email: data.email ?? null,
        preferred_locale: data.preferred_locale ?? 'en',
        is_admin: data.is_admin ? 1 : 0,
        display_name: data.display_name ?? null,
        faction_id: data.faction_id ?? 'ash_knights',
      });
    } catch (error) {
      // UNIQUE constraint 위반 시 커스텀 에러
      if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
        const dupError = new Error(`Username '${data.username}' already exists`);
        dupError.name = 'UniqueConstraintError';
        throw dupError;
      }
      logger.error('Failed to create player', {
        username: data.username,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return this.getPlayerById(id) as Player;
  }

  /**
   * 플레이어 수정 (전달된 필드만 업데이트)
   * 없으면 null 반환
   */
  updatePlayer(id: string, data: UpdatePlayerInput): Player | null {
    // 존재 여부 확인
    const existing = this.getPlayerById(id);
    if (!existing) return null;

    // 동적 SET 절 생성
    const allowedFields = [
      'username', 'email', 'preferred_locale', 'is_admin',
      'display_name', 'faction_id', 'last_room_x', 'last_room_y',
      'stat_strength', 'stat_dexterity', 'stat_intelligence',
      'stat_wisdom', 'stat_constitution', 'stat_charisma',
    ];

    const setClauses: string[] = [];
    const params: Record<string, unknown> = { id };

    for (const field of allowedFields) {
      if ((data as any)[field] !== undefined) {
        let value = (data as any)[field];
        // is_admin: boolean → 0/1 변환
        if (field === 'is_admin') {
          value = value ? 1 : 0;
        }
        setClauses.push(`${field} = @${field}`);
        params[field] = value;
      }
    }

    if (setClauses.length === 0) {
      return existing;
    }

    try {
      this.db.prepare(`
        UPDATE players SET ${setClauses.join(', ')} WHERE id = @id
      `).run(params);
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
        const dupError = new Error(`Username '${(data as any).username}' already exists`);
        dupError.name = 'UniqueConstraintError';
        throw dupError;
      }
      logger.error('Failed to update player', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return this.getPlayerById(id);
  }

  /**
   * 플레이어 삭제
   * - 플레이어 레코드 삭제
   * - 소유 game_objects 삭제 (INVENTORY, EQUIPPED)
   * - 트랜잭션 사용
   * - 없으면 false
   */
  deletePlayer(id: string): boolean {
    // 존재 여부 확인
    const existing = this.db.prepare('SELECT id FROM players WHERE id = @id').get({ id });
    if (!existing) return false;

    try {
      const deleteTransaction = this.db.transaction(() => {
        // 소유 game_objects 삭제
        this.db.prepare(`
          DELETE FROM game_objects
          WHERE location_id = @id
            AND location_type IN ('INVENTORY', 'EQUIPPED')
        `).run({ id });

        // 플레이어 레코드 삭제
        this.db.prepare('DELETE FROM players WHERE id = @id').run({ id });
      });

      deleteTransaction();
      return true;
    } catch (error) {
      logger.error('Failed to delete player', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 플레이어 인벤토리 조회
   * location_id = playerId AND location_type IN ('INVENTORY', 'EQUIPPED')
   */
  getPlayerInventory(playerId: string): GameObject[] {
    try {
      const rows = this.db.prepare(`
        SELECT id, name_en, name_ko, description_en, description_ko,
               location_type, location_id, properties,
               weight, max_stack, category, equipment_slot,
               is_equipped, created_at
        FROM game_objects
        WHERE location_id = @playerId
          AND location_type IN ('INVENTORY', 'EQUIPPED')
        ORDER BY created_at DESC
      `).all({ playerId }) as any[];

      return rows.map((row) => ({
        ...row,
        is_equipped: Boolean(row.is_equipped),
        properties: typeof row.properties === 'string'
          ? JSON.parse(row.properties)
          : row.properties ?? {},
      }));
    } catch (error) {
      logger.error('Failed to get player inventory', {
        playerId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // ── 방 CRUD ──

  /**
   * 페이지네이션된 방 목록 조회
   */
  getRooms(page: number, limit: number): PaginatedResult<Room> {
    const countSql = 'SELECT COUNT(*) AS count FROM rooms';
    const dataSql = `
      SELECT id, x, y, description_en, description_ko, blocked_exits,
             created_at, updated_at
      FROM rooms
      ORDER BY x ASC, y ASC`;

    const result = this.paginate<any>(countSql, dataSql, {}, page, limit);

    // blocked_exits: JSON 문자열 → 배열 변환
    result.data = result.data.map((row: any) => ({
      ...row,
      blocked_exits: this.parseBlockedExits(row.blocked_exits),
    }));

    return result;
  }

  /**
   * 방 상세 조회
   * 없으면 null 반환
   */
  getRoomById(id: string): Room | null {
    try {
      const row = this.db.prepare(`
        SELECT id, x, y, description_en, description_ko, blocked_exits,
               created_at, updated_at
        FROM rooms
        WHERE id = @id
      `).get({ id }) as any | undefined;

      if (!row) return null;

      return {
        ...row,
        blocked_exits: this.parseBlockedExits(row.blocked_exits),
      };
    } catch (error) {
      logger.error('Failed to get room by id', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 새 방 생성
   * - UUID 생성
   * - 좌표 중복 검사 (x, y 조합이 이미 존재하면 에러)
   * - blocked_exits: 배열 → JSON 문자열로 저장
   */
  createRoom(data: CreateRoomInput): Room {
    // 좌표 중복 검사
    const existing = this.db.prepare(
      'SELECT id FROM rooms WHERE x = @x AND y = @y',
    ).get({ x: data.x, y: data.y });

    if (existing) {
      const dupError = new Error(`Room at coordinates (${data.x}, ${data.y}) already exists`);
      dupError.name = 'UniqueConstraintError';
      throw dupError;
    }

    const id = this.generateId();
    const now = new Date().toISOString();
    const blockedExitsJson = JSON.stringify(data.blocked_exits ?? []);

    try {
      this.db.prepare(`
        INSERT INTO rooms (id, x, y, description_en, description_ko, blocked_exits, created_at, updated_at)
        VALUES (@id, @x, @y, @description_en, @description_ko, @blocked_exits, @created_at, @updated_at)
      `).run({
        id,
        x: data.x,
        y: data.y,
        description_en: data.description_en ?? null,
        description_ko: data.description_ko ?? null,
        blocked_exits: blockedExitsJson,
        created_at: now,
        updated_at: now,
      });
    } catch (error) {
      logger.error('Failed to create room', {
        x: data.x,
        y: data.y,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return this.getRoomById(id) as Room;
  }

  /**
   * 방 수정 (전달된 필드만 업데이트)
   * 없으면 null 반환
   */
  updateRoom(id: string, data: UpdateRoomInput): Room | null {
    const existing = this.getRoomById(id);
    if (!existing) return null;

    const setClauses: string[] = [];
    const params: Record<string, unknown> = { id };

    if (data.x !== undefined) {
      setClauses.push('x = @x');
      params.x = data.x;
    }
    if (data.y !== undefined) {
      setClauses.push('y = @y');
      params.y = data.y;
    }
    if (data.description_en !== undefined) {
      setClauses.push('description_en = @description_en');
      params.description_en = data.description_en;
    }
    if (data.description_ko !== undefined) {
      setClauses.push('description_ko = @description_ko');
      params.description_ko = data.description_ko;
    }
    if (data.blocked_exits !== undefined) {
      setClauses.push('blocked_exits = @blocked_exits');
      params.blocked_exits = JSON.stringify(data.blocked_exits);
    }

    if (setClauses.length === 0) {
      return existing;
    }

    // updated_at 자동 갱신
    setClauses.push('updated_at = @updated_at');
    params.updated_at = new Date().toISOString();

    try {
      this.db.prepare(`
        UPDATE rooms SET ${setClauses.join(', ')} WHERE id = @id
      `).run(params);
    } catch (error) {
      logger.error('Failed to update room', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return this.getRoomById(id);
  }

  /**
   * 방 삭제
   * - 방 레코드 삭제
   * - 관련 room_connections 삭제 (from_x/from_y 또는 to_x/to_y가 해당 방 좌표와 일치)
   * - 트랜잭션 사용
   * - 없으면 false
   */
  deleteRoom(id: string): boolean {
    const existing = this.db.prepare(
      'SELECT id, x, y FROM rooms WHERE id = @id',
    ).get({ id }) as { id: string; x: number; y: number } | undefined;

    if (!existing) return false;

    try {
      const deleteTransaction = this.db.transaction(() => {
        // 관련 room_connections 삭제
        this.db.prepare(`
          DELETE FROM room_connections
          WHERE (from_x = @x AND from_y = @y)
             OR (to_x = @x AND to_y = @y)
        `).run({ x: existing.x, y: existing.y });

        // 방 레코드 삭제
        this.db.prepare('DELETE FROM rooms WHERE id = @id').run({ id });
      });

      deleteTransaction();
      return true;
    } catch (error) {
      logger.error('Failed to delete room', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 특정 방 좌표의 연결 목록 조회
   * from_x/from_y가 일치하는 room_connections 반환
   */
  getRoomConnections(x: number, y: number): RoomConnection[] {
    try {
      return this.db.prepare(`
        SELECT id, from_x, from_y, to_x, to_y, created_at
        FROM room_connections
        WHERE from_x = @x AND from_y = @y
        ORDER BY created_at DESC
      `).all({ x, y }) as RoomConnection[];
    } catch (error) {
      logger.error('Failed to get room connections', {
        x,
        y,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 새 room_connection 생성
   * UUID 생성
   */
  createRoomConnection(data: CreateRoomConnectionInput): RoomConnection {
    const id = this.generateId();

    try {
      this.db.prepare(`
        INSERT INTO room_connections (id, from_x, from_y, to_x, to_y)
        VALUES (@id, @from_x, @from_y, @to_x, @to_y)
      `).run({
        id,
        from_x: data.from_x,
        from_y: data.from_y,
        to_x: data.to_x,
        to_y: data.to_y,
      });
    } catch (error) {
      logger.error('Failed to create room connection', {
        data,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return this.db.prepare(
      'SELECT id, from_x, from_y, to_x, to_y, created_at FROM room_connections WHERE id = @id',
    ).get({ id }) as RoomConnection;
  }

  /**
   * room_connection 삭제
   * 없으면 false
   */
  deleteRoomConnection(id: string): boolean {
    const existing = this.db.prepare(
      'SELECT id FROM room_connections WHERE id = @id',
    ).get({ id });

    if (!existing) return false;

    try {
      this.db.prepare('DELETE FROM room_connections WHERE id = @id').run({ id });
      return true;
    } catch (error) {
      logger.error('Failed to delete room connection', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * blocked_exits JSON 문자열 → 배열 변환 헬퍼
   */
  private parseBlockedExits(raw: string | null): string[] {
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  /**
   * JSON 문자열 → 객체 변환 헬퍼
   * 파싱 실패 시 기본값 반환
   */
  private parseJsonField<T>(raw: string | null, defaultValue: T): T {
    if (!raw) return defaultValue;
    try {
      return JSON.parse(raw);
    } catch {
      return defaultValue;
    }
  }

  // ── 몬스터 CRUD ──

  /**
   * 페이지네이션된 몬스터 목록 조회
   * 반환 필드: id, name_en, name_ko, monster_type, behavior, x, y, is_alive, faction_id
   */
  getMonsters(page: number, limit: number): PaginatedResult<Pick<Monster, 'id' | 'name_en' | 'name_ko' | 'monster_type' | 'behavior' | 'x' | 'y' | 'is_alive' | 'faction_id'>> {
    const countSql = 'SELECT COUNT(*) AS count FROM monsters';
    const dataSql = `
      SELECT id, name_en, name_ko, monster_type, behavior,
             x, y, is_alive, faction_id
      FROM monsters
      ORDER BY created_at DESC`;

    const result = this.paginate<any>(countSql, dataSql, {}, page, limit);

    // is_alive: 0/1 → boolean 변환
    result.data = result.data.map((row: any) => ({
      ...row,
      is_alive: Boolean(row.is_alive),
    }));

    return result;
  }

  /**
   * 몬스터 상세 조회
   * 모든 필드 반환, JSON 필드 파싱, is_alive boolean 변환
   * 없으면 null
   */
  getMonsterById(id: string): Monster | null {
    try {
      const row = this.db.prepare(`
        SELECT id, name_en, name_ko, description_en, description_ko,
               monster_type, behavior, stats, drop_items,
               respawn_time, is_alive, aggro_range, roaming_range,
               properties, x, y, faction_id, created_at
        FROM monsters
        WHERE id = @id
      `).get({ id }) as any | undefined;

      if (!row) return null;

      return {
        ...row,
        is_alive: Boolean(row.is_alive),
        stats: this.parseJsonField<Record<string, unknown>>(row.stats, {}),
        drop_items: this.parseJsonField<unknown[]>(row.drop_items, []),
        properties: this.parseJsonField<Record<string, unknown>>(row.properties, {}),
      };
    } catch (error) {
      logger.error('Failed to get monster by id', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 새 몬스터 생성
   * - UUID 생성
   * - 기본값: monster_type='passive', behavior='stationary', stats='{}',
   *   drop_items='[]', respawn_time=300, is_alive=true, aggro_range=1,
   *   roaming_range=2, properties='{}'
   * - stats, drop_items, properties: 객체/배열 → JSON 문자열로 저장
   */
  createMonster(data: CreateMonsterInput): Monster {
    const id = this.generateId();

    try {
      this.db.prepare(`
        INSERT INTO monsters (
          id, name_en, name_ko, description_en, description_ko,
          monster_type, behavior, stats, drop_items,
          respawn_time, is_alive, aggro_range, roaming_range,
          properties, x, y, faction_id
        ) VALUES (
          @id, @name_en, @name_ko, @description_en, @description_ko,
          @monster_type, @behavior, @stats, @drop_items,
          @respawn_time, @is_alive, @aggro_range, @roaming_range,
          @properties, @x, @y, @faction_id
        )
      `).run({
        id,
        name_en: data.name_en,
        name_ko: data.name_ko,
        description_en: data.description_en ?? null,
        description_ko: data.description_ko ?? null,
        monster_type: data.monster_type ?? 'passive',
        behavior: data.behavior ?? 'stationary',
        stats: JSON.stringify(data.stats ?? {}),
        drop_items: JSON.stringify(data.drop_items ?? []),
        respawn_time: data.respawn_time ?? 300,
        is_alive: 1,
        aggro_range: data.aggro_range ?? 1,
        roaming_range: data.roaming_range ?? 2,
        properties: JSON.stringify(data.properties ?? {}),
        x: data.x ?? null,
        y: data.y ?? null,
        faction_id: data.faction_id ?? null,
      });
    } catch (error) {
      logger.error('Failed to create monster', {
        name_en: data.name_en,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return this.getMonsterById(id) as Monster;
  }

  /**
   * 몬스터 수정 (전달된 필드만 업데이트)
   * - stats, drop_items, properties: 객체/배열 → JSON 문자열로 저장
   * - is_alive: boolean → 0/1 변환
   * - 없으면 null
   */
  updateMonster(id: string, data: UpdateMonsterInput): Monster | null {
    const existing = this.getMonsterById(id);
    if (!existing) return null;

    const allowedFields = [
      'name_en', 'name_ko', 'description_en', 'description_ko',
      'monster_type', 'behavior', 'stats', 'drop_items',
      'respawn_time', 'aggro_range', 'roaming_range',
      'properties', 'x', 'y', 'faction_id',
    ];

    // JSON 직렬화가 필요한 필드
    const jsonFields = ['stats', 'drop_items', 'properties'];

    const setClauses: string[] = [];
    const params: Record<string, unknown> = { id };

    for (const field of allowedFields) {
      if ((data as any)[field] !== undefined) {
        let value = (data as any)[field];
        // JSON 필드: 객체/배열 → JSON 문자열
        if (jsonFields.includes(field)) {
          value = JSON.stringify(value);
        }
        setClauses.push(`${field} = @${field}`);
        params[field] = value;
      }
    }

    // is_alive 별도 처리 (UpdateMonsterInput에는 없지만 확장 가능)
    if ('is_alive' in (data as any) && (data as any).is_alive !== undefined) {
      setClauses.push('is_alive = @is_alive');
      params.is_alive = (data as any).is_alive ? 1 : 0;
    }

    if (setClauses.length === 0) {
      return existing;
    }

    try {
      this.db.prepare(`
        UPDATE monsters SET ${setClauses.join(', ')} WHERE id = @id
      `).run(params);
    } catch (error) {
      logger.error('Failed to update monster', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return this.getMonsterById(id);
  }

  /**
   * 몬스터 삭제
   * 없으면 false
   */
  deleteMonster(id: string): boolean {
    const existing = this.db.prepare(
      'SELECT id FROM monsters WHERE id = @id',
    ).get({ id });

    if (!existing) return false;

    try {
      this.db.prepare('DELETE FROM monsters WHERE id = @id').run({ id });
      return true;
    } catch (error) {
      logger.error('Failed to delete monster', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // ── 게임 오브젝트 CRUD ──

  /**
   * 페이지네이션된 게임 오브젝트 목록 조회
   * 반환 필드: id, name_en, name_ko, location_type, location_id, category, equipment_slot
   */
  getGameObjects(page: number, limit: number): PaginatedResult<Pick<GameObject, 'id' | 'name_en' | 'name_ko' | 'location_type' | 'location_id' | 'category' | 'equipment_slot'>> {
    const countSql = 'SELECT COUNT(*) AS count FROM game_objects';
    const dataSql = `
      SELECT id, name_en, name_ko, location_type,
             location_id, category, equipment_slot
      FROM game_objects
      ORDER BY created_at DESC`;

    return this.paginate<Pick<GameObject, 'id' | 'name_en' | 'name_ko' | 'location_type' | 'location_id' | 'category' | 'equipment_slot'>>(
      countSql, dataSql, {}, page, limit,
    );
  }

  /**
   * 게임 오브젝트 상세 조회
   * 모든 필드 반환, properties JSON 파싱, is_equipped boolean 변환
   * 없으면 null
   */
  getGameObjectById(id: string): GameObject | null {
    try {
      const row = this.db.prepare(`
        SELECT id, name_en, name_ko, description_en, description_ko,
               location_type, location_id, properties,
               weight, max_stack, category, equipment_slot,
               is_equipped, created_at
        FROM game_objects
        WHERE id = @id
      `).get({ id }) as any | undefined;

      if (!row) return null;

      return {
        ...row,
        is_equipped: Boolean(row.is_equipped),
        properties: this.parseJsonField<Record<string, unknown>>(row.properties, {}),
      };
    } catch (error) {
      logger.error('Failed to get game object by id', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 새 게임 오브젝트 생성
   * - UUID 생성
   * - 기본값: properties='{}', weight=1.0, max_stack=1, category='misc', is_equipped=false
   * - properties: 객체 → JSON 문자열로 저장
   */
  createGameObject(data: CreateGameObjectInput): GameObject {
    const id = this.generateId();

    try {
      this.db.prepare(`
        INSERT INTO game_objects (
          id, name_en, name_ko, description_en, description_ko,
          location_type, location_id, properties,
          weight, max_stack, category, equipment_slot, is_equipped
        ) VALUES (
          @id, @name_en, @name_ko, @description_en, @description_ko,
          @location_type, @location_id, @properties,
          @weight, @max_stack, @category, @equipment_slot, @is_equipped
        )
      `).run({
        id,
        name_en: data.name_en,
        name_ko: data.name_ko,
        description_en: data.description_en ?? null,
        description_ko: data.description_ko ?? null,
        location_type: data.location_type,
        location_id: data.location_id ?? null,
        properties: JSON.stringify(data.properties ?? {}),
        weight: data.weight ?? 1.0,
        max_stack: data.max_stack ?? 1,
        category: data.category ?? 'misc',
        equipment_slot: data.equipment_slot ?? null,
        is_equipped: data.is_equipped ? 1 : 0,
      });
    } catch (error) {
      logger.error('Failed to create game object', {
        name_en: data.name_en,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return this.getGameObjectById(id) as GameObject;
  }

  /**
   * 게임 오브젝트 수정 (전달된 필드만 업데이트)
   * - properties: 객체 → JSON 문자열로 저장
   * - is_equipped: boolean → 0/1 변환
   * - 없으면 null
   */
  updateGameObject(id: string, data: UpdateGameObjectInput): GameObject | null {
    const existing = this.getGameObjectById(id);
    if (!existing) return null;

    const allowedFields = [
      'name_en', 'name_ko', 'description_en', 'description_ko',
      'location_type', 'location_id',
      'properties', 'weight', 'max_stack', 'category', 'equipment_slot',
    ];

    const setClauses: string[] = [];
    const params: Record<string, unknown> = { id };

    for (const field of allowedFields) {
      if ((data as any)[field] !== undefined) {
        let value = (data as any)[field];
        // properties: 객체 → JSON 문자열
        if (field === 'properties') {
          value = JSON.stringify(value);
        }
        setClauses.push(`${field} = @${field}`);
        params[field] = value;
      }
    }

    // is_equipped 별도 처리: boolean → 0/1 변환
    if (data.is_equipped !== undefined) {
      setClauses.push('is_equipped = @is_equipped');
      params.is_equipped = data.is_equipped ? 1 : 0;
    }

    if (setClauses.length === 0) {
      return existing;
    }

    try {
      this.db.prepare(`
        UPDATE game_objects SET ${setClauses.join(', ')} WHERE id = @id
      `).run(params);
    } catch (error) {
      logger.error('Failed to update game object', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return this.getGameObjectById(id);
  }

  /**
   * 게임 오브젝트 삭제
   * 없으면 false
   */
  deleteGameObject(id: string): boolean {
    const existing = this.db.prepare(
      'SELECT id FROM game_objects WHERE id = @id',
    ).get({ id });

    if (!existing) return false;

    try {
      this.db.prepare('DELETE FROM game_objects WHERE id = @id').run({ id });
      return true;
    } catch (error) {
      logger.error('Failed to delete game object', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
