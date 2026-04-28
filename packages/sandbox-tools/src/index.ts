/**
 * @nodetool-ai/sandbox-tools — adapter that exposes a sandbox's ToolClient
 * as a set of @nodetool-ai/agents Tool instances.
 *
 * Usage:
 *
 *   const provider = new DockerSandboxProvider();
 *   const store = new SessionStore({ provider });
 *   const sandbox = await store.acquire("chat-123");
 *
 *   const agent = new Agent({
 *     name: "researcher",
 *     objective: "...",
 *     provider, model,
 *     tools: createSandboxTools(sandbox.client)
 *   });
 *
 *   // ...
 *   await sandbox.release();
 */

export { SandboxTool, toJsonSchema } from "./SandboxTool.js";
export type { SandboxToolDefinition } from "./SandboxTool.js";
export {
  createSandboxTools,
  listSandboxToolNames
} from "./manifest.js";
export type { CreateSandboxToolsOptions } from "./manifest.js";
