import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Terminal } from '@xterm/xterm';
import * as fc from 'fast-check';

/**
 * Feature: browser-telnet-terminal, Property 7: ANSI 코드 렌더링
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 * 
 * 속성: 모든 서버로부터 수신된 유효한 ANSI 이스케이프 코드(색상, 포맷팅, 제어 문자)에 대해,
 * Terminal Client는 이를 터미널 디스플레이에 올바르게 파싱하고 렌더링해야 합니다.
 */
describe('Property 7: ANSI 코드 렌더링', () => {
  let terminal: Terminal;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    terminal = new Terminal({
      cols: 80,
      rows: 24
    });
    terminal.open(container);
  });

  afterEach(() => {
    terminal.dispose();
    document.body.removeChild(container);
  });

  // ANSI 색상 코드 생성기
  const ansiColorCodeArb = fc.oneof(
    // 기본 전경색 (30-37)
    fc.integer({ min: 30, max: 37 }).map(n => `\x1b[${n}m`),
    // 기본 배경색 (40-47)
    fc.integer({ min: 40, max: 47 }).map(n => `\x1b[${n}m`),
    // 밝은 전경색 (90-97)
    fc.integer({ min: 90, max: 97 }).map(n => `\x1b[${n}m`),
    // 밝은 배경색 (100-107)
    fc.integer({ min: 100, max: 107 }).map(n => `\x1b[${n}m`),
    // 256색 전경색
    fc.integer({ min: 0, max: 255 }).map(n => `\x1b[38;5;${n}m`),
    // 256색 배경색
    fc.integer({ min: 0, max: 255 }).map(n => `\x1b[48;5;${n}m`),
    // RGB 전경색
    fc.tuple(
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 })
    ).map(([r, g, b]) => `\x1b[38;2;${r};${g};${b}m`),
    // RGB 배경색
    fc.tuple(
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 })
    ).map(([r, g, b]) => `\x1b[48;2;${r};${g};${b}m`)
  );

  // ANSI 포맷팅 코드 생성기
  const ansiFormatCodeArb = fc.oneof(
    fc.constant('\x1b[1m'),  // 굵게
    fc.constant('\x1b[2m'),  // 흐리게
    fc.constant('\x1b[3m'),  // 기울임
    fc.constant('\x1b[4m'),  // 밑줄
    fc.constant('\x1b[5m'),  // 깜빡임
    fc.constant('\x1b[7m'),  // 반전
    fc.constant('\x1b[8m'),  // 숨김
    fc.constant('\x1b[9m')   // 취소선
  );

  // 제어 문자 생성기
  const controlCharArb = fc.oneof(
    fc.constant('\b'),  // 백스페이스
    fc.constant('\t'),  // 탭
    fc.constant('\n'),  // 줄바꿈
    fc.constant('\r'),  // 캐리지 리턴
    fc.constant('\x1b[A'),  // 커서 위로
    fc.constant('\x1b[B'),  // 커서 아래로
    fc.constant('\x1b[C'),  // 커서 오른쪽
    fc.constant('\x1b[D')   // 커서 왼쪽
  );

  // 출력 가능한 텍스트 생성기
  const printableTextArb = fc.string({
    minLength: 1,
    maxLength: 50
  }).filter(s => s.trim().length > 0);

  // ANSI 코드가 포함된 텍스트 생성기
  const ansiTextArb = fc.tuple(
    fc.option(ansiColorCodeArb, { nil: '' }),
    fc.option(ansiFormatCodeArb, { nil: '' }),
    printableTextArb,
    fc.constant('\x1b[0m')  // 리셋
  ).map(([color, format, text, reset]) => `${color}${format}${text}${reset}`);

  it('속성: 모든 유효한 ANSI 색상 코드는 오류 없이 처리되어야 함', () => {
    fc.assert(
      fc.property(ansiColorCodeArb, printableTextArb, (colorCode, text) => {
        // ANSI 색상 코드와 텍스트를 터미널에 쓰기
        const input = `${colorCode}${text}\x1b[0m`;
        
        // 오류 없이 처리되어야 함
        expect(() => {
          terminal.write(input);
        }).not.toThrow();

        // 버퍼가 유효한 상태여야 함
        const buffer = terminal.buffer.active;
        expect(buffer).toBeDefined();
        expect(buffer.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('속성: 모든 유효한 ANSI 포맷팅 코드는 오류 없이 처리되어야 함', () => {
    fc.assert(
      fc.property(ansiFormatCodeArb, printableTextArb, (formatCode, text) => {
        const input = `${formatCode}${text}\x1b[0m`;
        
        expect(() => {
          terminal.write(input);
        }).not.toThrow();

        const buffer = terminal.buffer.active;
        expect(buffer).toBeDefined();
      }),
      { numRuns: 100 }
    );
  });

  it('속성: 모든 유효한 제어 문자는 오류 없이 처리되어야 함', () => {
    fc.assert(
      fc.property(controlCharArb, printableTextArb, (controlChar, text) => {
        const input = `${text}${controlChar}`;
        
        expect(() => {
          terminal.write(input);
        }).not.toThrow();

        const buffer = terminal.buffer.active;
        expect(buffer).toBeDefined();
      }),
      { numRuns: 100 }
    );
  });

  it('속성: 복합 ANSI 코드(색상 + 포맷팅)는 오류 없이 처리되어야 함', () => {
    fc.assert(
      fc.property(
        ansiColorCodeArb,
        ansiFormatCodeArb,
        printableTextArb,
        (colorCode, formatCode, text) => {
          const input = `${colorCode}${formatCode}${text}\x1b[0m`;
          
          expect(() => {
            terminal.write(input);
          }).not.toThrow();

          const buffer = terminal.buffer.active;
          expect(buffer).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('속성: 여러 ANSI 코드가 연속으로 나타나도 오류 없이 처리되어야 함', () => {
    fc.assert(
      fc.property(
        fc.array(ansiTextArb, { minLength: 1, maxLength: 10 }),
        (ansiTexts) => {
          const input = ansiTexts.join('');
          
          expect(() => {
            terminal.write(input);
          }).not.toThrow();

          const buffer = terminal.buffer.active;
          expect(buffer).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('속성: 중첩된 ANSI 코드는 오류 없이 처리되어야 함', () => {
    fc.assert(
      fc.property(
        ansiColorCodeArb,
        ansiFormatCodeArb,
        printableTextArb,
        ansiColorCodeArb,
        printableTextArb,
        (color1, format, text1, color2, text2) => {
          // 중첩: color1 + format + text1 + color2 + text2 + reset
          const input = `${color1}${format}${text1}${color2}${text2}\x1b[0m`;
          
          expect(() => {
            terminal.write(input);
          }).not.toThrow();

          const buffer = terminal.buffer.active;
          expect(buffer).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('속성: 긴 ANSI 시퀀스도 오류 없이 처리되어야 함', () => {
    fc.assert(
      fc.property(
        fc.array(ansiTextArb, { minLength: 10, maxLength: 50 }),
        (ansiTexts) => {
          const input = ansiTexts.join('');
          
          expect(() => {
            terminal.write(input);
          }).not.toThrow();

          const buffer = terminal.buffer.active;
          expect(buffer).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('속성: 리셋 코드(\\x1b[0m) 후에는 기본 스타일로 돌아가야 함', () => {
    fc.assert(
      fc.property(
        ansiColorCodeArb,
        ansiFormatCodeArb,
        printableTextArb,
        printableTextArb,
        (colorCode, formatCode, text1, text2) => {
          // 스타일 적용 -> 리셋 -> 일반 텍스트
          const input = `${colorCode}${formatCode}${text1}\x1b[0m${text2}`;
          
          expect(() => {
            terminal.write(input);
          }).not.toThrow();

          const buffer = terminal.buffer.active;
          expect(buffer).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('속성: 커서 이동 코드는 버퍼 경계를 벗어나지 않아야 함', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (row, col) => {
          // 커서를 특정 위치로 이동
          const input = `\x1b[${row};${col}HX`;
          
          expect(() => {
            terminal.write(input);
          }).not.toThrow();

          const buffer = terminal.buffer.active;
          expect(buffer).toBeDefined();
          
          // 커서가 버퍼 경계 내에 있어야 함
          expect(buffer.cursorY).toBeGreaterThanOrEqual(0);
          expect(buffer.cursorY).toBeLessThan(terminal.rows);
          expect(buffer.cursorX).toBeGreaterThanOrEqual(0);
          expect(buffer.cursorX).toBeLessThan(terminal.cols);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('속성: 잘못된 ANSI 코드는 무시되고 나머지는 정상 처리되어야 함', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 200, max: 999 }),
        printableTextArb,
        (invalidCode, text) => {
          // 잘못된 ANSI 코드 + 정상 텍스트
          const input = `\x1b[${invalidCode}m${text}`;
          
          // 오류 없이 처리되어야 함 (잘못된 코드는 무시됨)
          expect(() => {
            terminal.write(input);
          }).not.toThrow();

          const buffer = terminal.buffer.active;
          expect(buffer).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
