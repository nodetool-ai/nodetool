/**
 * @nodetool-ai/sandbox — Host-side sandbox provisioning.
 *
 * Provides isolated Linux environments for agents to drive. Current backend
 * is Docker; future backends (gVisor, Firecracker, E2B, Daytona) implement
 * the same `SandboxProvider` interface.
 */

export type {
  Sandbox,
  SandboxProvider,
  SandboxOptions,
  SandboxEndpoint
} from "./SandboxProvider.js";

export {
  DockerSandbox,
  DockerSandboxProvider,
  DEFAULT_SANDBOX_IMAGE,
  TOOL_SERVER_PORT,
  VNC_WS_PORT,
  parseMemLimit
} from "./DockerSandbox.js";

export { ToolClient, ToolInvocationError } from "./ToolClient.js";
export type { ToolClientOptions } from "./ToolClient.js";

export { SessionStore } from "./session/index.js";
export type { SessionStoreOptions } from "./session/index.js";

export * from "./schemas/index.js";
