import { describe, it, expect } from 'vitest';
import {
  sanitizeServerData,
  containsDangerousPatterns,
  isValidAnsiData,
  limitDataLength,
  sanitize,
  normalizeLineEndings
} from '../sanitizer';

/**
 * XSS 방지 테스트
 * 요구사항: 6.5
 */
describe('Sanitizer - XSS 방지', () => {
  describe('sanitizeServerData', () => {
    it('OSC 시퀀스를 제거해야 함', () => {
      const dangerous = 'Hello\x1b]0;Title\x07World';
      const sanitized = sanitizeServerData(dangerous);
      
      expect(sanitized).toBe('HelloWorld');
      expect(sanitized).not.toContain('\x1b]');
    });

    it('DCS 시퀀스를 제거해야 함', () => {
      const dangerous = 'Test\x1bP+q436f\x1b\\Data';
      const sanitized = sanitizeServerData(dangerous);
      
      expect(sanitized).toBe('TestData');
      expect(sanitized).not.toContain('\x1bP');
    });

    it('APC 시퀀스를 제거해야 함', () => {
      const dangerous = 'Before\x1b_malicious\x1b\\After';
      const sanitized = sanitizeServerData(dangerous);
      
      expect(sanitized).toBe('BeforeAfter');
      expect(sanitized).not.toContain('\x1b_');
    });

    it('PM 시퀀스를 제거해야 함', () => {
      const dangerous = 'Start\x1b^private\x1b\\End';
      const sanitized = sanitizeServerData(dangerous);
      
      expect(sanitized).toBe('StartEnd');
      expect(sanitized).not.toContain('\x1b^');
    });

    it('안전한 ANSI CSI 시퀀스는 유지해야 함', () => {
      const safe = '\x1b[31mRed Text\x1b[0m';
      const sanitized = sanitizeServerData(safe);
      
      expect(sanitized).toBe(safe);
    });

    it('여러 위험한 시퀀스를 동시에 제거해야 함', () => {
      const dangerous = 'A\x1b]0;Title\x07B\x1bP+q\x1b\\C\x1b_test\x1b\\D';
      const sanitized = sanitizeServerData(dangerous);
      
      expect(sanitized).toBe('ABCD');
    });
  });

  describe('containsDangerousPatterns', () => {
    it('OSC 시퀀스를 감지해야 함', () => {
      expect(containsDangerousPatterns('\x1b]0;Title\x07')).toBe(true);
      expect(containsDangerousPatterns('\x1b]2;Window\x1b\\')).toBe(true);
    });

    it('DCS 시퀀스를 감지해야 함', () => {
      expect(containsDangerousPatterns('\x1bP+q436f\x1b\\')).toBe(true);
    });

    it('APC 시퀀스를 감지해야 함', () => {
      expect(containsDangerousPatterns('\x1b_malicious\x1b\\')).toBe(true);
    });

    it('PM 시퀀스를 감지해야 함', () => {
      expect(containsDangerousPatterns('\x1b^private\x1b\\')).toBe(true);
    });

    it('안전한 데이터는 false를 반환해야 함', () => {
      expect(containsDangerousPatterns('Normal text')).toBe(false);
      expect(containsDangerousPatterns('\x1b[31mRed\x1b[0m')).toBe(false);
    });
  });

  describe('isValidAnsiData', () => {
    it('안전한 ANSI CSI 시퀀스는 유효해야 함', () => {
      expect(isValidAnsiData('\x1b[31m')).toBe(true);
      expect(isValidAnsiData('\x1b[1;31m')).toBe(true);
      expect(isValidAnsiData('\x1b[0m')).toBe(true);
    });

    it('일반 텍스트는 유효해야 함', () => {
      expect(isValidAnsiData('Hello World')).toBe(true);
    });

    it('OSC 시퀀스는 무효해야 함', () => {
      expect(isValidAnsiData('\x1b]0;Title\x07')).toBe(false);
    });

    it('DCS 시퀀스는 무효해야 함', () => {
      expect(isValidAnsiData('\x1bP+q\x1b\\')).toBe(false);
    });
  });

  describe('limitDataLength', () => {
    it('짧은 데이터는 그대로 반환해야 함', () => {
      const data = 'Short text';
      expect(limitDataLength(data, 100)).toBe(data);
    });

    it('긴 데이터는 잘라야 함', () => {
      const data = 'A'.repeat(1000);
      const limited = limitDataLength(data, 100);
      
      expect(limited.length).toBe(100);
      expect(limited).toBe('A'.repeat(100));
    });

    it('기본 제한은 10MB여야 함', () => {
      const data = 'A'.repeat(100);
      const limited = limitDataLength(data);
      
      expect(limited).toBe(data);
    });
  });

  describe('normalizeLineEndings', () => {
    it('CR+LF를 LF로 변환해야 함', () => {
      const data = 'Line1\r\nLine2\r\nLine3';
      const normalized = normalizeLineEndings(data);
      
      expect(normalized).toBe('Line1\nLine2\nLine3');
      expect(normalized).not.toContain('\r');
    });

    it('단독 CR을 LF로 변환해야 함', () => {
      const data = 'Line1\rLine2\rLine3';
      const normalized = normalizeLineEndings(data);
      
      expect(normalized).toBe('Line1\nLine2\nLine3');
      expect(normalized).not.toContain('\r');
    });

    it('단독 LF는 그대로 유지해야 함', () => {
      const data = 'Line1\nLine2\nLine3';
      const normalized = normalizeLineEndings(data);
      
      expect(normalized).toBe(data);
    });

    it('혼합된 줄바꿈을 모두 LF로 변환해야 함', () => {
      const data = 'Line1\r\nLine2\rLine3\nLine4';
      const normalized = normalizeLineEndings(data);
      
      expect(normalized).toBe('Line1\nLine2\nLine3\nLine4');
      expect(normalized).not.toContain('\r');
    });
  });

  describe('sanitize (종합)', () => {
    it('위험한 패턴을 제거하고 길이를 제한해야 함', () => {
      const dangerous = 'A'.repeat(200) + '\x1b]0;Title\x07' + 'B'.repeat(200);
      const sanitized = sanitize(dangerous);
      
      // 위험한 패턴이 제거되어야 함
      expect(sanitized).not.toContain('\x1b]');
      
      // 길이가 제한되어야 함 (기본 10MB 이하)
      expect(sanitized.length).toBeLessThanOrEqual(10 * 1024 * 1024);
    });

    it('안전한 ANSI 코드는 유지해야 함', () => {
      const safe = '\x1b[31mRed\x1b[0m \x1b[1mBold\x1b[0m';
      const sanitized = sanitize(safe);
      
      expect(sanitized).toBe(safe);
    });

    it('빈 문자열을 안전하게 처리해야 함', () => {
      expect(sanitize('')).toBe('');
    });

    it('null 바이트를 포함한 데이터를 처리해야 함', () => {
      const data = 'Hello\x00World';
      const sanitized = sanitize(data);
      
      // null 바이트는 유지되지만 위험하지 않음
      expect(sanitized).toBe(data);
    });

    it('줄바꿈 문자를 정규화해야 함', () => {
      const data = 'Line1\r\nLine2\rLine3\nLine4';
      const sanitized = sanitize(data);
      
      // 모든 줄바꿈이 LF로 변환되어야 함
      expect(sanitized).toBe('Line1\nLine2\nLine3\nLine4');
      expect(sanitized).not.toContain('\r');
    });

    it('ANSI 코드와 줄바꿈이 혼합된 데이터를 처리해야 함', () => {
      const data = '\x1b[31mRed\r\nText\x1b[0m\rMore\nText';
      const sanitized = sanitize(data);
      
      // ANSI 코드는 유지되고 줄바꿈은 정규화되어야 함
      expect(sanitized).toContain('\x1b[31m');
      expect(sanitized).toContain('\x1b[0m');
      expect(sanitized).not.toContain('\r');
      expect(sanitized).toBe('\x1b[31mRed\nText\x1b[0m\nMore\nText');
    });
  });

  describe('실제 공격 시나리오', () => {
    it('터미널 제목 변경 공격을 방어해야 함', () => {
      const attack = '\x1b]0;Malicious Title\x07';
      const sanitized = sanitize(attack);
      
      expect(sanitized).not.toContain('\x1b]');
      expect(sanitized).not.toContain('Malicious');
    });

    it('하이퍼링크 주입 공격을 방어해야 함', () => {
      const attack = '\x1b]8;;http://malicious.com\x07Click here\x1b]8;;\x07';
      const sanitized = sanitize(attack);
      
      expect(sanitized).not.toContain('http://malicious.com');
    });

    it('복합 공격을 방어해야 함', () => {
      const attack = 'Normal\x1b]0;Title\x07\x1bP+q\x1b\\\x1b_test\x1b\\Text';
      const sanitized = sanitize(attack);
      
      expect(sanitized).toBe('NormalText');
    });

    it('ANSI 코드와 혼합된 공격을 방어해야 함', () => {
      const attack = '\x1b[31mRed\x1b]0;Bad\x07\x1b[0m';
      const sanitized = sanitize(attack);
      
      // 안전한 ANSI는 유지
      expect(sanitized).toContain('\x1b[31m');
      expect(sanitized).toContain('\x1b[0m');
      
      // 위험한 OSC는 제거
      expect(sanitized).not.toContain('\x1b]');
      expect(sanitized).not.toContain('Bad');
    });
  });
});
