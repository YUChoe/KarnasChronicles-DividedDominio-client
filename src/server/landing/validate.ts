/**
 * 회원가입 입력 검증.
 *
 * 브라우저와 게이트웨이가 같은 규칙을 쓰고 최종 판정은 MUD 서버가 한다.
 * 사용자명 중복은 DB 조회가 필요해 서버만 판단할 수 있다.
 *
 * 규칙의 출처는 서버 계약(`docs/protocol/admin.md` 계정 생성)이다. 여기서 먼저
 * 걸러내는 것은 왕복을 줄이려는 것이지 판정을 대신하려는 것이 아니다.
 */

/** 사용자명 길이 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** 비밀번호 길이. 상한은 bcrypt 가 72바이트를 넘는 입력을 잘라내기 때문이다. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX_BYTES = 72;

/** 이메일 길이 상한 */
export const EMAIL_MAX = 254;

/** 지원 locale. 서버 계약과 같다. */
export const LOCALES = ['en', 'ko'] as const;

/** 영문, 숫자, 밑줄만. 로그인 식별자이므로 한국어를 허용하지 않는다. */
const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;

/** 형식만 본다. 도달 가능성은 검증하지 않는다. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 검증에 실패한 항목. 브라우저가 어느 칸을 고칠지 알아야 한다. */
export type RegistrationField =
  | 'username'
  | 'password'
  | 'passwordConfirm'
  | 'email'
  | 'preferredLocale';

export interface RegistrationInput {
  username: string;
  password: string;
  passwordConfirm: string;
  email?: string;
  preferredLocale?: string;
}

export type ValidationFailure = { field: RegistrationField; rule: string };

/**
 * 임의의 JSON 본문에서 회원가입 입력을 뽑는다.
 *
 * 문자열이 아닌 값은 빈 문자열로 둔다. 그러면 필수 항목 검사가 걸러낸다.
 */
export function readRegistrationInput(body: unknown): RegistrationInput {
  const record = (body ?? {}) as Record<string, unknown>;
  const text = (value: unknown): string =>
    typeof value === 'string' ? value : '';

  return {
    username: text(record.username).trim(),
    password: text(record.password),
    passwordConfirm: text(record.passwordConfirm),
    email: text(record.email).trim(),
    preferredLocale: text(record.preferredLocale).trim()
  };
}

/** 첫 번째 위반을 돌려준다. 통과하면 null 이다. */
export function validateRegistration(
  input: RegistrationInput
): ValidationFailure | null {
  if (input.username.length === 0) {
    return { field: 'username', rule: 'required' };
  }
  if (
    input.username.length < USERNAME_MIN ||
    input.username.length > USERNAME_MAX
  ) {
    return { field: 'username', rule: 'length' };
  }
  if (!USERNAME_PATTERN.test(input.username)) {
    return { field: 'username', rule: 'charset' };
  }

  if (input.password.length === 0) {
    return { field: 'password', rule: 'required' };
  }
  if (input.password.length < PASSWORD_MIN) {
    return { field: 'password', rule: 'length' };
  }
  if (Buffer.byteLength(input.password, 'utf-8') > PASSWORD_MAX_BYTES) {
    return { field: 'password', rule: 'bytes' };
  }

  if (input.password !== input.passwordConfirm) {
    return { field: 'passwordConfirm', rule: 'mismatch' };
  }

  // 이메일은 선택 항목이다. 비어 있으면 검사하지 않는다
  if (input.email !== undefined && input.email.length > 0) {
    if (input.email.length > EMAIL_MAX) {
      return { field: 'email', rule: 'length' };
    }
    if (!EMAIL_PATTERN.test(input.email)) {
      return { field: 'email', rule: 'format' };
    }
  }

  if (input.preferredLocale !== undefined && input.preferredLocale.length > 0) {
    if (!LOCALES.includes(input.preferredLocale as (typeof LOCALES)[number])) {
      return { field: 'preferredLocale', rule: 'unsupported' };
    }
  }

  return null;
}
