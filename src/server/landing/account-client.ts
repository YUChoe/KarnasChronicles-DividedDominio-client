/**
 * MUD 서버 어드민 채널로 계정을 만드는 클라이언트.
 *
 * 서비스 주체로 인증하면 `account_create` 만 호출할 수 있다. 서비스 토큰은
 * 환경변수로만 주입하며 브라우저로 나가지 않는다.
 *
 * 요청마다 새 연결을 맺고 닫는다. 회원가입은 빈도가 낮아 연결 유지가 이득이
 * 없고, 상태를 갖지 않는 편이 단순하다.
 *
 * 프로토콜 계약: 서버 저장소 `docs/protocol/admin.md`
 */

import { TelnetClient } from '../telnet-client.js';
import { LineFramer } from '../line-framer.js';
import { logger } from '../logger.js';

/** 응답을 기다리는 상한 (밀리초) */
export const DEFAULT_TIMEOUT_MS = 8_000;

export interface AccountClientOptions {
  host: string;
  port: number;
  /** 서비스 토큰. `LANDING_SERVICE_TOKEN` 값이다. */
  token: string;
  /** 서버의 서비스 허용 목록에 있는 이름 */
  service?: string;
  timeoutMs?: number;
}

export interface AccountRequest {
  username: string;
  password: string;
  email?: string;
  preferredLocale?: string;
}

export type AccountOutcome =
  | { ok: true; playerId: string }
  /** 서버가 판정한 실패. `USERNAME_TAKEN`, `VALIDATION_FAILED`, `INTERNAL_ERROR` */
  | { ok: false; reasonCode: string }
  /** 서버에 닿지 못했거나 규약과 다른 응답을 받았다 */
  | { ok: false; reasonCode: 'UPSTREAM_UNAVAILABLE'; detail: string };

export class AccountClient {
  private readonly host: string;
  private readonly port: number;
  private readonly token: string;
  private readonly service: string;
  private readonly timeoutMs: number;

  constructor(options: AccountClientOptions) {
    this.host = options.host;
    this.port = options.port;
    this.token = options.token;
    this.service = options.service ?? 'landing';
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async createAccount(request: AccountRequest): Promise<AccountOutcome> {
    const session = new AdminSession(this.host, this.port, this.timeoutMs);

    try {
      await session.open();
      await session.expect('welcome');

      const authenticated = await session.request(1, {
        type: 'service_login',
        service: this.service,
        token: this.token
      }, 'service_login_result');

      if (authenticated.success !== true) {
        // 토큰 불일치는 배포 설정 문제다. 사용자에게 알릴 내용이 아니다
        logger.error('Landing service login rejected', {
          service: this.service,
          reasonCode: authenticated.reason_code
        });
        return {
          ok: false,
          reasonCode: 'UPSTREAM_UNAVAILABLE',
          detail: 'service login rejected'
        };
      }

      // 비밀번호는 여기서만 다루고 어디에도 기록하지 않는다
      const created = await session.request(2, {
        type: 'account_create',
        username: request.username,
        password: request.password,
        ...(request.email !== undefined && request.email.length > 0
          ? { email: request.email }
          : {}),
        ...(request.preferredLocale !== undefined &&
        request.preferredLocale.length > 0
          ? { preferred_locale: request.preferredLocale }
          : {})
      }, 'account_create_result');

      if (created.success === true && typeof created.player_id === 'string') {
        logger.info('Account created', { username: request.username });
        return { ok: true, playerId: created.player_id };
      }

      const reasonCode =
        typeof created.reason_code === 'string'
          ? created.reason_code
          : 'INTERNAL_ERROR';

      logger.warn('Account creation rejected', {
        username: request.username,
        reasonCode
      });
      return { ok: false, reasonCode };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      logger.error('Account creation failed', {
        username: request.username,
        detail
      });
      return { ok: false, reasonCode: 'UPSTREAM_UNAVAILABLE', detail };
    } finally {
      session.close();
    }
  }
}

type Frame = Record<string, unknown> & { type?: unknown };

/**
 * 어드민 채널 한 번의 왕복을 다루는 세션.
 *
 * 라인 프레이밍은 게이트웨이와 같은 `LineFramer` 를 쓴다. 어드민 채널은 IAC
 * 협상을 하지 않으므로 텔넷 명령 필터는 필요하지 않다.
 */
class AdminSession {
  private readonly client: TelnetClient;
  private readonly framer = new LineFramer();
  private readonly pending: Frame[] = [];
  private waiter: (() => void) | null = null;
  private failure: Error | null = null;
  private closed = false;

  constructor(
    host: string,
    port: number,
    private readonly timeoutMs: number
  ) {
    this.client = new TelnetClient(host, port);
  }

  async open(): Promise<void> {
    this.client.onData((chunk: Buffer) => {
      try {
        for (const line of this.framer.push(chunk)) {
          const parsed: unknown = JSON.parse(line);
          if (parsed !== null && typeof parsed === 'object') {
            this.pending.push(parsed as Frame);
          }
        }
      } catch (error) {
        this.failure =
          error instanceof Error ? error : new Error(String(error));
      }
      this.wake();
    });

    this.client.onClose(() => {
      this.closed = true;
      this.wake();
    });

    this.client.onError((error: Error) => {
      this.failure = error;
      this.wake();
    });

    await this.client.connect();
  }

  /** 메시지를 보내고 같은 `seq` 의 응답을 기다린다. */
  async request(
    seq: number,
    message: Record<string, unknown>,
    expectedType: string
  ): Promise<Frame> {
    this.client.sendLine(JSON.stringify({ ...message, seq }));
    return this.expect(expectedType, seq);
  }

  /**
   * 기대한 타입의 프레임이 올 때까지 기다린다.
   *
   * 그 사이의 다른 프레임은 버린다. 어드민 채널은 요청과 무관한 통보를 보낼 수
   * 있고 이 클라이언트는 계정 생성 결과만 필요하다.
   */
  async expect(type: string, seq?: number): Promise<Frame> {
    const deadline = Date.now() + this.timeoutMs;

    for (;;) {
      if (this.failure !== null) {
        throw this.failure;
      }

      const index = this.pending.findIndex(
        (frame) =>
          frame.type === type && (seq === undefined || frame.seq === seq)
      );

      if (index !== -1) {
        return this.pending.splice(index, 1)[0];
      }

      // 거절 응답은 기대한 타입으로 오지 않는다. 기다리다 시간을 버리지 않는다
      const rejected = this.pending.find(
        (frame) => frame.type === 'admin_rejected'
      );
      if (rejected !== undefined) {
        throw new Error(
          `admin_rejected: ${String(rejected.reason_code ?? 'unknown')}`
        );
      }

      if (this.closed) {
        throw new Error(`connection closed before ${type}`);
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`timed out waiting for ${type}`);
      }

      await this.sleep(remaining);
    }
  }

  close(): void {
    this.client.disconnect();
  }

  /** 프레임이 오거나 시간이 다할 때까지 멈춘다. */
  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        resolve();
      }, Math.min(ms, 100));

      this.waiter = () => {
        clearTimeout(timer);
        this.waiter = null;
        resolve();
      };
    });
  }

  private wake(): void {
    if (this.waiter !== null) {
      this.waiter();
    }
  }
}
