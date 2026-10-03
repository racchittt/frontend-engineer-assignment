export interface Box {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Message =
  | { type: "AGENT_HELLO"; docId: string }
  | { type: "AGENT_READY"; port: MessagePort }
  | { type: "PING"; id: string }
  | { type: "PONG"; id: string }
  | { type: "SET_MODE"; mode: "select" | "interact" } // host -> agent
  | { type: "HOVER"; box: Box | null } // agent -> host
  | { type: "SELECT"; box: Box; shift: boolean } // agent -> host
  | { type: "TRACK"; ids: string[] } // host -> agent
  | { type: "RECT_UPDATE"; boxes: Box[] } // agent -> host
  | { type: "GONE"; ids: string[] }// agent -> host: couldn't re-identify, drop these
  | { type: "KEY"; key: string; shift: boolean } // agent -> host
  | { type: "HOVER_NODE"; from: string | null }; // host -> agent: a layers row is hovered
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
