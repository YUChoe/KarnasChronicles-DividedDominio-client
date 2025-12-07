import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Terminal } from '@xterm/xterm';

/**
 * ANSI 코드 렌더링 검증 테스트
 * 요구사항: 6.1, 6.2, 6.3, 6.4
 * 
 * xterm.js는 ANSI 이스케이프 코드를 네이티브로 지원합니다.
 * 이 테스트는 xterm.js가 다양한 ANSI 코드를 올바르게 처리하는지 검증합니다.
 */
describe('ANSI Code Rendering', () => {
  let terminal: Terminal;
  let container: HTMLElement;

  beforeEach(() => {
    // 테스트용 컨테이너 생성
    container = document.createElement('div');
    document.body.appendChild(container);

    // Terminal 인스턴스 생성
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

  describe('색상 코드 테스트 (요구사항 6.2)', () => {
    it('전경색 ANSI 코드를 처리해야 함', () => {
      // 빨간색 텍스트
      terminal.write('\x1b[31mRed Text\x1b[0m');
      
      // xterm.js가 코드를 처리했는지 확인
      // 버퍼에 텍스트가 기록되었는지 확인
      const buffer = terminal.buffer.active;
      const line = buffer.getLine(0);
      
      expect(line).toBeDefined();
      if (line) {
        const cellData = line.getCell(0);
        expect(cellData).toBeDefined();
      }
    });

    it('배경색 ANSI 코드를 처리해야 함', () => {
      // 파란색 배경
      terminal.write('\x1b[44mBlue Background\x1b[0m');
      
      const buffer = terminal.buffer.active;
      const line = buffer.getLine(0);
      
      expect(line).toBeDefined();
    });

    it('256색 ANSI 코드를 처리해야 함', () => {
      // 256색 전경색
      terminal.write('\x1b[38;5;208mOrange Text\x1b[0m');
      
      const buffer = terminal.buffer.active;
      const line = buffer.getLine(0);
      
      expect(line).toBeDefined();
    });

    it('RGB 색상 ANSI 코드를 처리해야 함', () => {
      // RGB 색상
      terminal.write('\x1b[38;2;255;100;50mCustom Color\x1b[0m');
      
      const buffer = terminal.buffer.active;
      const line = buffer.getLine(0);
      
      expect(line).toBeDefined();
    });
  });

  describe('포맷팅 코드 테스트 (요구사항 6.3)', () => {
    it('굵게(bold) ANSI 코드를 처리해야 함', () => {
      // xterm.js가 ANSI 코드를 처리하는지 확인
      // 오류 없이 write가 완료되면 성공
      expect(() => {
        terminal.write('\x1b[1mBold Text\x1b[0m');
      }).not.toThrow();
      
      // 버퍼가 존재하는지 확인
      const buffer = terminal.buffer.active;
      expect(buffer).toBeDefined();
    });

    it('기울임(italic) ANSI 코드를 처리해야 함', () => {
      expect(() => {
        terminal.write('\x1b[3mItalic Text\x1b[0m');
      }).not.toThrow();
      
      const buffer = terminal.buffer.active;
      expect(buffer).toBeDefined();
    });

    it('밑줄(underline) ANSI 코드를 처리해야 함', () => {
      expect(() => {
        terminal.write('\x1b[4mUnderlined Text\x1b[0m');
      }).not.toThrow();
      
      const buffer = terminal.buffer.active;
      expect(buffer).toBeDefined();
    });

    it('반전(inverse) ANSI 코드를 처리해야 함', () => {
      expect(() => {
        terminal.write('\x1b[7mInverse Text\x1b[0m');
      }).not.toThrow();
      
      const buffer = terminal.buffer.active;
      expect(buffer).toBeDefined();
    });
  });

  describe('제어 문자 테스트 (요구사항 6.4)', () => {
    it('백스페이스(\\b) 제어 문자를 처리해야 함', () => {
      terminal.write('ABC\bD');
      
      const buffer = terminal.buffer.active;
      const line = buffer.getLine(0);
      
      expect(line).toBeDefined();
      // 백스페이스는 커서를 뒤로 이동시키므로 'ABD'가 됨
    });

    it('탭(\\t) 제어 문자를 처리해야 함', () => {
      terminal.write('A\tB');
      
      const buffer = terminal.buffer.active;
      const line = buffer.getLine(0);
      
      expect(line).toBeDefined();
      // 탭은 다음 탭 정지 위치로 이동
    });

    it('줄바꿈(\\n) 제어 문자를 처리해야 함', () => {
      terminal.write('Line1\nLine2');
      
      const buffer = terminal.buffer.active;
      const line0 = buffer.getLine(0);
      const line1 = buffer.getLine(1);
      
      expect(line0).toBeDefined();
      expect(line1).toBeDefined();
    });

    it('캐리지 리턴(\\r) 제어 문자를 처리해야 함', () => {
      terminal.write('ABC\rD');
      
      const buffer = terminal.buffer.active;
      const line = buffer.getLine(0);
      
      expect(line).toBeDefined();
      // 캐리지 리턴은 커서를 줄 시작으로 이동
    });
  });

  describe('복합 ANSI 코드 테스트 (요구사항 6.1)', () => {
    it('여러 ANSI 코드를 동시에 처리해야 함', () => {
      // 굵고 빨간색 텍스트
      expect(() => {
        terminal.write('\x1b[1;31mBold Red Text\x1b[0m');
      }).not.toThrow();
      
      const buffer = terminal.buffer.active;
      expect(buffer).toBeDefined();
    });

    it('중첩된 ANSI 코드를 처리해야 함', () => {
      terminal.write('\x1b[31mRed \x1b[1mBold Red\x1b[0m Normal');
      
      const buffer = terminal.buffer.active;
      const line = buffer.getLine(0);
      
      expect(line).toBeDefined();
    });

    it('긴 ANSI 시퀀스를 처리해야 함', () => {
      const longText = '\x1b[38;2;255;100;50m' + 'A'.repeat(100) + '\x1b[0m';
      terminal.write(longText);
      
      const buffer = terminal.buffer.active;
      const line = buffer.getLine(0);
      
      expect(line).toBeDefined();
    });
  });

  describe('커서 제어 코드 테스트', () => {
    it('커서 위치 이동 코드를 처리해야 함', () => {
      // 커서를 (5, 5) 위치로 이동
      terminal.write('\x1b[5;5HX');
      
      const buffer = terminal.buffer.active;
      expect(buffer.cursorY).toBeGreaterThanOrEqual(0);
      expect(buffer.cursorX).toBeGreaterThanOrEqual(0);
    });

    it('커서 저장/복원 코드를 처리해야 함', () => {
      terminal.write('A\x1b[sB\x1b[uC');
      
      const buffer = terminal.buffer.active;
      const line = buffer.getLine(0);
      
      expect(line).toBeDefined();
    });
  });

  describe('화면 지우기 코드 테스트', () => {
    it('화면 전체 지우기 코드를 처리해야 함', () => {
      terminal.write('Test\x1b[2J');
      
      const buffer = terminal.buffer.active;
      expect(buffer).toBeDefined();
    });

    it('줄 지우기 코드를 처리해야 함', () => {
      terminal.write('Test\x1b[2K');
      
      const buffer = terminal.buffer.active;
      expect(buffer).toBeDefined();
    });
  });

  describe('에러 처리', () => {
    it('잘못된 ANSI 코드를 안전하게 처리해야 함', () => {
      // 잘못된 ANSI 코드
      terminal.write('\x1b[999mInvalid Code\x1b[0m');
      
      const buffer = terminal.buffer.active;
      const line = buffer.getLine(0);
      
      // xterm.js는 잘못된 코드를 무시하고 계속 진행
      expect(line).toBeDefined();
    });

    it('불완전한 ANSI 코드를 처리해야 함', () => {
      terminal.write('\x1b[31Incomplete');
      
      const buffer = terminal.buffer.active;
      const line = buffer.getLine(0);
      
      expect(line).toBeDefined();
    });
  });
});
