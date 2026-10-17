import { randomBytes } from "crypto";

/**
 * Header the app adds to its own windows' requests to the local backend. Must
 * match `LOCAL_CLIENT_TOKEN_HEADER` in packages/websocket/src/lib/local-client-origin.ts.
 */
export const LOCAL_CLIENT_TOKEN_HEADER = "x-nodetool-local-client";

let token: string | null = null;

/**
 * A secret generated once per launch. The backend receives it as
 * `NODETOOL_LOCAL_CLIENT_TOKEN` and trusts a loopback browser request as the
 * local user only when it carries this header or a known `Origin`. The
 * `file://` renderer sends `Origin: null`, which any sandboxed iframe on any
 * website can also send, so the origin alone cannot identify the app.
 */
export function getLocalClientToken(): string {
  token ??= randomBytes(32).toString("hex");
  return token;
}
