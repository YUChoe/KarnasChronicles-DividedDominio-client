# Node.js/TypeScript 개발 베스트 프랙티스

## 핵심 개념 및 원칙

### 기본 설계 원칙
- **단순함의 힘**: 복잡한 조건문보다 명확한 구조
- **일관성 유지**: 모든 메시지는 동일한 방식으로 처리
- **단일 책임 원칙**: 하나의 함수/클래스는 하나의 역할만
- **예측 가능성**: 코드 동작이 명확하게 예측 가능해야 함
- **타입 안정성**: TypeScript의 타입 시스템을 최대한 활용

### 비동기 처리 원칙
- **async/await 사용**: Promise 체이닝보다 async/await 선호
- **에러 처리**: try-catch로 비동기 에러 처리
- **병렬 처리**: Promise.all()로 독립적인 작업 병렬 실행
- **순차 처리**: 의존성 있는 작업은 await로 순차 실행

## WebSocket 서버 패턴

### 올바른 WebSocket 처리

```typescript
import { WebSocket, WebSocketServer } from 'ws';

class GatewayServer {
  private wss: WebSocketServer;
  private connections: Map<string, ClientConnection>;

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.connections = new Map();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = this.generateClientId();
      
      ws.on('message', async (data) => {
        try {
          await this.handleMessage(clientId, data);
        } catch (error) {
          logger.error('Message handling error', { clientId, error });
          this.sendError(ws, 'Failed to process message');
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(clientId);
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', { clientId, error });
      });
    });
  }

  private async handleMessage(clientId: string, data: Buffer): Promise<void> {
    const message = JSON.parse(data.toString());
    
    // 메시지 타입별 처리
    switch (message.type) {
      case 'data':
        await this.forwardToTelnet(clientId, message.payload);
        break;
      case 'resize':
        await this.handleResize(clientId, message.cols, message.rows);
        break;
      default:
        logger.warn('Unknown message type', { type: message.type });
    }
  }
}
```

### 연결 관리 패턴

```typescript
interface ClientConnection {
  id: string;
  ws: WebSocket;
  telnet: TelnetClient;
  createdAt: Date;
}

class ConnectionPool {
  private connections: Map<string, ClientConnection>;
  private maxConnections: number;

  constructor(maxConnections: number = 200) {
    this.connections = new Map();
    this.maxConnections = maxConnections;
  }

  add(connection: ClientConnection): boolean {
    if (this.connections.size >= this.maxConnections) {
      logger.warn('Connection limit reached', { 
        current: this.connections.size, 
        max: this.maxConnections 
      });
      return false;
    }

    this.connections.set(connection.id, connection);
    logger.info('Connection added', { 
      id: connection.id, 
      total: this.connections.size 
    });
    return true;
  }

  remove(id: string): void {
    const connection = this.connections.get(id);
    if (connection) {
      // 리소스 정리
      connection.telnet.disconnect();
      connection.ws.close();
      this.connections.delete(id);
      
      logger.info('Connection removed', { 
        id, 
        remaining: this.connections.size 
      });
    }
  }

  get(id: string): ClientConnection | undefined {
    return this.connections.get(id);
  }

  cleanup(): void {
    for (const [id, connection] of this.connections) {
      this.remove(id);
    }
  }
}
```

## 에러 처리 패턴

### 계층별 에러 처리

```typescript
// 커스텀 에러 클래스
class ConnectionError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'ConnectionError';
  }
}

class ValidationError extends Error {
  constructor(message: string, public field: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// 에러 처리 미들웨어
async function handleRequest(req: Request, res: Response): Promise<void> {
  try {
    await processRequest(req);
    res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ 
        error: 'Validation failed', 
        field: error.field,
        message: error.message 
      });
    } else if (error instanceof ConnectionError) {
      res.status(503).json({ 
        error: 'Service unavailable', 
        code: error.code 
      });
    } else {
      logger.error('Unexpected error', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
```

### 비동기 에러 처리

```typescript
// ✅ 올바른 비동기 에러 처리
async function connectWithRetry(
  host: string, 
  port: number, 
  maxRetries: number = 3
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await connect(host, port);
      logger.info('Connection successful', { host, port, attempt });
      return;
    } catch (error) {
      lastError = error as Error;
      logger.warn('Connection attempt failed', { 
        host, 
        port, 
        attempt, 
        error: lastError.message 
      });
      
      if (attempt < maxRetries) {
        await sleep(1000 * attempt); // 지수 백오프
      }
    }
  }

  throw new ConnectionError(
    `Failed to connect after ${maxRetries} attempts`,
    'MAX_RETRIES_EXCEEDED'
  );
}
```

## 타입 안정성 패턴

### 타입 가드 사용

```typescript
interface WSMessage {
  type: 'data' | 'resize' | 'error';
  payload?: string;
  cols?: number;
  rows?: number;
}

function isWSMessage(obj: any): obj is WSMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.type === 'string' &&
    ['data', 'resize', 'error'].includes(obj.type)
  );
}

function handleMessage(data: Buffer): void {
  try {
    const parsed = JSON.parse(data.toString());
    
    if (!isWSMessage(parsed)) {
      throw new ValidationError('Invalid message format', 'message');
    }

    // 이제 parsed는 WSMessage 타입으로 안전하게 사용 가능
    switch (parsed.type) {
      case 'data':
        handleData(parsed.payload!);
        break;
      case 'resize':
        handleResize(parsed.cols!, parsed.rows!);
        break;
    }
  } catch (error) {
    logger.error('Failed to parse message', { error });
  }
}
```

### 제네릭 활용

```typescript
class Repository<T> {
  private items: Map<string, T>;

  constructor() {
    this.items = new Map();
  }

  add(id: string, item: T): void {
    this.items.set(id, item);
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  getAll(): T[] {
    return Array.from(this.items.values());
  }

  remove(id: string): boolean {
    return this.items.delete(id);
  }
}

// 사용
const connectionRepo = new Repository<ClientConnection>();
connectionRepo.add('client-1', connection);
```

## 성능 최적화 패턴

### 이벤트 루프 최적화

```typescript
// ❌ 나쁜 예: 동기 블로킹
function processLargeData(data: string[]): string[] {
  return data.map(item => heavyComputation(item));
}

// ✅ 좋은 예: 청크 단위 비동기 처리
async function processLargeDataAsync(data: string[]): Promise<string[]> {
  const chunkSize = 100;
  const results: string[] = [];

  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(item => heavyComputationAsync(item))
    );
    results.push(...chunkResults);
    
    // 이벤트 루프에 제어권 반환
    await setImmediate(() => {});
  }

  return results;
}
```

### 메모리 관리

```typescript
class BufferPool {
  private buffers: Buffer[];
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.buffers = [];
    this.maxSize = maxSize;
  }

  acquire(size: number): Buffer {
    const buffer = this.buffers.pop();
    if (buffer && buffer.length >= size) {
      return buffer.slice(0, size);
    }
    return Buffer.allocUnsafe(size);
  }

  release(buffer: Buffer): void {
    if (this.buffers.length < this.maxSize) {
      this.buffers.push(buffer);
    }
  }
}
```

## 테스트 패턴

### 단위 테스트

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('ConnectionPool', () => {
  let pool: ConnectionPool;

  beforeEach(() => {
    pool = new ConnectionPool(5);
  });

  afterEach(() => {
    pool.cleanup();
  });

  it('should add connection successfully', () => {
    const connection = createMockConnection('test-1');
    const result = pool.add(connection);
    
    expect(result).toBe(true);
    expect(pool.get('test-1')).toBe(connection);
  });

  it('should reject connection when limit reached', () => {
    // 최대 개수만큼 연결 추가
    for (let i = 0; i < 5; i++) {
      pool.add(createMockConnection(`test-${i}`));
    }

    // 추가 연결 시도
    const result = pool.add(createMockConnection('test-6'));
    expect(result).toBe(false);
  });
});
```

### 통합 테스트

```typescript
import { describe, it, expect } from 'vitest';
import { WebSocket } from 'ws';

describe('Gateway Integration', () => {
  it('should forward message from WebSocket to Telnet', async () => {
    const gateway = new GatewayServer(3000);
    const ws = new WebSocket('ws://localhost:3000');

    await new Promise((resolve) => ws.on('open', resolve));

    const testMessage = { type: 'data', payload: 'test command\n' };
    ws.send(JSON.stringify(testMessage));

    // Telnet 서버에서 메시지 수신 확인
    const received = await waitForTelnetMessage();
    expect(received).toBe('test command\n');

    ws.close();
    gateway.stop();
  });
});
```

## 보안 패턴

### 입력 검증

```typescript
import { z } from 'zod';

const WSMessageSchema = z.object({
  type: z.enum(['data', 'resize', 'error']),
  payload: z.string().optional(),
  cols: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional()
});

function validateMessage(data: unknown): WSMessage {
  try {
    return WSMessageSchema.parse(data);
  } catch (error) {
    throw new ValidationError('Invalid message format', 'message');
  }
}
```

### Rate Limiting

```typescript
class RateLimiter {
  private requests: Map<string, number[]>;
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.requests = new Map();
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  isAllowed(clientId: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(clientId) || [];

    // 윈도우 밖의 요청 제거
    const validTimestamps = timestamps.filter(
      ts => now - ts < this.windowMs
    );

    if (validTimestamps.length >= this.maxRequests) {
      return false;
    }

    validTimestamps.push(now);
    this.requests.set(clientId, validTimestamps);
    return true;
  }
}
```

## 환경 설정 패턴

```typescript
import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.string().transform(Number),
  TELNET_HOST: z.string().default('localhost'),
  TELNET_PORT: z.string().transform(Number).default('4000'),
  MAX_CONNECTIONS: z.string().transform(Number).default('200'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info')
});

export const config = ConfigSchema.parse(process.env);
```

## 주의사항

- **타입 안정성**: any 타입 사용 최소화
- **에러 처리**: 모든 비동기 작업에 try-catch
- **리소스 정리**: 연결, 타이머, 이벤트 리스너 정리
- **메모리 누수**: WeakMap, WeakSet 활용
- **보안**: 입력 검증, Rate Limiting, CORS 설정
- **성능**: 이벤트 루프 블로킹 방지
- **로깅**: 구조화된 로그, 민감 정보 제외
