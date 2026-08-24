// Browser stub for Node's `net`, used only so the bundle resolves. A
// transitive dependency (xml2js → sax chain) imports named members that the
// generic empty stub cannot provide, and webpack treats a missing named
// export as a build error. Every member throws: the browser render never
// opens a socket, so reaching one is a bug, not a fallback.
const unsupported = (name) => () => {
  throw new Error(`Browser stub: net.${name} is not supported`);
};

export const createConnection = unsupported("createConnection");
export const connect = unsupported("connect");
export const createServer = unsupported("createServer");
export const isIP = () => 0;
export const isIPv4 = () => false;
export const isIPv6 = () => false;
export class Socket {
  constructor() {
    throw new Error("Browser stub: net.Socket is not supported");
  }
}
export class Server {
  constructor() {
    throw new Error("Browser stub: net.Server is not supported");
  }
}

export default {
  createConnection,
  connect,
  createServer,
  isIP,
  isIPv4,
  isIPv6,
  Socket,
  Server,
};
