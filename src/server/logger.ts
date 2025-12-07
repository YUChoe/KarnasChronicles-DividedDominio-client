import winston from 'winston';

// 커스텀 포맷터
const customFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  const date = new Date(timestamp as string);
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  const time = date.toTimeString().split(' ')[0];
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${time}.${ms} ${level.toUpperCase()} ${message}${metaStr}`;
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
