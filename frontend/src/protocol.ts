export type Message =
  | { type: 'AGENT_HELLO'; docId: string }
  | { type: 'AGENT_READY'; port: MessagePort }
  | { type: 'PING'; id: string }
  | { type: 'PONG'; id: string };

export interface Request {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface Response {
  id: string;
  type: string;
  error?: string;
  [key: string]: unknown;
}
