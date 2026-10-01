export type Message =
  | { type: 'AGENT_HELLO'; docId: string }
  | { type: 'AGENT_READY'; port: MessagePort }
  | { type: 'PING' }
  | { type: 'PONG' };

export interface Request {
  id: string;
  type: string;
  [key: string]: any;
}

export interface Response {
  id: string;
  type: string;
  error?: string;
  [key: string]: any;
}
