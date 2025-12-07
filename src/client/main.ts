import { TerminalManager } from './terminal-manager';
import '@xterm/xterm/css/xterm.css';

// 클라이언트 버전
const CLIENT_VERSION = '1.0.0';

// WebSocket URL (개발 환경)
const WS_URL = 'ws://localhost:3000';

class BrowserClient {
  private terminalManager?: TerminalManager;
  private errorContainer: HTMLElement;
  private errorText: HTMLElement;
  private reconnectBtn: HTMLElement;
  private serverVersionElement: HTMLElement;

  constructor() {
    // DOM 요소 가져오기
    this.errorContainer = document.getElementById('error-container')!;
    this.errorText = document.getElementById('error-text')!;
    this.reconnectBtn = document.getElementById('reconnect-btn')!;
    this.serverVersionElement = document.getElementById('server-version')!;

    // 재연결 버튼 이벤트 리스너
    this.reconnectBtn.addEventListener('click', () => {
      this.hideError();
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

    // WebSocket 연결 시도
    await this.connect();
  }

  async connect(): Promise<void> {
    if (!this.terminalManager) {
      console.error('TerminalManager not initialized');
      return;
    }

    try {
      this.serverVersionElement.textContent = 'Server: 연결 중...';
      
      // WebSocket 연결
      await this.terminalManager.connect(WS_URL);
      
      console.log('Connected to WebSocket Gateway');
      this.serverVersionElement.textContent = 'Server: 연결됨';
      
    } catch (error) {
      console.error('Failed to connect:', error);
      this.showError('서버에 연결할 수 없습니다. 재연결을 시도하세요.');
      this.serverVersionElement.textContent = 'Server: 연결 실패';
    }
  }

  showError(message: string): void {
    this.errorText.textContent = message;
    this.errorContainer.classList.add('visible');
  }

  hideError(): void {
    this.errorContainer.classList.remove('visible');
  }

  dispose(): void {
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

// 페이지 언로드 시 정리
window.addEventListener('beforeunload', () => {
  client.dispose();
});
