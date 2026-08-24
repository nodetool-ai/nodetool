// Browser stub for Node's `http`/`https`. Server-only provider code (the
// OAuth loopback callback server) imports named members, and webpack treats a
// missing named export as a build error even when the code never runs in a
// render. Every member throws.
const unsupported = (name) => () => {
  throw new Error(`Browser stub: http.${name} is not supported`);
};

export const createServer = unsupported("createServer");
export const request = unsupported("request");
export const get = unsupported("get");
export const STATUS_CODES = {};
export class Agent {
  constructor() {
    throw new Error("Browser stub: http.Agent is not supported");
  }
}
export class Server {
  constructor() {
    throw new Error("Browser stub: http.Server is not supported");
  }
}
export class IncomingMessage {}
export class ServerResponse {}

export default {
  createServer,
  request,
  get,
  STATUS_CODES,
  Agent,
  Server,
  IncomingMessage,
  ServerResponse,
};
