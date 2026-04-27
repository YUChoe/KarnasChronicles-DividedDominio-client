/**
 * 관리자 인증 모듈
 * 환경 변수 기반 단일 관리자 계정 인증 및 세션 관리
 */

import crypto from 'crypto';
import { logger } from '../logger';

/** 세션 만료 시간: 24시간 (밀리초) */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** 세션 쿠키 이름 */
const COOKIE_NAME = 'webadmin_session';

export interface Session {
  id: string;
  createdAt: number;
  expiresAt: number;
}

export class AuthModule {
  private readonly username: string;
  private readonly password: string;
  private readonly sessions: Map<string, Session> = new Map();

  constructor() {
    this.username = process.env.WEBADMIN_USERNAME || 'admin';
    this.password = process.env.WEBADMIN_PASSWORD || 'admin';
  }

  /**
   * 로그인 처리: 자격 증명 검증 후 세션 생성
   */
  login(username: string, password: string): Session | null {
    if (username !== this.username || password !== this.password) {
      logger.warn('Admin login failed', { username });
      return null;
    }

    const now = Date.now();
    const session: Session = {
      id: crypto.randomUUID(),
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    };

    this.sessions.set(session.id, session);
    logger.info('Admin login successful', { username });
    return session;
  }

  /**
   * 로그아웃 처리: 세션 무효화
   */
  logout(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * 세션 유효성 검증
   * 만료된 세션은 자동 삭제 후 false 반환
   */
  validateSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return false;
    }

    return true;
  }

  /**
   * 쿠키 헤더에서 세션 ID 추출
   */
  getSessionFromCookie(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) {
      return null;
    }

    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const [name, ...rest] = cookie.trim().split('=');
      if (name === COOKIE_NAME) {
        const value = rest.join('=').trim();
        return value || null;
      }
    }

    return null;
  }

  /**
   * 세션 쿠키 설정 문자열 생성
   */
  createSessionCookie(sessionId: string): string {
    return `${COOKIE_NAME}=${sessionId}; HttpOnly; Path=/webadmin; SameSite=Strict`;
  }

  /**
   * 세션 쿠키 삭제 문자열 생성 (로그아웃 시 사용)
   */
  createClearCookie(): string {
    return `${COOKIE_NAME}=; HttpOnly; Path=/webadmin; SameSite=Strict; Max-Age=0`;
  }
}
