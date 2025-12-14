import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { AttachAddon } from '@xterm/addon-attach';

export class TerminalManager {
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private attachAddon?: AttachAddon;
  private socket?: WebSocket;
  private onDisconnectCallback?: () => void;
  private onVersionCallback?: (version: string) => void;
  private echoEnabled: boolean = true; // 에코 상태 관리

  constructor(container: HTMLElement) {
    // 윈도우 크기에 따른 터미널 크기 계산
    const { cols, rows } = this.calculateTerminalSize();
    
    // xterm.js Terminal 인스턴스 초기화
    this.terminal = new Terminal({
      cols,
      rows,
      fontFamily: 'Cascadia Mono, Consolas, Courier New, monospace',
      fontSize: 14,
      fontWeight: 300,
      lineHeight: 1.15,
      cursorBlink: true,
      scrollback: 1000,
      convertEol: true, // \r을 \r\n으로 변환하여 줄바꿈 처리
      theme: {
        background: '#000000',
        foreground: '#ffffff',
        cursor: '#ffffff',
        cursorAccent: '#000000',
        selectionBackground: '#4d4d4d'
      }
    });

    // FitAddon 로드 및 적용
    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);

    // WebglAddon 로드 (선택적, 오류 처리 포함)
    try {
      const webglAddon = new WebglAddon();
      this.terminal.loadAddon(webglAddon);
      console.log('WebGL addon loaded successfully');
    } catch (error) {
      console.warn('WebGL addon failed to load, falling back to canvas renderer', error);
    }

    // 터미널을 컨테이너에 마운트
    this.terminal.open(container);
    
    // 터미널 크기 조정
    this.fitAddon.fit();

    // 윈도우 리사이즈 이벤트 처리
    window.addEventListener('resize', () => {
      this.handleResize();
    });

    // 특수 키 처리 설정
    this.setupKeyHandlers();
  }

  getTerminal(): Terminal {
    return this.terminal;
  }

  connect(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[TerminalManager] Attempting to connect to ${wsUrl}`);
      
      this.socket = new WebSocket(wsUrl);
      this.socket.binaryType = 'arraybuffer'; // 바이너리 데이터를 ArrayBuffer로 받기

      this.socket.onopen = () => {
        console.log('[TerminalManager] WebSocket connection established');
        
        // 초기 크기 정보 전송
        const { cols, rows } = this.terminal;
        this.socket?.send(JSON.stringify({
          type: 'resize',
          cols,
          rows,
          timestamp: Date.now()
        }));

        resolve();
      };

      this.socket.onmessage = (event) => {
        // 문자열 메시지 처리
        if (typeof event.data === 'string') {
          try {
            const message = JSON.parse(event.data);
            
            // 버전 메시지 처리
            if (message.type === 'version' && message.payload) {
              console.log('[TerminalManager] Server version received:', message.payload);
              if (this.onVersionCallback) {
                this.onVersionCallback(message.payload);
              }
              return;
            }
            
            // 연결 메시지 처리
            if (message.type === 'connect') {
              console.log('[TerminalManager] Connection confirmed');
              return;
            }
            
            // 데이터 메시지 처리
            if (message.type === 'data' && message.payload) {
              // 패스워드 프롬프트 감지하여 에코 모드 전환
              this.detectPasswordPrompt(message.payload);
              this.terminal.write(message.payload);
              return;
            }
          } catch (error) {
            // JSON 파싱 실패 - 원시 텍스트로 처리
            console.warn('[TerminalManager] Non-JSON string message received');
            this.terminal.write(event.data);
          }
        }
      };

      // 터미널 입력을 WebSocket으로 전송
      this.terminal.onData((data) => {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          // 방향키 필터링 (ANSI escape sequences)
          if (data === '\x1b[A' || data === '\x1b[B' || data === '\x1b[C' || data === '\x1b[D') {
            // 방향키는 무시
            return;
          }
          
          // 로컬 에코 (서버가 에코하지 않는 경우를 위해)
          if (this.echoEnabled) {
            if (data === '\r') {
              // Enter: 줄바꿈
              this.terminal.write('\r\n');
            } else if (data === '\x7F' || data === '\b') {
              // Backspace (DEL 또는 BS): 커서를 뒤로 이동하고 문자 삭제
              this.terminal.write('\b \b');
            } else if (data.charCodeAt(0) < 32 && data !== '\n' && data !== '\t') {
              // 제어 문자는 에코하지 않음 (Ctrl+C 등)
            } else {
              // 일반 문자: 그대로 에코
              this.terminal.write(data);
            }
          } else {
            // 패스워드 모드: Enter만 줄바꿈 처리하고 에코 재활성화
            if (data === '\r') {
              this.terminal.write('\r\n');
              // 패스워드 입력 완료 - 에코 재활성화
              this.echoEnabled = true;
              console.log('[TerminalManager] Password input completed - echo re-enabled');
            }
            // 다른 문자는 에코하지 않음 (패스워드 숨김)
          }
          
          // JSON 형식으로 전송
          this.socket.send(JSON.stringify({
            type: 'data',
            payload: data,
            timestamp: Date.now()
          }));
        }
      });

      this.socket.onerror = (error) => {
        console.error('[TerminalManager] WebSocket error:', error);
        reject(new Error('WebSocket connection failed'));
      };

      this.socket.onclose = (event) => {
        console.log(`[TerminalManager] WebSocket connection closed: code=${event.code}, reason=${event.reason}`);
        const isKorean = navigator.language.startsWith('ko');
        const message = isKorean ? '연결이 종료되었습니다 / Connection closed' : 'Connection closed';
        this.terminal.writeln(`\r\n\x1b[33m${message}\x1b[0m`);
        
        // 비정상 종료인 경우 재연결 콜백 호출
        if (event.code !== 1000 && this.onDisconnectCallback) {
          this.onDisconnectCallback();
        }
      };
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = undefined;
    }
    if (this.attachAddon) {
      this.attachAddon = undefined;
    }
  }

  dispose(): void {
    this.disconnect();
    this.terminal.dispose();
  }

  isConnected(): boolean {
    return this.socket !== undefined && this.socket.readyState === WebSocket.OPEN;
  }

  sendData(data: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'data',
        payload: data,
        timestamp: Date.now()
      }));
    }
  }

  setOnDisconnect(callback: () => void): void {
    this.onDisconnectCallback = callback;
  }

  setOnVersion(callback: (version: string) => void): void {
    this.onVersionCallback = callback;
  }

  private setupKeyHandlers(): void {
    // 특수 키 처리
    // AttachAddon이 대부분의 키 입력을 자동으로 처리하지만,
    // 특수 키에 대한 명시적 처리를 추가합니다.
    
    this.terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      // Ctrl+C: 인터럽트 신호 (요구사항 7.4)
      if (event.ctrlKey && event.key === 'c') {
        console.log('[TerminalManager] Ctrl+C detected, sending interrupt signal');
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          // Ctrl+C는 ASCII 코드 3 (ETX - End of Text)
          this.socket.send('\x03');
        }
        return false; // 기본 동작 방지
      }

      // Backspace: 입력 버퍼에서 마지막 문자 제거 (요구사항 7.2)
      // AttachAddon이 자동으로 처리하지만, 로깅을 위해 감지
      if (event.key === 'Backspace') {
        console.log('[TerminalManager] Backspace key detected');
        return true; // AttachAddon이 처리하도록 허용
      }

      // 화살표 키: 커서 이동 (요구사항 7.3)
      // AttachAddon이 자동으로 처리하지만, 로깅을 위해 감지
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        console.log(`[TerminalManager] Arrow key detected: ${event.key}`);
        return true; // AttachAddon이 처리하도록 허용
      }

      // 브라우저 기본 동작 방지 (요구사항 7.5)
      // F5: 새로고침
      if (event.key === 'F5') {
        event.preventDefault();
        console.log('[TerminalManager] F5 key blocked');
        return false;
      }

      // Ctrl+W: 탭 닫기
      if (event.ctrlKey && event.key === 'w') {
        event.preventDefault();
        console.log('[TerminalManager] Ctrl+W key blocked');
        return false;
      }

      // Ctrl+R: 새로고침
      if (event.ctrlKey && event.key === 'r') {
        event.preventDefault();
        console.log('[TerminalManager] Ctrl+R key blocked');
        return false;
      }

      // Ctrl+T: 새 탭
      if (event.ctrlKey && event.key === 't') {
        event.preventDefault();
        console.log('[TerminalManager] Ctrl+T key blocked');
        return false;
      }

      // Ctrl+N: 새 창
      if (event.ctrlKey && event.key === 'n') {
        event.preventDefault();
        console.log('[TerminalManager] Ctrl+N key blocked');
        return false;
      }

      // 기타 모든 키는 AttachAddon이 처리하도록 허용
      return true;
    });
  }

  private detectPasswordPrompt(data: string): void {
    // 패스워드 프롬프트 패턴 감지
    const passwordPatterns = [
      /비밀번호[:\s]*$/i,
      /password[:\s]*$/i,
      /암호[:\s]*$/i,
      /패스워드[:\s]*$/i
    ];

    // 일반 프롬프트 패턴 (에코 재활성화)
    const normalPatterns = [
      /사용자명[:\s]*$/i,
      /username[:\s]*$/i,
      /선택[>\s]*$/i,
      /choice[>\s]*$/i,
      /명령[>\s]*$/i,
      /command[>\s]*$/i
    ];

    // 패스워드 프롬프트 감지
    for (const pattern of passwordPatterns) {
      if (pattern.test(data)) {
        this.echoEnabled = false;
        console.log('[TerminalManager] Password mode enabled - echo disabled');
        return;
      }
    }

    // 일반 프롬프트 감지 (에코 재활성화)
    for (const pattern of normalPatterns) {
      if (pattern.test(data)) {
        this.echoEnabled = true;
        console.log('[TerminalManager] Normal mode enabled - echo enabled');
        return;
      }
    }
  }

  private calculateTerminalSize(): { cols: number; rows: number } {
    // 기본값
    const defaultCols = 120;
    const defaultRows = 30;
    
    // 폰트 크기와 라인 높이
    const fontSize = 14;
    const lineHeight = 1.15;
    const charWidth = fontSize * 0.6; // 대략적인 문자 너비
    const charHeight = fontSize * lineHeight;
    
    // 윈도우 크기
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // 여백 계산 (헤더, 패딩 등)
    const headerHeight = 120; // 헤더 영역 높이
    const padding = 60; // 전체 패딩
    
    // 사용 가능한 영역
    const availableWidth = Math.max(windowWidth - padding, 800);
    const availableHeight = Math.max(windowHeight - headerHeight - padding, 400);
    
    // 터미널 크기 계산
    const cols = Math.min(Math.floor(availableWidth / charWidth), defaultCols);
    const rows = Math.floor(availableHeight / charHeight);
    
    return {
      cols: Math.max(cols, 80), // 최소 80 컬럼
      rows: Math.max(rows, 20)  // 최소 20 행
    };
  }

  private handleResize(): void {
    // 새로운 크기 계산
    const { cols, rows } = this.calculateTerminalSize();
    
    // 터미널 크기 변경
    this.terminal.resize(cols, rows);
    
    // FitAddon 적용
    this.fitAddon.fit();
    
    // 서버에 크기 변경 알림
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'resize',
        cols,
        rows,
        timestamp: Date.now()
      }));
    }
  }
}