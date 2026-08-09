import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  LineFramer,
  LineTooLongError,
  DEFAULT_MAX_LINE_BYTES
} from '../line-framer';

/**
 * 버퍼를 주어진 크기 목록에 따라 청크로 쪼갠다.
 * TCP가 임의 지점에서 데이터를 분할하는 상황을 재현한다.
 */
function splitBuffer(buf: Buffer, sizes: number[]): Buffer[] {
  const chunks: Buffer[] = [];
  let offset = 0;

  for (const size of sizes) {
    if (offset >= buf.length) {
      break;
    }
    const end = Math.min(offset + Math.max(1, size), buf.length);
    chunks.push(buf.subarray(offset, end));
    offset = end;
  }

  if (offset < buf.length) {
    chunks.push(buf.subarray(offset));
  }

  return chunks;
}

/** 청크들을 순서대로 프레이머에 넣고 나온 라인을 모두 모은다 */
function pushAll(framer: LineFramer, chunks: Buffer[]): string[] {
  return chunks.flatMap((chunk) => framer.push(chunk));
}

/** 개행과 CR을 포함하지 않는 비어 있지 않은 문자열 */
const lineArbitrary = fc
  .fullUnicodeString({ minLength: 1, maxLength: 40 })
  .filter((s) => !s.includes('\n') && !s.includes('\r'));

describe('LineFramer', () => {
  describe('기본 동작', () => {
    it('한 청크에 담긴 여러 라인을 분리한다', () => {
      const framer = new LineFramer();
      const lines = framer.push(Buffer.from('first\nsecond\nthird\n', 'utf-8'));

      expect(lines).toEqual(['first', 'second', 'third']);
    });

    it('개행이 없으면 라인을 내보내지 않고 보관한다', () => {
      const framer = new LineFramer();

      expect(framer.push(Buffer.from('incomplete', 'utf-8'))).toEqual([]);
      expect(framer.pendingBytes).toBe(10);
    });

    it('여러 청크에 걸친 라인을 개행 도착 시점에 완성한다', () => {
      const framer = new LineFramer();

      expect(framer.push(Buffer.from('{"type":', 'utf-8'))).toEqual([]);
      expect(framer.push(Buffer.from('"room_info"}', 'utf-8'))).toEqual([]);
      expect(framer.push(Buffer.from('\n', 'utf-8'))).toEqual([
        '{"type":"room_info"}'
      ]);
      expect(framer.pendingBytes).toBe(0);
    });

    it('개행 직전 CR을 제거한다', () => {
      const framer = new LineFramer();

      expect(framer.push(Buffer.from('alpha\r\nbeta\r\n', 'utf-8'))).toEqual([
        'alpha',
        'beta'
      ]);
    });

    it('라인 중간의 CR은 보존한다', () => {
      const framer = new LineFramer();

      expect(framer.push(Buffer.from('al\rpha\n', 'utf-8'))).toEqual(['al\rpha']);
    });

    it('빈 라인을 버린다', () => {
      const framer = new LineFramer();

      expect(framer.push(Buffer.from('\n\n\nalpha\n\n\n', 'utf-8'))).toEqual([
        'alpha'
      ]);
    });

    it('CR만 있는 라인도 빈 라인으로 취급해 버린다', () => {
      const framer = new LineFramer();

      expect(framer.push(Buffer.from('\r\n\r\n', 'utf-8'))).toEqual([]);
    });

    it('빈 청크를 넣어도 상태가 변하지 않는다', () => {
      const framer = new LineFramer();

      framer.push(Buffer.from('partial', 'utf-8'));
      expect(framer.push(Buffer.alloc(0))).toEqual([]);
      expect(framer.pendingBytes).toBe(7);
    });
  });

  describe('멀티바이트 경계', () => {
    it('한국어를 1바이트씩 넣어도 손상되지 않는다', () => {
      const original = '카르나스 연대기: 분할된 지배권';
      const buf = Buffer.from(original + '\n', 'utf-8');
      const framer = new LineFramer();
      const collected: string[] = [];

      for (let i = 0; i < buf.length; i++) {
        collected.push(...framer.push(buf.subarray(i, i + 1)));
      }

      expect(collected).toEqual([original]);
      expect(collected[0]).not.toContain('\uFFFD');
    });

    it('한국어가 담긴 JSON 라인을 왕복한다', () => {
      const payload = {
        type: 'room_info',
        name: '재의 성채 남문',
        description: '무너진 성벽 사이로 회색 먼지가 흩날렸다.'
      };
      const buf = Buffer.from(JSON.stringify(payload) + '\n', 'utf-8');
      const framer = new LineFramer();
      const collected: string[] = [];

      // 3바이트씩 넣어 한글(UTF-8 3바이트) 경계와 어긋나게 만든다
      for (let i = 0; i < buf.length; i += 3) {
        collected.push(...framer.push(buf.subarray(i, i + 3)));
      }

      expect(collected).toHaveLength(1);
      expect(JSON.parse(collected[0])).toEqual(payload);
    });

    it('4바이트 문자(이모지)가 경계에서 분할되어도 복원된다', () => {
      const original = 'a😀b🗡️c';
      const buf = Buffer.from(original + '\n', 'utf-8');
      const framer = new LineFramer();
      const collected: string[] = [];

      for (let i = 0; i < buf.length; i += 2) {
        collected.push(...framer.push(buf.subarray(i, i + 2)));
      }

      expect(collected).toEqual([original]);
    });
  });

  describe('길이 상한', () => {
    it('미완성 라인이 상한을 넘으면 예외를 던진다', () => {
      const framer = new LineFramer(16);

      expect(() => framer.push(Buffer.alloc(17, 0x41))).toThrow(LineTooLongError);
    });

    it('완성된 라인이 상한을 넘어도 예외를 던진다', () => {
      const framer = new LineFramer(16);
      const chunk = Buffer.concat([Buffer.alloc(17, 0x41), Buffer.from('\n')]);

      expect(() => framer.push(chunk)).toThrow(LineTooLongError);
    });

    it('상한과 같은 길이는 통과한다', () => {
      const framer = new LineFramer(16);
      const chunk = Buffer.concat([Buffer.alloc(16, 0x41), Buffer.from('\n')]);

      expect(framer.push(chunk)).toEqual(['A'.repeat(16)]);
    });

    it('예외에 실제 길이와 상한을 담는다', () => {
      const framer = new LineFramer(16);

      try {
        framer.push(Buffer.alloc(20, 0x41));
        expect.unreachable('예외가 발생해야 한다');
      } catch (error) {
        expect(error).toBeInstanceOf(LineTooLongError);
        expect((error as LineTooLongError).bytes).toBe(20);
        expect((error as LineTooLongError).limit).toBe(16);
      }
    });

    it('기본 상한은 256KB다', () => {
      expect(DEFAULT_MAX_LINE_BYTES).toBe(256 * 1024);
    });

    it('상한 초과 판정이 청크 분할 방식과 무관하다', () => {
      const oversized = Buffer.concat([Buffer.alloc(20, 0x41), Buffer.from('\n')]);

      // 한 번에 넣기
      expect(() => new LineFramer(16).push(oversized)).toThrow(LineTooLongError);

      // 1바이트씩 넣기
      expect(() => {
        const framer = new LineFramer(16);
        for (let i = 0; i < oversized.length; i++) {
          framer.push(oversized.subarray(i, i + 1));
        }
      }).toThrow(LineTooLongError);
    });
  });

  describe('속성 테스트', () => {
    it('임의의 분할 지점에서도 원본 라인이 복원된다', () => {
      fc.assert(
        fc.property(
          fc.array(lineArbitrary, { minLength: 1, maxLength: 12 }),
          fc.array(fc.integer({ min: 1, max: 8 }), { maxLength: 60 }),
          (lines, sizes) => {
            const buf = Buffer.from(lines.map((l) => l + '\n').join(''), 'utf-8');
            const framer = new LineFramer();

            expect(pushAll(framer, splitBuffer(buf, sizes))).toEqual(lines);
            expect(framer.pendingBytes).toBe(0);
          }
        )
      );
    });

    it('분할 방식이 달라도 결과가 같다', () => {
      fc.assert(
        fc.property(
          fc.array(lineArbitrary, { minLength: 1, maxLength: 12 }),
          fc.array(fc.integer({ min: 1, max: 8 }), { maxLength: 60 }),
          fc.array(fc.integer({ min: 1, max: 8 }), { maxLength: 60 }),
          (lines, sizesA, sizesB) => {
            const buf = Buffer.from(lines.map((l) => l + '\n').join(''), 'utf-8');

            const resultA = pushAll(new LineFramer(), splitBuffer(buf, sizesA));
            const resultB = pushAll(new LineFramer(), splitBuffer(buf, sizesB));

            expect(resultA).toEqual(resultB);
          }
        )
      );
    });

    it('미완성 라인은 보관되고 개행이 오면 완성된다', () => {
      fc.assert(
        fc.property(
          fc.array(lineArbitrary, { minLength: 1, maxLength: 8 }),
          lineArbitrary,
          fc.array(fc.integer({ min: 1, max: 8 }), { maxLength: 60 }),
          (complete, trailing, sizes) => {
            const text = complete.map((l) => l + '\n').join('') + trailing;
            const buf = Buffer.from(text, 'utf-8');
            const framer = new LineFramer();

            expect(pushAll(framer, splitBuffer(buf, sizes))).toEqual(complete);
            expect(framer.pendingBytes).toBe(Buffer.byteLength(trailing, 'utf-8'));
            expect(framer.push(Buffer.from('\n'))).toEqual([trailing]);
          }
        )
      );
    });

    it('CRLF로 구분된 라인도 원본이 복원된다', () => {
      fc.assert(
        fc.property(
          fc.array(lineArbitrary, { minLength: 1, maxLength: 12 }),
          fc.array(fc.integer({ min: 1, max: 8 }), { maxLength: 60 }),
          (lines, sizes) => {
            const buf = Buffer.from(
              lines.map((l) => l + '\r\n').join(''),
              'utf-8'
            );

            expect(pushAll(new LineFramer(), splitBuffer(buf, sizes))).toEqual(
              lines
            );
          }
        )
      );
    });

    it('JSON 라인이 파싱 가능한 상태로 복원된다', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              type: fc.constantFrom('room_info', 'combat_update', 'chat'),
              text: fc.fullUnicodeString({ maxLength: 30 })
            }),
            { minLength: 1, maxLength: 8 }
          ),
          fc.array(fc.integer({ min: 1, max: 8 }), { maxLength: 60 }),
          (payloads, sizes) => {
            const buf = Buffer.from(
              payloads.map((p) => JSON.stringify(p) + '\n').join(''),
              'utf-8'
            );

            const lines = pushAll(new LineFramer(), splitBuffer(buf, sizes));

            expect(lines.map((l) => JSON.parse(l))).toEqual(payloads);
          }
        )
      );
    });
  });
});
