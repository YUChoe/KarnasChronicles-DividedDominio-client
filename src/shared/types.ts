// Shared Types
export interface WSMessage {
  type: 'data' | 'connect' | 'disconnect' | 'error' | 'version' | 'resize';
  payload?: string;
  cols?: number;
  rows?: number;
  timestamp: number;
}
