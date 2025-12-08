import { TerminalManager } from './terminal-manager';
import '@xterm/xterm/css/xterm.css';

// 클라이언트 버전
const CLIENT_VERSION = '1.0.0';

// WebSocket URL - 현재 호스트의 /ws 경로 사용 (프록시 통과)
const getWebSocketUrl = (): string => {
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

    // 재연결 버튼 이벤트 리스너
    this.reconnectBtn.addEventListener('click', () => {
      this.hideError();
      this.reconnectAttempts = 0; // 수동 재연결 시 카운터 리셋
      this.connect();
    });

    // 클라이언트 버전 표시
    const clientVersionElement = document.getElementById('client-version')!;
    clientVersionElement.textContent = `Client: v${CLIENT_VERSION}`;
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
      this.serverVersionElement.textContent = 'Server: 연결 중...';
      
      // WebSocket 연결
      await this.terminalManager.connect(wsUrl);
      
      console.log('[BrowserClient] Successfully connected to WebSocket Gateway');
      this.serverVersionElement.textContent = 'Server: 연결됨';
      
      // 연결 성공 시 재연결 카운터 리셋
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      this.hideError();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      console.error('[BrowserClient] Connection failed:', errorMessage, error);
      
      this.serverVersionElement.textContent = 'Server: 연결 실패';
      
      // 자동 재연결 시도
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.attemptReconnect();
      } else {
        // 최대 재연결 시도 횟수 초과
        this.showError(`서버에 연결할 수 없습니다: ${errorMessage}. 최대 재연결 시도 횟수를 초과했습니다.`);
        this.isReconnecting = false;
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
    
    this.showError(`연결이 끊어졌습니다. ${delay / 1000}초 후 재연결 시도 중... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

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
