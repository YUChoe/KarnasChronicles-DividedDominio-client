# 로깅 규칙 (Node.js/TypeScript)

## 기본 원칙

- **구조화된 로깅 라이브러리 사용**: winston, pino 권장
- **일관된 로그 형식**: 타임스탬프, 레벨, 파일 위치, 메시지
- **적절한 로그 레벨 사용**: error, warn, info, http, verbose, debug, silly
- **표준 출력 포맷**: `{시분초.ms} {LEVEL} [{filename.ts:line}] {logstring}`

## 로그 출력 포맷 규칙

**필수 포맷**: `{시분초.ms} {LEVEL} [{filename.ts:line}] {logstring}`

**예시 출력**:

```
14:23:45.123 INFO [gateway.ts:45] Client connected: ws-client-abc123
14:23:45.456 DEBUG [telnet.ts:123] Telnet connection established to localhost:4000
14:23:45.789 ERROR [connection.ts:67] Failed to authenticate: Invalid token
14:23:46.012 WARN [pool.ts:234] Connection pool capacity at 90%
```

## Winston 설정 예시

```typescript
import winston from 'winston';
import path from 'path';

// 커스텀 포맷터
const customFormat = winston.format.printf(({ level, message, timestamp, filename, line }) => {
  const ms = new Date(timestamp).getMilliseconds().toString().padStart(3, '0');
  const time = new Date(timestamp).toTimeString().split(' ')[0];
  const location = filename && line ? `[${filename}:${line}]` : '';
  return `${time}.${ms} ${level.toUpperCase()} ${location} ${message}`;
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
    // 콘솔 출력
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      )
    }),
    // 파일 출력
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 200 * 1024 * 1024, // 200MB
      maxFiles: 30
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 200 * 1024 * 1024, // 200MB
      maxFiles: 30
    })
  ]
});

// 개발 환경에서는 더 상세한 로그
if (process.env.NODE_ENV !== 'production') {
  logger.level = 'debug';
}
```

## Pino 설정 예시 (고성능)

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname'
    }
  },
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    }
  }
});
```

## 로그 레벨 가이드라인

### error
- 애플리케이션 오류
- 예외 상황

```typescript
logger.error('Failed to connect to telnet server', { error: err.message, host, port });
logger.error('WebSocket connection error', { clientId, error: err.stack });
```

### warn
- 예상치 못한 상황이지만 계속 실행 가능
- 잠재적 문제

```typescript
logger.warn('Connection pool near capacity', { current: 180, max: 200 });
logger.warn('Slow response detected', { duration: 5000, threshold: 3000 });
```

### info
- 정상적인 애플리케이션 실행 정보
- 중요한 비즈니스 이벤트

```typescript
logger.info('Server started', { port: 3000, env: process.env.NODE_ENV });
logger.info('Client connected', { clientId, remoteAddress });
logger.info('Telnet connection established', { host, port });
```

### http
- HTTP 요청/응답 로깅

```typescript
logger.http('GET /health', { status: 200, duration: 15 });
```

### debug
- 개발 중 디버깅 정보
- 상세한 실행 흐름

```typescript
logger.debug('Processing message', { type: 'data', payload: data.slice(0, 100) });
logger.debug('Connection state changed', { from: 'connecting', to: 'connected' });
```

## 로깅 패턴

### 1. 작업 시작/완료 로깅

```typescript
async function connectToTelnet(host: string, port: number): Promise<void> {
  logger.info('Connecting to telnet server', { host, port });
  
  try {
    await telnetClient.connect(host, port);
    logger.info('Telnet connection established', { host, port });
  } catch (error) {
    logger.error('Failed to connect to telnet', { 
      host, 
      port, 
      error: error instanceof Error ? error.message : String(error) 
    });
    throw error;
  }
}
```

### 2. 예외 처리 로깅

```typescript
try {
  await processMessage(data);
} catch (error) {
  if (error instanceof ValidationError) {
    logger.warn('Invalid message format', { error: error.message, data });
  } else {
    logger.error('Unexpected error processing message', { 
      error: error instanceof Error ? error.stack : String(error),
      data 
    });
    throw error;
  }
}
```

### 3. 조건부 로깅

```typescript
if (connectionPool.size >= maxConnections * 0.9) {
  logger.warn('Connection pool near capacity', { 
    current: connectionPool.size, 
    max: maxConnections 
  });
}

if (!isValidMessage(message)) {
  logger.error('Invalid message received', { message });
  return;
}
```

### 4. 성능 모니터링

```typescript
const startTime = Date.now();
await performOperation();
const duration = Date.now() - startTime;

if (duration > 1000) {
  logger.warn('Slow operation detected', { operation: 'performOperation', duration });
} else {
  logger.debug('Operation completed', { operation: 'performOperation', duration });
}
```

## 구조화된 로깅

```typescript
// 좋은 예: 구조화된 데이터
logger.info('User action', {
  userId: user.id,
  action: 'login',
  ip: req.ip,
  userAgent: req.headers['user-agent']
});

// 나쁜 예: 문자열 연결
logger.info(`User ${user.id} logged in from ${req.ip}`);
```

## 보안 고려사항

```typescript
// ✅ 안전한 로깅
logger.info('Login attempt', { username: user.username });

// ❌ 위험한 로깅 (금지)
logger.info('Login attempt', { username: user.username, password: user.password });

// 민감한 정보 마스킹
function maskSensitiveData(data: any): any {
  const masked = { ...data };
  if (masked.password) masked.password = '***';
  if (masked.token) masked.token = masked.token.slice(0, 10) + '...';
  return masked;
}

logger.info('User data', maskSensitiveData(userData));
```

## 로그 파일 관리

### Winston 로테이션 설정

```typescript
import winston from 'winston';
import 'winston-daily-rotate-file';

const transport = new winston.transports.DailyRotateFile({
  filename: 'logs/application-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '200m',
  maxFiles: '30d'
});

export const logger = winston.createLogger({
  transports: [transport]
});
```

## 컨텍스트 로거 패턴

```typescript
class ConnectionLogger {
  private logger: winston.Logger;
  private connectionId: string;

  constructor(connectionId: string) {
    this.connectionId = connectionId;
    this.logger = logger.child({ connectionId });
  }

  info(message: string, meta?: any) {
    this.logger.info(message, meta);
  }

  error(message: string, meta?: any) {
    this.logger.error(message, meta);
  }
}

// 사용
const connLogger = new ConnectionLogger('ws-123');
connLogger.info('Connection established');
connLogger.error('Connection failed', { reason: 'timeout' });
```

## Express 미들웨어 로깅

```typescript
import morgan from 'morgan';

// HTTP 요청 로깅
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.http(message.trim())
  }
}));

// 커스텀 로깅 미들웨어
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration,
      ip: req.ip
    });
  });
  
  next();
});
```

## 환경별 로그 설정

```typescript
const logLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.simple()
  ),
  transports: [
    new winston.transports.Console(),
    ...(process.env.NODE_ENV === 'production'
      ? [new winston.transports.File({ filename: 'logs/app.log' })]
      : [])
  ]
});
```

## 주의사항

- **로그 레벨 일관성**: 같은 종류의 이벤트는 같은 레벨 사용
- **과도한 로깅 방지**: 성능에 영향을 주지 않도록 적절한 수준 유지
- **민감한 정보 보호**: 비밀번호, 토큰, 개인정보 로깅 금지
- **구조화된 데이터**: 문자열 연결 대신 객체 사용
- **로그 파일 관리**: 자동 로테이션 및 압축 설정
- **프로덕션 환경**: JSON 형식 로그 사용 (로그 분석 도구 연동)
- **개발 환경**: 가독성 좋은 형식 사용 (pino-pretty, winston colorize)
