/**
 * TCP 청크를 개행 경계로 복원하는 프레이머.
 *
 * TCP는 바이트 스트림이므로 청크 경계가 라인 경계와 무관하다. 개행을 찾은
 * 뒤에만 UTF-8 디코딩을 수행하여 멀티바이트 문자가 청크 경계에서 분할되어
 * 손상되는 것을 막는다. 연결마다 하나의 인스턴스를 보유한다.
 */

/** 개행 (LF) */
const LF = 0x0a;

/** 캐리지 리턴 (CR) */
const CR = 0x0d;

/** 기본 라인 길이 상한 (256KB) */
export const DEFAULT_MAX_LINE_BYTES = 256 * 1024;

/**
 * 라인 길이가 상한을 초과했을 때 발생한다.
 * 프로토콜 위반이거나 악의적 입력이므로 연결을 종료해야 한다.
 */
export class LineTooLongError extends Error {
  constructor(
    public readonly bytes: number,
    public readonly limit: number
  ) {
    super(`Line exceeds ${limit} bytes (got ${bytes})`);
    this.name = 'LineTooLongError';
  }
}

export class LineFramer {
  private buffer: Buffer = Buffer.alloc(0);
  private readonly maxLineBytes: number;

  constructor(maxLineBytes: number = DEFAULT_MAX_LINE_BYTES) {
    this.maxLineBytes = maxLineBytes;
  }

  /**
   * 청크를 누적하고 완성된 라인들을 반환한다.
   * 개행이 오지 않은 미완성 라인은 다음 호출까지 보관한다.
   * 빈 라인은 버려서 빈 프레임이 클라이언트로 가지 않게 한다.
   *
   * @throws {LineTooLongError} 라인이 상한을 초과한 경우
   */
  push(chunk: Buffer): string[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const lines: string[] = [];

    let index: number;
    while ((index = this.buffer.indexOf(LF)) !== -1) {
      const raw = this.buffer.subarray(0, index);
      this.buffer = this.buffer.subarray(index + 1);

      // 완성된 라인도 상한을 검사한다. 이 검사가 없으면 같은 입력이
      // 청크 분할 방식에 따라 다르게 처리된다.
      if (raw.length > this.maxLineBytes) {
        throw new LineTooLongError(raw.length, this.maxLineBytes);
      }

      // 개행 직전 CR 제거 (서버가 \r\n을 보내는 경우에 대한 방어)
      const line =
        raw.length > 0 && raw[raw.length - 1] === CR
          ? raw.subarray(0, raw.length - 1)
          : raw;

      if (line.length > 0) {
        lines.push(line.toString('utf-8'));
      }
    }

    // 미완성 라인이 이미 상한을 넘었다면 개행을 더 기다릴 이유가 없다
    if (this.buffer.length > this.maxLineBytes) {
      throw new LineTooLongError(this.buffer.length, this.maxLineBytes);
    }

    return lines;
  }

  /** 아직 개행이 오지 않아 보관 중인 바이트 수 (진단용) */
  get pendingBytes(): number {
    return this.buffer.length;
  }
}
