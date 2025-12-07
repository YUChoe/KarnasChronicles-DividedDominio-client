import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  sanitizeServerData,
  containsDangerousPatterns,
  sanitize
} from '../sanitizer';

/**
 * Feature: browser-telnet-terminal, Property 8: XSS 방지
 * Validates: Requirements 6.5
 * 
 * 속성: 모든 서버로부터 수신된 텍스트에 대해,
 * Terminal Client는 렌더링 전에 XSS 공격을 방지하기 위해 이를 정제해야 합니다.
 */
describe('Property 8: XSS 방지', () => {
  // 위험한 이스케이프 시퀀스 생성기
  const dangerousOscArb = fc.oneof(
    // OSC with BEL terminator
    fc.tuple(fc.string(), fc.string()).map(([cmd, text]) => `\x1b]${cmd};${text}\x07`),
    // OSC with ST terminator
    fc.tuple(fc.string(), fc.string()).map(([cmd, text]) => `\x1b]${cmd};${text}\x1b\\`)
  );

  const dangerousDcsArb = fc.string().map(s => `\x1bP${s}\x1b\\`);
  const dangerousApcArb = fc.string().map(s => `\x1b_${s}\x1b\\`);
  const dangerousPmArb = fc.string().map(s => `\x1b^${s}\x1b\\`);

  const dangerousSequenceArb = fc.oneof(
    dangerousOscArb,
    dangerousDcsArb,
    dangerousApcArb,
    dangerousPmArb
  );

  // 안전한 ANSI CSI 시퀀스 생성기
  const safeAnsiArb = fc.oneof(
    fc.integer({ min: 0, max: 107 }).map(n => `\x1b[${n}m`),
    fc.tuple(
      fc.integer({ min: 0, max: 9 }),
      fc.integer({ min: 0, max: 107 })
    ).map(([a, b]) => `\x1b[${a};${b}m`)
  );

  // 일반 텍스트 생성기
  const printableTextArb = fc.string({
    minLength: 0,
    maxLength: 100
  });

  it('속성: 모든 위험한 OSC 시퀀스는 제거되어야 함', () => {
    fc.assert(
      fc.property(dangerousOscArb, printableTextArb, (osc, text) => {
        const input = `${text}${osc}${text}`;
        const sanitized = sanitize(input);
        
        // OSC 시퀀스가 제거되어야 함
        expect(sanitized).not.toContain('\x1b]');
        
        // 일반 텍스트는 유지되어야 함
        if (text.length > 0) {
          expect(sanitized).toContain(text);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('속성: 모든 위험한 DCS 시퀀스는 제거되어야 함', () => {
    fc.assert(
      fc.property(dangerousDcsArb, printableTextArb, (dcs, text) => {
        const input = `${text}${dcs}${text}`;
        const sanitized = sanitize(input);
        
        // DCS 시퀀스가 제거되어야 함
        expect(sanitized).not.toContain('\x1bP');
      }),
      { numRuns: 100 }
    );
  });

  it('속성: 모든 위험한 APC 시퀀스는 제거되어야 함', () => {
    fc.assert(
      fc.property(dangerousApcArb, printableTextArb, (apc, text) => {
        const input = `${text}${apc}${text}`;
        const sanitized = sanitize(input);
        
        // APC 시퀀스가 제거되어야 함
        expect(sanitized).not.toContain('\x1b_');
      }),
      { numRuns: 100 }
    );
  });

  it('속성: 모든 위험한 PM 시퀀스는 제거되어야 함', () => {
    fc.assert(
      fc.property(dangerousPmArb, printableTextArb, (pm, text) => {
        const input = `${text}${pm}${text}`;
        const sanitized = sanitize(input);
        
        // PM 시퀀스가 제거되어야 함
        expect(sanitized).not.toContain('\x1b^');
      }),
      { numRuns: 100 }
    );
  });

  it('속성: 모든 안전한 ANSI CSI 시퀀스는 유지되어야 함', () => {
    fc.assert(
      fc.property(safeAnsiArb, printableTextArb, (ansi, text) => {
        const input = `${ansi}${text}\x1b[0m`;
        const sanitized = sanitize(input);
        
        // 안전한 ANSI 시퀀스는 유지되어야 함
        expect(sanitized).toBe(input);
      }),
      { numRuns: 100 }
    );
  });

  it('속성: 위험한 시퀀스와 안전한 시퀀스가 혼합된 경우 위험한 것만 제거되어야 함', () => {
    fc.assert(
      fc.property(
        safeAnsiArb,
        dangerousSequenceArb,
        printableTextArb,
        (safe, dangerous, text) => {
          const input = `${safe}${text}${dangerous}${text}\x1b[0m`;
          const sanitized = sanitize(input);
          
          // 안전한 ANSI는 유지
          expect(sanitized).toContain(safe);
          expect(sanitized).toContain('\x1b[0m');
          
          // 위험한 시퀀스는 제거
          expect(containsDangerousPatterns(sanitized)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('속성: 여러 위험한 시퀀스가 연속으로 나타나도 모두 제거되어야 함', () => {
    fc.assert(
      fc.property(
        fc.array(dangerousSequenceArb, { minLength: 1, maxLength: 10 }),
        printableTextArb,
        (dangerousSeqs, text) => {
          const input = dangerousSeqs.join('') + text;
          const sanitized = sanitize(input);
          
          // 모든 위험한 시퀀스가 제거되어야 함
          expect(containsDangerousPatterns(sanitized)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('속성: 정제 후 데이터는 항상 위험한 패턴을 포함하지 않아야 함', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(safeAnsiArb, dangerousSequenceArb, printableTextArb),
          { minLength: 1, maxLength: 20 }
        ),
        (parts) => {
          const input = parts.join('');
          const sanitized = sanitize(input);
          
          // 정제 후에는 위험한 패턴이 없어야 함
          expect(containsDangerousPatterns(sanitized)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('속성: 정제는 멱등성을 가져야 함 (여러 번 적용해도 같은 결과)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(safeAnsiArb, dangerousSequenceArb, printableTextArb),
          { minLength: 1, maxLength: 10 }
        ),
        (parts) => {
          const input = parts.join('');
          const sanitized1 = sanitize(input);
          const sanitized2 = sanitize(sanitized1);
          const sanitized3 = sanitize(sanitized2);
          
          // 여러 번 정제해도 같은 결과
          expect(sanitized1).toBe(sanitized2);
          expect(sanitized2).toBe(sanitized3);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('속성: 빈 문자열과 매우 긴 문자열도 안전하게 처리되어야 함', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          fc.string({ minLength: 0, maxLength: 10000 })
        ),
        (text) => {
          // 오류 없이 처리되어야 함
          expect(() => {
            const sanitized = sanitize(text);
            expect(sanitized).toBeDefined();
          }).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('속성: 실제 공격 벡터 - 터미널 제목 변경', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (maliciousTitle) => {
          // OSC 0: 터미널 제목 변경 시도
          const attack = `\x1b]0;${maliciousTitle}\x07`;
          const sanitized = sanitize(attack);
          
          // 공격이 제거되어야 함
          expect(sanitized).not.toContain('\x1b]');
          expect(sanitized).not.toContain(maliciousTitle);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('속성: 실제 공격 벡터 - 하이퍼링크 주입', () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.string({ minLength: 1, maxLength: 50 }),
        (url, linkText) => {
          // OSC 8: 하이퍼링크 주입 시도
          const attack = `\x1b]8;;${url}\x07${linkText}\x1b]8;;\x07`;
          const sanitized = sanitize(attack);
          
          // 하이퍼링크가 제거되어야 함
          expect(sanitized).not.toContain('\x1b]8');
          // URL이 제거되어야 함
          expect(sanitized).not.toContain(url);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('속성: 정제 후 길이는 원본보다 작거나 같아야 함', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(safeAnsiArb, dangerousSequenceArb, printableTextArb),
          { minLength: 1, maxLength: 20 }
        ),
        (parts) => {
          const input = parts.join('');
          const sanitized = sanitize(input);
          
          // 정제 후 길이는 원본보다 작거나 같아야 함
          expect(sanitized.length).toBeLessThanOrEqual(input.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('속성: 정제는 일반 텍스트를 변경하지 않아야 함', () => {
    fc.assert(
      fc.property(
        fc.string({
          minLength: 0,
          maxLength: 1000
        }).filter(s => !s.includes('\x1b')), // 이스케이프 시퀀스 없는 텍스트
        (text) => {
          const sanitized = sanitize(text);
          
          // 일반 텍스트는 그대로 유지
          expect(sanitized).toBe(text);
        }
      ),
      { numRuns: 100 }
    );
  });
});
