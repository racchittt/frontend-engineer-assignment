export interface Box { id: string; label: string; x: number; y: number; w: number; h: number }

export type Message =
  | { type: 'AGENT_HELLO'; docId: string }
  | { type: 'AGENT_READY'; port: MessagePort }
  | { type: 'PING'; id: string }
  | { type: 'PONG'; id: string }
  | { type: 'SET_MODE'; mode: 'select' | 'interact' }          // host -> agent
  | { type: 'HOVER'; box: Box | null }                         // agent -> host
  | { type: 'SELECT'; box: Box; shift: boolean }               // agent -> host

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
