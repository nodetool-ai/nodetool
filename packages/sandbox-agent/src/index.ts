/**
 * @nodetool-ai/sandbox-agent — in-container tool server.
 *
 * This package is baked into the sandbox Docker image and started by the
 * container entrypoint. Not intended for direct use from host code; the
 * host side uses @nodetool-ai/sandbox which talks to this over HTTP.
 */

export { buildServer, SANDBOX_AGENT_VERSION } from "./server.js";
export type { BuildServerOptions } from "./server.js";
