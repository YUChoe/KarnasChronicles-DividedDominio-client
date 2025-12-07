# 설계 문서

## 개요

브라우저 기반 텔넷 터미널 시스템은 세 가지 주요 구성 요소로 이루어져 있습니다:

1. **Browser Client**: xterm.js 기반 터미널 인터페이스를 렌더링하고 사용자 입력을 처리하는 TypeScript 웹 애플리케이션
2. **WebSocket Gateway**: WebSocket 연결을 텔넷으로 연결하는 Node.js 서비스
3. **Telnet Server**: localhost:4000에서 실행되는 기존 MUD 서버

아키텍처는 WebSocket Gateway가 현대적인 WebSocket 연결과 레거시 텔넷 프로토콜 간의 프로토콜 변환기 역할을 하는 프록시 패턴을 따릅니다.

**기술 선택 이유:**
- **xterm.js**: VS Code, Hyper 등에서 사용되는 검증된 터미널 에뮬레이터 라이브러리입니다. TypeScript로 작성되어 타입 안정성이 보장되며, Canvas/WebGL 기반 렌더링으로 고성능을 제공합니다.
- **내장 ANSI 지원**: xterm.js는 ANSI 이스케이프 코드를 네이티브로 지원하여 별도의 파싱 로직이 불필요합니다.
- **풍부한 애드온 생태계**: AttachAddon(WebSocket 연결), FitAddon(자동 크기 조정), WebglAddon(GPU 가속) 등 필요한 기능을 애드온으로 제공합니다.
- **검증된 안정성**: 수백만 사용자가 사용하는 프로덕션 환경에서 검증된 라이브러리입니다.
- **경량**: 번들 크기가 작고 성능이 우수하여 200명 이상의 동시 사용자를 지원하기에 적합합니다.

## 아키텍처

```
┌─────────────────┐         WebSocket          ┌──────────────────┐
│                 │◄──────────────────────────►│                  │
│  Browser Client │      (Port 3000)           │  WebSocket       │
│   (xterm.js +   │                            │    Gateway       │
│   TypeScript)   │                            │   (Node.js)      │
└─────────────────┘                            └──────────────────┘
                                                        │
                                                        │ Telnet
                                                        │ (Port 4000)
                                                        ▼
                                               ┌──────────────────┐
                                               │                  │
                                               │  Telnet Server   │
                                               │   (MUD Game)     │
                                               │                  │
                                               └──────────────────┘
```

### 구성 요소 책임

**Browser Client:**
- xterm.js를 사용한 120x60 터미널 디스플레이 렌더링
- 키보드 입력 캡처 및 처리 (xterm.js 내장 기능)
- ANSI 이스케이프 코드 자동 파싱 및 렌더링 (xterm.js 내장 기능)
- AttachAddon을 통한 WebSocket 연결 생명주기 관리
- FitAddon을 통한 자동 크기 조정
- 제목 및 버전 정보가 포함된 헤더 표시
- WebglAddon을 통한 GPU 가속 렌더링 (선택적)

**WebSocket Gateway:**
- 브라우저로부터 WebSocket 연결 수락
- localhost:4000에 대한 텔넷 연결 생성 및 관리
- 양방향 메시지 전달
- 연결 풀링 및 리소스 관리
- 200개 이상의 동시 연결 처리

**Telnet Server:**
- 기존 MUD 게임 서버 (수정 불필요)
- 포트 4000에서 표준 텔넷 연결 수락

## 구성 요소 및 인터페이스

### Browser Client 구성 요소

#### TerminalManager 클래스
```typescript
import { Terminal } from '@xterm/xterm';
import { AttachAddon } from '@xterm/addon-attach';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';

class TerminalManager {
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private attachAddon?: AttachAddon;
  private socket?: WebSocket;
  
  constructor(container: HTMLElement) {
    this.terminal = new Terminal({
      cols: 120,
      rows: 60,
      fontFamily: 'Cascadia Mono, monospace',
      fontWeight: 300,  // Semi-Light
      lineHeight: 1.15,
      cursorBlink: true,
      scrollback: 0,  // 스크롤 비활성화
      theme: {
        background: '#000000',
        foreground: '#ffffff'
      }
    });
    
    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    
    // GPU 가속 (선택적)
    try {
      this.terminal.loadAddon(new WebglAddon());
    } catch (e) {
      console.warn('WebGL addon failed to load', e);
    }
    
    this.terminal.open(container);
    this.fitAddon.fit();
  }
  
  connect(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(wsUrl);
      
      this.socket.onopen = () => {
        this.attachAddon = new AttachAddon(this.socket!);
        this.terminal.loadAddon(this.attachAddon);
        
        // 초기 크기 전송
        const { cols, rows } = this.terminal;
        this.socket!.send(JSON.stringify({ 
          type: 'resize', 
          cols, 
          rows 
        }));
        
        resolve();
      };
      
      this.socket.onerror = (error) => {
        reject(error);
      };
      
      this.socket.onclose = () => {
        this.terminal.writeln('\r\n\x1b[33m연결이 종료되었습니다\x1b[0m');
      };
    });
  }
  
  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = undefined;
    }
  }
  
  dispose(): void {
    this.disconnect();
    this.terminal.dispose();
  }
}
```

#### WebSocket 메시지 형식
```typescript
interface WSMessage {
  type: 'data' | 'connect' | 'disconnect' | 'error' | 'version' | 'resize';
  payload?: string;
  cols?: number;
  rows?: number;
  timestamp: number;
}
```

### WebSocket Gateway 구성 요소

#### WebSocket 서버
```typescript
interface GatewayServer {
  start(port: number): Promise<void>;
  stop(): Promise<void>;
  getConnectionCount(): number;
}

interface ClientConnection {
  id: string;
  ws: WebSocket;
  telnet: TelnetConnection;
  createdAt: Date;
}
```

#### Telnet 연결 관리자
```typescript
interface TelnetConnection {
  connect(host: string, port: number): Promise<void>;
  disconnect(): void;
  send(data: string): void;
  onData(callback: (data: Buffer) => void): void;
  onClose(callback: () => void): void;
  onError(callback: (error: Error) => void): void;
}

interface ConnectionPool {
  maxConnections: number;
  activeConnections: Map<string, ClientConnection>;
  
  add(connection: ClientConnection): boolean;
  remove(id: string): void;
  getConnection(id: string): ClientConnection | null;
  cleanup(): void;
}
```

## 데이터 모델

### 터미널 상태
```typescript
interface TerminalState {
  buffer: TerminalBuffer;
  inputLine: string;
  cursorPosition: number;
  connected: boolean;
  serverVersion: string;
  clientVersion: string;
}
```

### 연결 상태
```typescript
interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  reconnectAttempts: number;
  lastError?: string;
}
```

### 설정
```typescript
interface ClientConfig {
  wsUrl: string;
  terminalWidth: number;
  terminalHeight: number;
  font: string;
  lineHeight: string;
  reconnectDelay: number;
  maxReconnectAttempts: number;
}

interface GatewayConfig {
  wsPort: number;
  telnetHost: string;
  telnetPort: number;
  maxConnections: number;
  connectionTimeout: number;
}
```

## 정확성 속성

*속성(property)은 시스템의 모든 유효한 실행에서 참이어야 하는 특성 또는 동작입니다. 본질적으로 시스템이 무엇을 해야 하는지에 대한 형식적 진술입니다. 속성은 사람이 읽을 수 있는 명세와 기계가 검증할 수 있는 정확성 보장 사이의 다리 역할을 합니다.*


### 속성 1: WebSocket에서 Telnet 연결 체인
*모든* 브라우저 클라이언트로부터의 유효한 WebSocket 연결에 대해, WebSocket Gateway는 localhost:4000에 대응하는 텔넷 연결을 설정하고 초기 서버 출력을 클라이언트로 전달해야 합니다.
**검증: 요구사항 1.1, 1.2, 1.3**

### 속성 2: 연결 실패 처리
*모든* 실패한 연결 시도(네트워크 오류, 서버 사용 불가 등)에 대해, Terminal Client는 오류 메시지를 표시하고 사용자에게 재연결 옵션을 제공해야 합니다.
**검증: 요구사항 1.4**

### 속성 3: 백오프를 사용한 자동 재연결
*모든* 네트워크 중단을 경험하는 활성 연결에 대해, Terminal Client는 시도 간 지수적으로 증가하는 지연으로 자동 재연결을 시도해야 합니다.
**검증: 요구사항 1.5**

### 속성 4: 키보드 입력 캡처
*모든* 사용자가 입력한 출력 가능한 문자에 대해, Terminal Client는 이를 캡처하고 입력 버퍼에 표시해야 합니다.
**검증: 요구사항 2.1, 7.1**

### 속성 5: 명령 제출 왕복
*모든* 입력 버퍼 상태에 대해, 사용자가 Enter를 누르면 완전한 명령이 적절한 줄 끝 문자와 함께 WebSocket Gateway를 통해 텔넷 서버로 전송되어야 합니다.
**검증: 요구사항 2.2, 2.3**

### 속성 6: 서버 데이터 전달
*모든* 텔넷 서버로부터 수신된 데이터에 대해, WebSocket Gateway는 이를 Terminal Client로 전달해야 하며, 클라이언트는 이를 Terminal Buffer에 렌더링해야 합니다.
**검증: 요구사항 2.4, 2.5**

### 속성 7: ANSI 코드 렌더링
*모든* 서버로부터 수신된 유효한 ANSI 이스케이프 코드(색상, 포맷팅, 제어 문자)에 대해, Terminal Client는 이를 터미널 디스플레이에 올바르게 파싱하고 렌더링해야 합니다.
**검증: 요구사항 6.1, 6.2, 6.3, 6.4**

### 속성 8: XSS 방지
*모든* 서버로부터 수신된 텍스트에 대해, Terminal Client는 렌더링 전에 XSS 공격을 방지하기 위해 이를 정제해야 합니다.
**검증: 요구사항 6.5**

### 속성 9: Backspace 처리
*모든* 최소 하나의 문자를 가진 입력 버퍼에 대해, Backspace를 누르면 버퍼에서 마지막 문자를 제거해야 합니다.
**검증: 요구사항 7.2**

### 속성 10: 커서 이동
*모든* 입력 라인 내의 커서 위치에 대해, 화살표 키를 누르면 버퍼 경계를 초과하지 않고 적절한 위치로 커서를 이동해야 합니다.
**검증: 요구사항 7.3**

### 속성 11: 인터럽트 신호
*모든* 활성 연결에 대해, Ctrl+C를 누르면 적절한 인터럽트 신호를 텔넷 서버로 전송해야 합니다.
**검증: 요구사항 7.4**

### 속성 12: 브라우저 키 방지
*모든* 게임 관련 키(F5, Ctrl+W 등)에 대해, Terminal Client는 브라우저의 기본 동작을 방지해야 합니다.
**검증: 요구사항 7.5**

### 속성 13: 연결 용량
*모든* 최대 200개까지의 동시 연결 수에 대해, WebSocket Gateway는 모든 연결을 성공적으로 수락하고 유지해야 합니다.
**검증: 요구사항 5.1**

### 속성 14: 리소스 정리
*모든* 닫히는 연결(정상적으로 또는 오류로 인해)에 대해, WebSocket Gateway는 모든 관련 리소스(텔넷 연결, 버퍼, 이벤트 리스너)를 정리해야 합니다.
**검증: 요구사항 5.4**

### 속성 15: 우아한 연결 거부
*모든* 최대 용량에 도달했거나 근접했을 때의 연결 시도에 대해, WebSocket Gateway는 적절한 오류 메시지와 함께 연결을 우아하게 거부하고 경고를 로그해야 합니다.
**검증: 요구사항 5.5**

### 속성 16: 메시지 형식 일관성
*모든* WebSocket을 통해 전송되는 메시지에 대해, type, payload, timestamp 필드를 가진 정의된 WSMessage 형식을 준수해야 합니다.
**검증: 요구사항 8.4**

### 속성 17: 연결 이벤트 로깅
*모든* 연결 이벤트(연결, 연결 해제, 오류)에 대해, 시스템은 디버깅을 위한 적절한 컨텍스트 정보와 함께 이를 로그해야 합니다.
**검증: 요구사항 8.5**

### 속성 18: 서버 버전 표시
*모든* WebSocket Gateway로부터 수신된 서버 버전 정보에 대해, Terminal Client는 이를 헤더 영역에 표시해야 합니다.
**검증: 요구사항 4.2**

## 오류 처리

### 클라이언트 측 오류

**연결 오류:**
- WebSocket 연결 실패
- 네트워크 타임아웃
- 서버 사용 불가

**처리 전략:**
- 사용자 친화적인 오류 메시지 표시
- 수동 재연결 버튼 제공
- 지수 백오프로 자동 재연결 구현 (1초, 2초, 4초, 8초, 최대 30초)
- 디버깅을 위해 브라우저 콘솔에 오류 로그

**입력 오류:**
- 잘못된 키 조합
- 버퍼 오버플로우

**처리 전략:**
- 잘못된 입력은 조용히 무시
- 최대 버퍼 크기에서 입력 잘라내기 (설정 가능, 기본값 1024자)
- 버퍼 제한에 대한 시각적 피드백 제공

### 게이트웨이 측 오류

**WebSocket 오류:**
- 클라이언트 연결 해제
- 잘못된 형식의 메시지
- 연결 제한 초과

**처리 전략:**
- 즉시 리소스 정리
- 클라이언트 ID 및 컨텍스트와 함께 오류 로그
- 연결을 닫기 전에 클라이언트에 오류 메시지 전송
- Reject new connections gracefully when at capacity

**Telnet Errors:**
- Connection refused
- Connection timeout
- Server disconnection

**Handling Strategy:**
- Notify client via WebSocket
- Clean up telnet connection resources
- Allow client to retry connection
- Log error with full context

### Error Recovery

**Transient Errors:**
- Network interruptions
- Temporary server unavailability

**Recovery Strategy:**
- Automatic reconnection with exponential backoff
- Preserve input buffer during reconnection
- Resume session if possible

**Permanent Errors:**
- Server shutdown
- Authentication failure
- Protocol errors

**Recovery Strategy:**
- Display clear error message
- Require manual user action
- Clear session state
- Provide option to start fresh connection

## 테스트 전략

### 단위 테스트

**Browser Client:**
- TerminalManager 초기화 및 설정
- WebSocket 연결 관리
- 키보드 이벤트 처리
- 재연결 로직

**WebSocket Gateway:**
- Connection management
- Message forwarding
- Resource cleanup
- Connection pooling

**Test Framework:** 
- Vitest (클라이언트 및 게이트웨이)
- Playwright (E2E 테스트)

### 속성 기반 테스트

**라이브러리:** fast-check (JavaScript/TypeScript 속성 기반 테스트 라이브러리)

**설정:** 각 속성 테스트는 최소 100회 반복 실행해야 합니다

**테스트 태깅:** 각 속성 기반 테스트는 다음 형식의 주석을 포함해야 합니다:
`// Feature: browser-telnet-terminal, Property {number}: {property_text}`

**Property Test Coverage:**

1. **Connection Chain Property** (Property 1)
   - Generate random WebSocket connection scenarios
   - Verify telnet connection is established
   - Verify initial data forwarding

2. **Command Round Trip Property** (Property 5)
   - Generate random command strings
   - Verify complete transmission through the stack
   - Verify line ending handling

3. **ANSI Parsing Property** (Property 7)
   - Generate random ANSI escape sequences
   - Verify correct parsing and rendering
   - Verify color and formatting application

4. **XSS Prevention Property** (Property 8)
   - Generate strings with potential XSS payloads
   - Verify all are safely sanitized
   - Verify no script execution

5. **Input Buffer Property** (Property 4, 9, 10)
   - Generate random input sequences
   - Verify buffer state consistency
   - Verify cursor position correctness

6. **Connection Capacity Property** (Property 13)
   - Generate varying numbers of concurrent connections
   - Verify all connections up to 200 are accepted
   - Verify stable operation

7. **Resource Cleanup Property** (Property 14)
   - Generate random connection/disconnection patterns
   - Verify no resource leaks
   - Verify proper cleanup on all paths

8. **Message Format Property** (Property 16)
   - Generate random message payloads
   - Verify all conform to WSMessage format
   - Verify required fields present

### Integration Testing

**End-to-End Scenarios:**
- Complete user session from connection to disconnection
- Multiple concurrent users
- Network interruption and recovery
- Server restart handling

**Load Testing:**
- 200 concurrent connections
- Sustained message throughput
- Memory usage monitoring
- Connection stability over time

**Test Environment:**
- Mock telnet server for controlled testing
- Real telnet server for integration tests
- Automated browser testing with Playwright

### Manual Testing

**UI/UX Verification:**
- Terminal appearance and styling
- Font rendering quality
- Layout and centering
- Version information display
- Error message clarity

**Keyboard Interaction:**
- All key combinations
- Special characters
- International keyboard layouts
- Copy/paste behavior

## Performance Considerations

### Client Performance

**Rendering Optimization:**
- Use virtual scrolling for terminal buffer
- Batch DOM updates to minimize reflows
- Use CSS transforms for smooth rendering
- Implement dirty region tracking

**Memory Management:**
- Limit terminal history buffer (default 1000 lines)
- Implement circular buffer for efficiency
- Clean up event listeners on unmount
- Use WeakMap for connection state

### Gateway Performance

**Connection Handling:**
- Use connection pooling for telnet connections
- Implement efficient event loop handling
- Use streams for data forwarding
- Minimize memory allocations

**Scalability:**
- Horizontal scaling via load balancer
- Stateless gateway design
- Connection affinity for session persistence
- Health check endpoints

**Resource Limits:**
- Maximum 200 connections per gateway instance
- 10MB memory limit per connection
- 30-second idle timeout
- 5-minute maximum session duration without activity

## Security Considerations

### Client Security

**XSS Prevention:**
- Sanitize all server output before rendering
- Use DOMPurify or similar library
- Content Security Policy headers
- No eval() or innerHTML usage

**Input Validation:**
- Validate all user input before sending
- Limit input buffer size
- Prevent command injection
- Rate limiting on client side

### Gateway Security

**Connection Security:**
- WebSocket over TLS (wss://) in production
- Origin validation for WebSocket connections
- Rate limiting per IP address
- Connection timeout enforcement

**Data Validation:**
- Validate all WebSocket messages
- Sanitize data before forwarding to telnet
- Prevent buffer overflow attacks
- Log suspicious activity

### Network Security

**Firewall Rules:**
- Telnet server only accessible from localhost
- WebSocket gateway exposed on specific port
- No direct telnet access from internet

**Monitoring:**
- Log all connection attempts
- Alert on suspicious patterns
- Track failed authentication attempts
- Monitor resource usage

## Deployment

### Client Deployment

**Build Process:**
- TypeScript compilation
- React production build
- Asset optimization and minification
- Source map generation

**Hosting:**
- Static file hosting (CDN)
- Gzip compression enabled
- Cache headers configured
- HTTPS required

### Gateway Deployment

**Process Management:**
- PM2 or similar process manager
- Automatic restart on failure
- Log rotation
- Health monitoring

**Configuration:**
- Environment-based configuration
- Secrets management
- Feature flags
- Graceful shutdown handling

### Monitoring

**Metrics:**
- Active connection count
- Message throughput
- Error rates
- Response times
- Memory usage
- CPU usage

**Logging:**
- Structured logging (JSON format)
- Log aggregation (ELK stack or similar)
- Error tracking (Sentry or similar)
- Performance monitoring (New Relic or similar)

## Future Enhancements

### Potential Features

**Terminal Features:**
- Terminal history navigation (up/down arrows)
- Command autocomplete
- Multiple terminal tabs
- Terminal themes and customization
- Copy/paste support
- Search within terminal output

**Connection Features:**
- Session persistence across reconnections
- Multiple server support
- SSH protocol support
- Secure authentication

**UI Enhancements:**
- Responsive design for mobile
- Accessibility improvements (screen reader support)
- Keyboard shortcuts customization
- Status indicators

**Performance:**
- WebAssembly for ANSI parsing
- Service Worker for offline support
- Progressive Web App features
- Compression for WebSocket messages
