// Everything the host (this app) and the preview pages say to each other.
// The agent inside each page (backend/pages/agent.js) is plain JavaScript and cannot
// import this file, so keep the two in step by hand.

export interface Box {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// One element as a layers row
export interface Row {
  id: string;
  label: string;
  hasChildren: boolean;
}

// What the inspector's Live section shows. All strings, so several elements can be compared.
export interface Live {
  name: string;
  tag: string;
  id: string;
  classes: string;
  size: string;
  position: string;
  text: string;
  color: string;
  background: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  key: string | null; // data-key, for GET /elements/:key
}

// ---- one-way messages ----
export type Message =
  // handshake (window.postMessage, then the MessageChannel takes over)
  | { type: "AGENT_HELLO"; docId: string } // agent -> host
  | { type: "AGENT_READY"; port: MessagePort } // host -> agent
  | { type: "PING"; id: string } // host -> agent
  | { type: "PONG"; id: string } // agent -> host
  // host -> agent
  | { type: "SET_MODE"; mode: "select" | "interact" }
  | { type: "TRACK"; ids: string[] } // follow these elements across re-renders
  | { type: "KEEP"; ids: string[] } // the layers rows that are open: follow them too
  | { type: "HOVER_NODE"; from: string | null } // a layers row is hovered
  // agent -> host
  | { type: "HOVER"; box: Box | null; path?: string[] } // path: ids of the element's ancestors, outermost first
  | { type: "SELECT"; box: Box; shift: boolean }
  | { type: "BACKGROUND"; shift: boolean } // the page background was clicked
  | { type: "RECT_UPDATE"; boxes: Box[] }
  | { type: "GONE"; ids: string[] } // couldn't re-identify, drop these
  | { type: "CHILDREN_CHANGED"; ids: (string | null)[] } // these parents got new children (null = <body>)
  | { type: "KEY"; key: string; shift: boolean }; // a key typed inside the preview

// ---- requests: host -> agent, answered by a reply with the same request id ----
// Never put `id` in a payload: the request's own id would be overwritten.
export type Dir = "child" | "parent" | "next" | "prev" | "self";

export interface Requests {
  NAVIGATE: { payload: { from: string; dir: Dir }; reply: { box: Box | null } };
  GET_CHILDREN: {
    payload: { from: string | null }; // null = the children of <body>
    reply: { children: Row[] | null }; // null = that element is gone
  };
  REVEAL: {
    payload: { from: string };
    // from the top level down to the element's parent, each level with all its children
    reply: { levels: { from: string | null; children: Row[] }[] | null };
  };
  SEARCH: {
    payload: { q: string };
    reply: { hits: Row[]; total: number };
  };
  INSPECT: {
    payload: { ids: string[] };
    reply: { lives: (Live | null)[] }; // null = that element is gone
  };
}

// What arrives for any request, before it is narrowed to its own reply type
export interface Response {
  id: string;
  type: string;
  error?: string;
  [key: string]: unknown;
}
