/**
 * 랜딩 사이트의 규칙 검증
 *
 * 회원가입 입력 검증, IP 기준 요청 제한, 정적 경로 해석을 확인한다. 순수 함수와
 * 자료구조만 다루므로 서버를 띄우지 않는다.
 */

import path from 'path';
import { describe, expect, it } from 'vitest';
import { requestPath, resolveStaticPath } from '../landing/router';
import { RateLimiter, clientAddress } from '../landing/rate-limit';
import { readRegistrationInput, validateRegistration } from '../landing/validate';

const STATIC_ROOT = path.resolve('src/server/public');

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    username: 'newplayer',
    password: 'longenough',
    passwordConfirm: 'longenough',
    ...overrides
  };
}

describe('회원가입 입력 검증', () => {
  it('올바른 입력을 통과시킨다', () => {
    const input = readRegistrationInput(validInput());
    expect(validateRegistration(input)).toBeNull();
  });

  it('빈 사용자명을 거절한다', () => {
    const input = readRegistrationInput(validInput({ username: '  ' }));
    expect(validateRegistration(input)).toEqual({
      field: 'username',
      rule: 'required'
    });
  });

  it('사용자명 길이를 확인한다', () => {
    for (const username of ['ab', 'a'.repeat(21)]) {
      const input = readRegistrationInput(validInput({ username }));
      expect(validateRegistration(input)).toEqual({
        field: 'username',
        rule: 'length'
      });
    }
  });

  it('사용자명에 한국어를 허용하지 않는다', () => {
    // 키보드 배열이 다른 환경에서 자기 계정에 접속할 수 없는 경우를 막는다
    const input = readRegistrationInput(validInput({ username: '새플레이어' }));
    expect(validateRegistration(input)).toEqual({
      field: 'username',
      rule: 'charset'
    });
  });

  it('짧은 비밀번호를 거절한다', () => {
    const input = readRegistrationInput(
      validInput({ password: 'short12', passwordConfirm: 'short12' })
    );
    expect(validateRegistration(input)).toEqual({
      field: 'password',
      rule: 'length'
    });
  });

  it('72바이트를 넘는 비밀번호를 거절한다', () => {
    // bcrypt 가 조용히 잘라내므로 잘린 뒷부분이 인증에 영향을 주지 않게 막는다
    const password = '가'.repeat(25); // 75바이트
    const input = readRegistrationInput(
      validInput({ password, passwordConfirm: password })
    );
    expect(validateRegistration(input)).toEqual({
      field: 'password',
      rule: 'bytes'
    });
  });

  it('비밀번호 확인 불일치를 거절한다', () => {
    const input = readRegistrationInput(
      validInput({ passwordConfirm: 'longenoughX' })
    );
    expect(validateRegistration(input)).toEqual({
      field: 'passwordConfirm',
      rule: 'mismatch'
    });
  });

  it('이메일은 선택 항목이다', () => {
    const input = readRegistrationInput(validInput({ email: '' }));
    expect(validateRegistration(input)).toBeNull();
  });

  it('이메일 형식과 길이를 확인한다', () => {
    expect(
      validateRegistration(readRegistrationInput(validInput({ email: 'nope' })))
    ).toEqual({ field: 'email', rule: 'format' });

    const long = 'a'.repeat(250) + '@example.com';
    expect(
      validateRegistration(readRegistrationInput(validInput({ email: long })))
    ).toEqual({ field: 'email', rule: 'length' });
  });

  it('지원하지 않는 locale 을 거절한다', () => {
    const input = readRegistrationInput(validInput({ preferredLocale: 'fr' }));
    expect(validateRegistration(input)).toEqual({
      field: 'preferredLocale',
      rule: 'unsupported'
    });
  });

  it('문자열이 아닌 값은 빈 값으로 읽는다', () => {
    const input = readRegistrationInput({ username: 42, password: null });
    expect(input.username).toBe('');
    expect(validateRegistration(input)).toEqual({
      field: 'username',
      rule: 'required'
    });
  });
});

describe('요청 제한', () => {
  it('상한까지 허용하고 그 뒤를 거절한다', () => {
    const limiter = new RateLimiter({ limit: 3, windowMs: 1000 });
    expect([1, 2, 3].map(() => limiter.allow('10.0.0.1'))).toEqual([
      true,
      true,
      true
    ]);
    expect(limiter.allow('10.0.0.1')).toBe(false);
    expect(limiter.remaining('10.0.0.1')).toBe(0);
  });

  it('IP 마다 따로 센다', () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.allow('10.0.0.1')).toBe(true);
    expect(limiter.allow('10.0.0.2')).toBe(true);
    expect(limiter.allow('10.0.0.1')).toBe(false);
  });

  it('윈도우가 지나면 다시 허용한다', () => {
    let now = 0;
    const limiter = new RateLimiter({
      limit: 1,
      windowMs: 1000,
      now: () => now
    });

    expect(limiter.allow('10.0.0.1')).toBe(true);
    now = 999;
    expect(limiter.allow('10.0.0.1')).toBe(false);
    now = 1001;
    expect(limiter.allow('10.0.0.1')).toBe(true);
  });

  it('거절된 요청은 윈도우를 밀지 않는다', () => {
    let now = 0;
    const limiter = new RateLimiter({
      limit: 1,
      windowMs: 1000,
      now: () => now
    });

    limiter.allow('10.0.0.1');
    now = 500;
    limiter.allow('10.0.0.1'); // 거절
    now = 1001;
    expect(limiter.allow('10.0.0.1')).toBe(true);
  });

  it('X-Forwarded-For 의 첫 항목을 요청자로 본다', () => {
    expect(clientAddress('203.0.113.9, 10.0.0.1', '127.0.0.1')).toBe(
      '203.0.113.9'
    );
    expect(clientAddress(undefined, '127.0.0.1')).toBe('127.0.0.1');
    expect(clientAddress('', '127.0.0.1')).toBe('127.0.0.1');
    expect(clientAddress(undefined, undefined)).toBe('unknown');
  });
});

describe('정적 경로 해석', () => {
  it('루트 요청을 index.html 로 바꾼다', () => {
    expect(resolveStaticPath(STATIC_ROOT, '/')).toBe(
      path.join(STATIC_ROOT, 'index.html')
    );
  });

  it('루트 밖으로 나가는 경로를 거절한다', () => {
    for (const url of [
      '/../package.json',
      '/../../etc/passwd',
      '/%2e%2e/package.json',
      '/style.css/../../package.json'
    ]) {
      expect(resolveStaticPath(STATIC_ROOT, url)).toBeNull();
    }
  });

  it('널 바이트와 깨진 인코딩을 거절한다', () => {
    expect(resolveStaticPath(STATIC_ROOT, '/style.css\0.txt')).toBeNull();
    expect(resolveStaticPath(STATIC_ROOT, '/%zz')).toBeNull();
  });

  it('쿼리와 프래그먼트를 떼어 낸다', () => {
    expect(requestPath('/api/register?a=1')).toBe('/api/register');
    expect(requestPath('/index.html#top')).toBe('/index.html');
    expect(requestPath(undefined)).toBe('/');
  });
});
