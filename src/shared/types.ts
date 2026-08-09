// Shared Types

/**
 * 게이트웨이가 자체적으로 생성하는 제어 메시지.
 *
 * 게임 메시지는 MUD 서버의 JSON 라인이 그대로 통과하므로 이 타입을 쓰지 않는다.
 * 서버 메시지와 구분하기 위해 type에 `gateway_` 접두어를 붙인다. 프로토콜 계약의
 * "알 수 없는 type은 무시" 규칙에 의해 서버는 이 메시지를 보지 않는다.
 */
export type GatewayMessage =
  | {
      /** WebSocket과 MUD 서버 연결이 모두 성립했다 */
      type: 'gateway_connected';
      timestamp: number;
    }
  | {
      /** 게이트웨이 계층에서 발생한 오류 */
      type: 'gateway_error';
      reason: string;
      timestamp: number;
    };
