import winston from 'winston';
import path from 'path';

// 호출 스택에서 파일명과 라인 번호 추출
function getCallerInfo(): string {
  const stack = new Error().stack;
  if (!stack) return '';
  
  const lines = stack.split('\n');
  // 3번째 라인이 실제 호출자 (0: Error, 1: getCallerInfo, 2: format, 3: 실제 호출자)
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    // logger.ts가 아닌 첫 번째 파일을 찾음
    if (!line.includes('logger.ts') && !line.includes('node_modules')) {
      const match = line.match(/\((.+):(\d+):\d+\)/);
      if (match) {
        const filename = path.basename(match[1]);
        const lineNumber = match[2];
        return `[${filename}:${lineNumber}]`;
      }
      // Windows 경로 형식도 처리
      const winMatch = line.match(/at .+ \((.+):(\d+):\d+\)/);
      if (winMatch) {
        const filename = path.basename(winMatch[1]);
        const lineNumber = winMatch[2];
        return `[${filename}:${lineNumber}]`;
      }
    }
  }
  return '';
}

// 커스텀 포맷터
const customFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  const date = new Date(timestamp as string);
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  const time = date.toTimeString().split(' ')[0];
  const location = getCallerInfo();
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${time}.${ms} ${level.toUpperCase()} ${location} ${message}${metaStr}`;
});

// 로거 생성
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    customFormat
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      )
    })
  ]
});

// 개발 환경에서는 더 상세한 로그
if (process.env.NODE_ENV !== 'production') {
  logger.level = 'debug';
}
