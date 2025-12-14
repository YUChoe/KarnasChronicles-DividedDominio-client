import { TerminalManager } from './terminal-manager';
import '@xterm/xterm/css/xterm.css';

// 클라이언트 버전
const CLIENT_VERSION = '1.0.0';

// 다국어 지원
const isKorean = navigator.language.startsWith('ko');

const messages = {
  connecting: isKorean ? '연결 중...' : 'Connecting...',
  connected: isKorean ? '연결됨' : 'Connected',
  connectionFailed: isKorean ? '연결 실패' : 'Connection Failed',
  connectionLost: isKorean ? '연결이 끊어졌습니다' : 'Connection lost',
  reconnecting: isKorean ? '재연결 시도 중...' : 'Reconnecting...',
  maxRetriesExceeded: isKorean ? '최대 재연결 시도 횟수를 초과했습니다' : 'Maximum reconnection attempts exceeded',
  cannotConnect: isKorean ? '서버에 연결할 수 없습니다' : 'Cannot connect to server',
  reconnectButton: isKorean ? '재연결' : 'Reconnect',
  inputPlaceholder: isKorean ? '명령어를 입력하세요...' : 'Enter command...',
  inputPlaceholderConnecting: isKorean ? '서버에 연결 중...' : 'Connecting to server...',
  sendButton: isKorean ? '전송' : 'Send',
  connectionClosed: isKorean ? '연결이 종료되었습니다 / Connection closed' : 'Connection closed'
};

// WebSocket URL - 환경에 따라 다른 URL 사용
const getWebSocketUrl = (): string => {
  // 개발 환경: Vite dev server (5173) -> Gateway (3000)
  if (window.location.port === '5173') {
    return 'ws://localhost:3000';
  }
  
  // 프로덕션 환경: 현재 호스트의 /ws 경로 사용 (프록시 통과)
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
};

const WS_URL = getWebSocketUrl();

class BrowserClient {
  private terminalManager?: TerminalManager;
  private errorContainer: HTMLElement;
  private errorText: HTMLElement;
  private reconnectBtn: HTMLElement;
  private serverVersionElement: HTMLElement;
  private commandInput: HTMLInputElement;
  private sendButton: HTMLButtonElement;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectTimeout?: number;
  private isReconnecting: boolean = false;

  constructor() {
    // DOM 요소 가져오기
    this.errorContainer = document.getElementById('error-container')!;
    this.errorText = document.getElementById('error-text')!;
    this.reconnectBtn = document.getElementById('reconnect-btn')!;
    this.serverVersionElement = document.getElementById('server-version')!;
    this.commandInput = document.getElementById('command-input') as HTMLInputElement;
    this.sendButton = document.getElementById('send-button') as HTMLButtonElement;

    // 재연결 버튼 이벤트 리스너
    this.reconnectBtn.addEventListener('click', () => {
      this.hideError();
      this.reconnectAttempts = 0; // 수동 재연결 시 카운터 리셋
      this.connect();
    });

    // 클라이언트 버전 표시
    const clientVersionElement = document.getElementById('client-version')!;
    clientVersionElement.textContent = `Client: v${CLIENT_VERSION}`;

    // 입력 폼 이벤트 설정
    this.setupInputHandlers();
    
    // 다국어 텍스트 설정
    this.setupLocalization();
  }

  async initialize(): Promise<void> {
    const terminalContainer = document.getElementById('terminal');
    if (!terminalContainer) {
      console.error('Terminal container not found');
      return;
    }

    // TerminalManager 초기화
    this.terminalManager = new TerminalManager(terminalContainer);

    // 연결 끊김 콜백 설정
    this.terminalManager.setOnDisconnect(() => {
      console.log('[BrowserClient] Connection lost, attempting reconnect');
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.attemptReconnect();
      }
    });

    // 서버 버전 수신 콜백 설정
    this.terminalManager.setOnVersion((version: string) => {
      console.log('[BrowserClient] Server version received:', version);
      this.serverVersionElement.textContent = `Server: v${version}`;
    });

    // WebSocket 연결 시도
    await this.connect();
  }

  async connect(): Promise<void> {
    if (!this.terminalManager) {
      console.error('[BrowserClient] TerminalManager not initialized');
      return;
    }

    try {
      const wsUrl = getWebSocketUrl();
      console.log(`[BrowserClient] Connecting to ${wsUrl} (attempt ${this.reconnectAttempts + 1})`);
      this.serverVersionElement.textContent = `Server: ${messages.connecting}`;
      
      // WebSocket 연결
      await this.terminalManager.connect(wsUrl);
      
      console.log('[BrowserClient] Successfully connected to WebSocket Gateway');
      this.serverVersionElement.textContent = `Server: ${messages.connected}`;
      
      // 연결 성공 시 재연결 카운터 리셋
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      this.hideError();
      
      // 헤더 축소
      this.compactHeader();
      
      // 입력 폼 활성화
      this.updateInputState();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      console.error('[BrowserClient] Connection failed:', errorMessage, error);
      
      this.serverVersionElement.textContent = `Server: ${messages.connectionFailed}`;
      
      // 자동 재연결 시도
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.attemptReconnect();
      } else {
        // 최대 재연결 시도 횟수 초과
        this.showError(`${messages.cannotConnect}: ${errorMessage}. ${messages.maxRetriesExceeded}`);
        this.isReconnecting = false;
        this.expandHeader();
        this.updateInputState();
      }
    }
  }

  private attemptReconnect(): void {
    if (this.isReconnecting) {
      return; // 이미 재연결 중이면 중복 시도 방지
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    // 지수 백오프 계산 (1s, 2s, 4s, 8s, 최대 30s)
    const baseDelay = 1000;
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

    console.log(`[BrowserClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.showError(`${messages.connectionLost}. ${messages.reconnecting} ${delay / 1000}s (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    this.expandHeader();

    this.reconnectTimeout = window.setTimeout(() => {
      this.connect();
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
    this.isReconnecting = false;
  }

  showError(message: string): void {
    this.errorText.textContent = message;
    this.errorContainer.classList.add('visible');
  }

  hideError(): void {
    this.errorContainer.classList.remove('visible');
  }

  dispose(): void {
    this.cancelReconnect();
    if (this.terminalManager) {
      this.terminalManager.dispose();
    }
  }

  private compactHeader(): void {
    const header = document.querySelector('.header');
    if (header) {
      header.classList.add('compact');
    }
  }

  private expandHeader(): void {
    const header = document.querySelector('.header');
    if (header) {
      header.classList.remove('compact');
    }
  }

  private setupInputHandlers(): void {
    // 전송 버튼 클릭
    this.sendButton.addEventListener('click', () => {
      this.sendCommand();
    });

    // Enter 키 입력
    this.commandInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.sendCommand();
      }
    });

    // 연결 상태에 따른 입력 폼 활성화/비활성화
    this.updateInputState();
  }

  private sendCommand(): void {
    const command = this.commandInput.value.trim();
    if (!command || !this.terminalManager?.isConnected()) {
      return;
    }

    // 터미널 매니저를 통해 명령 전송
    this.terminalManager.sendData(command + '\r');
    
    // 입력 필드 초기화
    this.commandInput.value = '';
  }

  private updateInputState(): void {
    const isConnected = this.terminalManager?.isConnected() || false;
    this.commandInput.disabled = !isConnected;
    this.sendButton.disabled = !isConnected;
    
    if (isConnected) {
      this.commandInput.placeholder = messages.inputPlaceholder;
    } else {
      this.commandInput.placeholder = messages.inputPlaceholderConnecting;
    }
  }

  private setupLocalization(): void {
    // 버튼 텍스트 설정
    this.sendButton.textContent = messages.sendButton;
    this.reconnectBtn.textContent = messages.reconnectButton;
    
    // 입력 필드 플레이스홀더 설정
    this.commandInput.placeholder = messages.inputPlaceholderConnecting;
  }
}

// 애플리케이션 시작
const client = new BrowserClient();
client.initialize().catch(error => {
  console.error('Failed to initialize client:', error);
});

// 페이지 언로드 시 정리 및 확인 (요구사항 7.5)
window.addEventListener('beforeunload', (event) => {
  // 사용자에게 확인 요청
  const message = '게임 연결이 끊어집니다. 정말 나가시겠습니까?';
  event.preventDefault();
  event.returnValue = message; // Chrome에서 필요
  
  client.dispose();
  
  return message; // 일부 브라우저에서 필요
});
