import { TerminalManager } from './terminal-manager';
import { getMessages, getLanguage } from './i18n';
import '@xterm/xterm/css/xterm.css';

// 클라이언트 버전
const CLIENT_VERSION = '1.0.0';

// 다국어 메시지
const messages = getMessages();
const language = getLanguage();

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

class BrowserClient {
  private terminalManager?: TerminalManager;
  private errorContainer: HTMLElement;
  private errorText: HTMLElement;
  private reconnectBtn: HTMLElement;
  private connectBtn: HTMLElement;
  private connectionStatus: HTMLElement;
  private serverVersionElement: HTMLElement;
  private commandInput: HTMLInputElement;
  private sendButton: HTMLButtonElement;
  private isConnected: boolean = false;

  constructor() {
    // DOM 요소 가져오기
    this.errorContainer = document.getElementById('error-container')!;
    this.errorText = document.getElementById('error-text')!;
    this.reconnectBtn = document.getElementById('reconnect-btn')!;
    this.connectBtn = document.getElementById('connect-btn')!;
    this.connectionStatus = document.getElementById('connection-status')!;
    this.serverVersionElement = document.getElementById('server-version')!;
    this.commandInput = document.getElementById('command-input') as HTMLInputElement;
    this.sendButton = document.getElementById('send-button') as HTMLButtonElement;

    // 이벤트 리스너 설정
    this.setupEventListeners();

    // 다국어 텍스트 설정
    this.setupLocalization();

    // 클라이언트 버전 표시
    const clientVersionElement = document.getElementById('client-version')!;
    clientVersionElement.textContent = `Client: v${CLIENT_VERSION}`;

    // 입력 폼 이벤트 설정
    this.setupInputHandlers();
  }

  async initialize(): Promise<void> {
    const terminalContainer = document.getElementById('terminal');
    if (!terminalContainer) {
      console.error('Terminal container not found');
      return;
    }

    // TerminalManager 초기화
    this.terminalManager = new TerminalManager(terminalContainer);

    // 연결 끊김 콜백 설정 - 자동 재연결 제거
    this.terminalManager.setOnDisconnect(() => {
      console.log('[BrowserClient] Connection lost');
      this.isConnected = false;
      this.updateConnectionStatus('error', messages.connectionLost);
      this.expandHeader();
      this.updateConnectionUI();
    });

    // 서버 버전 수신 콜백 설정
    this.terminalManager.setOnVersion((version: string) => {
      console.log('[BrowserClient] Server version received:', version);
      this.serverVersionElement.textContent = `Server: v${version}`;
    });

    console.log('[BrowserClient] Client initialized, ready to connect');
  }

  private setupEventListeners(): void {
    // 연결 버튼 클릭
    this.connectBtn.addEventListener('click', () => {
      if (this.isConnected) {
        this.disconnect();
      } else {
        this.hideError();
        this.connect();
      }
    });

    // 재연결 버튼 클릭
    this.reconnectBtn.addEventListener('click', () => {
      this.hideError();
      this.connect();
    });
  }

  async connect(): Promise<void> {
    if (!this.terminalManager) {
      console.error('[BrowserClient] TerminalManager not initialized');
      return;
    }

    try {
      const wsUrl = getWebSocketUrl();
      console.log(`[BrowserClient] Connecting to ${wsUrl}`);

      // UI 상태 업데이트
      this.updateConnectionStatus('connecting', messages.connecting);
      this.connectBtn.disabled = true;

      // WebSocket 연결
      await this.terminalManager.connect(wsUrl);

      console.log('[BrowserClient] Successfully connected to WebSocket Gateway');
      this.isConnected = true;

      // UI 상태 업데이트
      this.updateConnectionStatus('connected', messages.connected);
      this.hideError();
      this.compactHeader();
      this.updateConnectionUI();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[BrowserClient] Connection failed:', errorMessage, error);

      this.isConnected = false;
      this.updateConnectionStatus('error', messages.connectionFailed);
      this.showError(`${messages.cannotConnect}: ${errorMessage}`);
      this.expandHeader();
      this.updateConnectionUI();
    }
  }

  disconnect(): void {
    if (this.terminalManager) {
      this.terminalManager.disconnect();
    }

    this.isConnected = false;
    this.updateConnectionStatus('', messages.readyToConnect);
    this.serverVersionElement.textContent = `Server: ${messages.serverNotConnected}`;
    this.expandHeader();
    this.updateConnectionUI();

    console.log('[BrowserClient] Disconnected');
  }

  private updateConnectionStatus(type: string, message: string): void {
    this.connectionStatus.textContent = message;
    this.connectionStatus.className = `connection-status ${type}`;
  }

  private updateConnectionUI(): void {
    // 연결 버튼 상태 업데이트
    this.connectBtn.disabled = false;
    this.connectBtn.textContent = this.isConnected ? messages.disconnectButton : messages.connectButton;

    // 입력 폼 상태 업데이트
    this.updateInputState();
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
    if (!command || !this.isConnected || !this.terminalManager?.isConnected()) {
      return;
    }

    // 터미널 매니저를 통해 명령 전송
    this.terminalManager.sendData(command + '\r');

    // 입력 필드 초기화
    this.commandInput.value = '';
  }

  private updateInputState(): void {
    const isConnected = this.isConnected && this.terminalManager?.isConnected();
    this.commandInput.disabled = !isConnected;
    this.sendButton.disabled = !isConnected;

    if (isConnected) {
      this.commandInput.placeholder = messages.inputPlaceholder;
    } else {
      this.commandInput.placeholder = messages.inputPlaceholderDisconnected;
    }
  }

  private setupLocalization(): void {
    // HTML lang 속성 설정
    document.documentElement.lang = language;

    // 버튼 텍스트 설정
    this.sendButton.textContent = messages.sendButton;
    this.reconnectBtn.textContent = messages.reconnectButton;
    this.connectBtn.textContent = messages.connectButton;

    // 상태 텍스트 설정
    this.connectionStatus.textContent = messages.readyToConnect;
    this.serverVersionElement.textContent = `Server: ${messages.serverNotConnected}`;

    // 입력 필드 플레이스홀더 설정
    this.commandInput.placeholder = messages.inputPlaceholderDisconnected;
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
  const message = messages.confirmLeave;
  event.preventDefault();
  event.returnValue = message; // Chrome에서 필요

  client.dispose();

  return message; // 일부 브라우저에서 필요
});