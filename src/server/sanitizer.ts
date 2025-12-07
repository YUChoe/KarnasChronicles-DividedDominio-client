/**
 * 서버 데이터 정제 모듈
 * XSS 공격을 방지하기 위한 데이터 검증 및 정제
 * 요구사항: 6.5
 */

/**
 * 위험한 제어 문자 패턴
 * OSC (Operating System Command) 시퀀스 등 잠재적으로 위험한 시퀀스를 필터링
 */
const DANGEROUS_PATTERNS = [
  // OSC (Operating System Command) - 일부 터미널에서 임의 명령 실행 가능
  /\x1b\].*?\x07/g,
  /\x1b\].*?\x1b\\/g,
  // DCS (Device Control String) - 장치 제어 명령
  /\x1bP.*?\x1b\\/g,
  // APC (Application Program Command)
  /\x1b_.*?\x1b\\/g,
  // PM (Privacy Message)
  /\x1b\^.*?\x1b\\/g,
];

/**
 * 허용된 ANSI 이스케이프 시퀀스 패턴
 * CSI (Control Sequence Introducer) 시퀀스만 허용
 */
const ALLOWED_ANSI_PATTERN = /\x1b\[[0-9;]*[A-Za-z]/g;

/**
 * 텔넷 서버로부터 받은 데이터를 정제합니다.
 * 
 * @param data - 원본 데이터
 * @returns 정제된 데이터
 */
export function sanitizeServerData(data: string): string {
  // 위험한 제어 시퀀스 제거
  let sanitized = data;
  
  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  return sanitized;
}

/**
 * 데이터에 위험한 패턴이 포함되어 있는지 검사합니다.
 * 
 * @param data - 검사할 데이터
 * @returns 위험한 패턴이 발견되면 true
 */
export function containsDangerousPatterns(data: string): boolean {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(data)) {
      return true;
    }
  }
  return false;
}

/**
 * ANSI 이스케이프 코드만 포함하는지 검증합니다.
 * 
 * @param data - 검증할 데이터
 * @returns 안전한 ANSI 코드만 포함하면 true
 */
export function isValidAnsiData(data: string): boolean {
  // 이스케이프 시퀀스를 제외한 부분 추출
  const withoutAnsi = data.replace(ALLOWED_ANSI_PATTERN, '');
  
  // 남은 부분에 다른 이스케이프 시퀀스가 있는지 확인
  const hasOtherEscapes = /\x1b/.test(withoutAnsi);
  
  return !hasOtherEscapes;
}

/**
 * 데이터 길이를 제한합니다.
 * 
 * @param data - 원본 데이터
 * @param maxLength - 최대 길이 (기본값: 10MB)
 * @returns 제한된 데이터
 */
export function limitDataLength(data: string, maxLength: number = 10 * 1024 * 1024): string {
  if (data.length > maxLength) {
    return data.substring(0, maxLength);
  }
  return data;
}

/**
 * 줄바꿈 문자를 정규화합니다.
 * 텔넷 프로토콜에서는 CR(\r)과 LF(\n)를 모두 줄바꿈으로 처리합니다.
 * 
 * @param data - 원본 데이터
 * @returns 정규화된 데이터
 */
export function normalizeLineEndings(data: string): string {
  // CR+LF (\r\n)는 LF(\n)로 변환
  // 단독 CR(\r)도 LF(\n)로 변환 (텔넷 서버에서 CR만 보내는 경우)
  return data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * 종합적인 데이터 정제 함수
 * 
 * @param data - 원본 데이터
 * @returns 정제된 안전한 데이터
 */
export function sanitize(data: string): string {
  // 1. 길이 제한
  let sanitized = limitDataLength(data);
  
  // 2. 위험한 패턴 제거
  sanitized = sanitizeServerData(sanitized);
  
  // 3. 줄바꿈 정규화 (CR을 LF로 변환)
  sanitized = normalizeLineEndings(sanitized);
  
  return sanitized;
}
