// 다국어 지원 모듈
export interface Messages {
  connecting: string;
  connected: string;
  connectionFailed: string;
  connectionLost: string;
  reconnecting: string;
  maxRetriesExceeded: string;
  cannotConnect: string;
  reconnectButton: string;
  connectButton: string;
  disconnectButton: string;
  inputPlaceholder: string;
  inputPlaceholderDisconnected: string;
  sendButton: string;
  connectionClosed: string;
  readyToConnect: string;
  serverNotConnected: string;
  confirmLeave: string;
}

const translations: Record<string, Messages> = {
  en: {
    connecting: 'Connecting...',
    connected: 'Connected',
    connectionFailed: 'Connection Failed',
    connectionLost: 'Connection lost',
    reconnecting: 'Reconnecting...',
    maxRetriesExceeded: 'Maximum reconnection attempts exceeded',
    cannotConnect: 'Cannot connect to server',
    reconnectButton: 'Reconnect',
    connectButton: 'Connect',
    disconnectButton: 'Disconnect',
    inputPlaceholder: 'Enter command...',
    inputPlaceholderDisconnected: 'Not connected',
    sendButton: 'Send',
    connectionClosed: 'Connection closed',
    readyToConnect: 'Ready to connect',
    serverNotConnected: 'Not connected',
    confirmLeave: 'Game connection will be lost. Are you sure you want to leave?'
  },
  ko: {
    connecting: '연결 중...',
    connected: '연결됨',
    connectionFailed: '연결 실패',
    connectionLost: '연결이 끊어졌습니다',
    reconnecting: '재연결 시도 중...',
    maxRetriesExceeded: '최대 재연결 시도 횟수를 초과했습니다',
    cannotConnect: '서버에 연결할 수 없습니다',
    reconnectButton: '재연결',
    connectButton: '접속',
    disconnectButton: '연결 해제',
    inputPlaceholder: '명령어를 입력하세요...',
    inputPlaceholderDisconnected: '연결되지 않음',
    sendButton: '전송',
    connectionClosed: '연결이 종료되었습니다',
    readyToConnect: '접속 준비 완료',
    serverNotConnected: '연결되지 않음',
    confirmLeave: '게임 연결이 끊어집니다. 정말 나가시겠습니까?'
  }
};

export function getMessages(): Messages {
  // 브라우저 언어 감지 (기본값: 영어)
  const language = navigator.language.toLowerCase();

  // 한국어 감지
  if (language.startsWith('ko')) {
    return translations.ko;
  }

  // 기본값: 영어
  return translations.en;
}

export function getLanguage(): string {
  const language = navigator.language.toLowerCase();
  return language.startsWith('ko') ? 'ko' : 'en';
}
