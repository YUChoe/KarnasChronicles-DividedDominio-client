import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { AttachAddon } from '@xterm/addon-attach';

export class TerminalManager {
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private attachAddon?: AttachAddon;
  private socket?: WebSocket;

  constructor(container: HTMLElement) {
    // xterm.js Terminal 인스턴스 초기화
    this.terminal = new Terminal({
      cols: 120,
      rows: 60,
      fontFamily: 'Cascadia Mono, Consolas, Courier New, monospace',
      fontWeight: 300, // Semi-Light
      lineHeight: 1.15,
      cursorBlink: true,
      scrollback: 0, // 스크롤 비활성화
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
      this.fitAddon.fit();
    });
  }

  getTerminal(): Terminal {
    return this.terminal;
  }

  connect(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('WebSocket connection established');
        
        // AttachAddon을 통한 터미널 연결
        if (this.socket) {
          this.attachAddon = new AttachAddon(this.socket);
          this.terminal.loadAddon(this.attachAddon);

          // 초기 크기 정보 전송
          const { cols, rows } = this.terminal;
          this.socket.send(JSON.stringify({
            type: 'resize',
            cols,
            rows,
            timestamp: Date.now()
          }));

          resolve();
        }
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.socket.onclose = () => {
        console.log('WebSocket connection closed');
        this.terminal.writeln('\r\n\x1b[33m연결이 종료되었습니다\x1b[0m');
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
}
