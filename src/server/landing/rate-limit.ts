/**
 * IP 기준 슬라이딩 윈도우 요청 제한.
 *
 * 회원가입은 빈도가 낮은 요청이고 남용의 대가가 크다. 계정이 무제한으로 생기면
 * 서버의 세계 데이터가 오염된다.
 *
 * 상태를 프로세스 안에 둔다. 게이트웨이 인스턴스가 하나이고, 여러 대로 늘리면
 * 제한이 인스턴스 수만큼 느슨해진다. 그때는 공유 저장소가 필요하다.
 */

/** 기본 허용 횟수 */
export const DEFAULT_LIMIT = 5;

/** 기본 윈도우 (밀리초). 한 시간이다. */
export const DEFAULT_WINDOW_MS = 60 * 60 * 1000;

/**
 * 추적하는 IP 수 상한.
 *
 * 무제한으로 늘면 요청만으로 메모리를 소진시킬 수 있다. 상한에 닿으면 가장
 * 오래된 기록을 버린다. 버려진 IP 는 제한이 초기화되므로 상한을 넉넉히 둔다.
 */
export const MAX_TRACKED_ADDRESSES = 10_000;

export interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
  /** 시각 공급자. 테스트가 시간을 밀어 확인한다. */
  now?: () => number;
}

export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  /** IP → 윈도우 안의 요청 시각. 삽입 순서를 오래된 순으로 유지한다. */
  private readonly hits = new Map<string, number[]>();

  constructor(options: RateLimitOptions = {}) {
    this.limit = options.limit ?? DEFAULT_LIMIT;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * 요청 하나를 기록하고 허용 여부를 돌려준다.
   *
   * 거절된 요청은 기록하지 않는다. 기록하면 윈도우가 끝없이 밀려 정상 사용자가
   * 실수로 연타했을 때 회복이 늦어진다.
   */
  allow(address: string): boolean {
    const current = this.now();
    const threshold = current - this.windowMs;

    const recent = (this.hits.get(address) ?? []).filter(
      (at) => at > threshold
    );

    if (recent.length >= this.limit) {
      this.hits.set(address, recent);
      return false;
    }

    recent.push(current);
    // 삽입 순서를 최근으로 옮겨 오래된 기록이 앞에 남게 한다
    this.hits.delete(address);
    this.hits.set(address, recent);

    this.evictOverflow();
    return true;
  }

  /** 남은 허용 횟수 (진단용) */
  remaining(address: string): number {
    const threshold = this.now() - this.windowMs;
    const recent = (this.hits.get(address) ?? []).filter(
      (at) => at > threshold
    );
    return Math.max(0, this.limit - recent.length);
  }

  /** 추적 중인 IP 수 (진단용) */
  get trackedCount(): number {
    return this.hits.size;
  }

  private evictOverflow(): void {
    while (this.hits.size > MAX_TRACKED_ADDRESSES) {
      const oldest = this.hits.keys().next();
      if (oldest.done === true) {
        return;
      }
      this.hits.delete(oldest.value);
    }
  }
}

/**
 * 요청자 IP 를 고른다.
 *
 * 리버스 프록시 뒤에 있으므로 nginx 가 설정하는 `X-Forwarded-For` 의 첫 항목을
 * 쓴다. 첫 항목이 원 요청자이고 뒤는 프록시 사슬이다. 헤더가 없으면 소켓
 * 주소를 쓴다. 게이트웨이를 직접 노출하면 이 헤더를 위조할 수 있으므로 배포는
 * nginx 만 게이트웨이에 닿게 해야 한다.
 */
export function clientAddress(
  forwardedFor: string | string[] | undefined,
  remoteAddress: string | undefined
): string {
  const header = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;

  if (typeof header === 'string' && header.length > 0) {
    const first = header.split(',')[0].trim();
    if (first.length > 0) {
      return first;
    }
  }

  return remoteAddress ?? 'unknown';
}
