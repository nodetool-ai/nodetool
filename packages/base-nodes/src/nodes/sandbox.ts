import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  DockerSandboxProvider,
  SessionStore,
  type ToolClient
} from "@nodetool-ai/sandbox";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { randomUUID } from "node:crypto";
import { Tool } from "@nodetool-ai/agents";
import { buildBrowserAgentToolClasses } from "../lib/browser-agent-tools.js";
import { registerBuiltinAgentToolClasses } from "./agent-tool-hydration.js";

const DEFAULT_SCOPE_USER = "no-user";
const DEFAULT_SCOPE_WORKFLOW = "no-workflow";
const DEFAULT_SESSION_ID = "workflow";

type FileAction =
  | "read"
  | "write"
  | "str_replace"
  | "find_in_content"
  | "find_by_name";

type ActionDef = {
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  invoke: (client: ToolClient, params: Record<string, unknown>) => Promise<unknown>;
};


const FILE_ACTIONS: Record<FileAction, ActionDef> = {
  read: {
    toolName: "sandbox_file_read",
    description: "Read a file from the sandbox.",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string" },
        start_line: { type: "integer" },
        end_line: { type: "integer" }
      },
      required: ["file"]
    },
    invoke: (client, params) =>
      client.fileRead(params as Parameters<ToolClient["fileRead"]>[0])
  },
  write: {
    toolName: "sandbox_file_write",
    description: "Write a file in the sandbox.",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string" },
        content: { type: "string" },
        append: { type: "boolean" },
        leading_newline: { type: "boolean" },
        trailing_newline: { type: "boolean" }
      },
      required: ["file", "content"]
    },
    invoke: (client, params) =>
      client.fileWrite(params as Parameters<ToolClient["fileWrite"]>[0])
  },
  str_replace: {
    toolName: "sandbox_file_str_replace",
    description: "Replace string content inside a sandbox file.",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string" },
        old_str: { type: "string" },
        new_str: { type: "string" }
      },
      required: ["file", "old_str", "new_str"]
    },
    invoke: (client, params) =>
      client.fileStrReplace(
        params as Parameters<ToolClient["fileStrReplace"]>[0]
      )
  },
  find_in_content: {
    toolName: "sandbox_file_find_in_content",
    description: "Find content in a sandbox file using regex.",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string" },
        regex: { type: "string" }
      },
      required: ["file", "regex"]
    },
    invoke: (client, params) =>
      client.fileFindInContent(
        params as Parameters<ToolClient["fileFindInContent"]>[0]
      )
  },
  find_by_name: {
    toolName: "sandbox_file_find_by_name",
    description: "Find files by glob pattern in sandbox workspace.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        glob: { type: "string" }
      },
      required: ["path", "glob"]
    },
    invoke: (client, params) =>
      client.fileFindByName(
        params as Parameters<ToolClient["fileFindByName"]>[0]
      )
  }
};

const SHELL_AGENT_TOOLS: readonly ActionDef[] = [
  {
    toolName: "sandbox_shell_exec",
    description: "Start a shell command in the sandbox.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        command: { type: "string" },
        exec_dir: { type: "string" }
      },
      required: ["id", "command"]
    },
    invoke: (client, params) =>
      client.shellExec(params as Parameters<ToolClient["shellExec"]>[0])
  },
  {
    toolName: "sandbox_shell_wait",
    description: "Wait for a shell command in the sandbox and collect output.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        seconds: { type: "number" }
      },
      required: ["id"]
    },
    invoke: (client, params) =>
      client.shellWait(params as Parameters<ToolClient["shellWait"]>[0])
  },
  {
    toolName: "sandbox_shell_view",
    description: "Read current shell command output in the sandbox.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"]
    },
    invoke: (client, params) =>
      client.shellView(params as Parameters<ToolClient["shellView"]>[0])
  },
  {
    toolName: "sandbox_shell_write",
    description: "Write to a running sandbox shell process.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        input: { type: "string" },
        press_enter: { type: "boolean" }
      },
      required: ["id", "input", "press_enter"]
    },
    invoke: (client, params) =>
      client.shellWriteToProcess(
        params as Parameters<ToolClient["shellWriteToProcess"]>[0]
      )
  },
  {
    toolName: "sandbox_shell_kill",
    description: "Kill a running sandbox shell process.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"]
    },
    invoke: (client, params) =>
      client.shellKillProcess(
        params as Parameters<ToolClient["shellKillProcess"]>[0]
      )
  }
];

let sharedSandboxStore: SessionStore | null = null;
let sandboxStoreCleanupHooksRegistered = false;
let sharedSandboxStoreClosePromise: Promise<void> | null = null;

async function closeSharedSandboxStore(): Promise<void> {
  if (sharedSandboxStoreClosePromise) {
    return sharedSandboxStoreClosePromise;
  }
  if (!sharedSandboxStore) {
    return;
  }
  const store = sharedSandboxStore;
  sharedSandboxStore = null;
  const closePromise = (async () => {
    try {
      await store.close();
    } catch {
      // Best-effort shutdown cleanup: ignore close failures so signal handling can continue.
    }
  })();
  sharedSandboxStoreClosePromise = closePromise;
  try {
    await closePromise;
  } finally {
    if (sharedSandboxStoreClosePromise === closePromise) {
      sharedSandboxStoreClosePromise = null;
    }
  }
}

function registerSandboxStoreCleanupHooks(): void {
  if (
    sandboxStoreCleanupHooksRegistered ||
    typeof process === "undefined" ||
    typeof process.once !== "function"
  ) {
    return;
  }

  sandboxStoreCleanupHooksRegistered = true;
  const handleProcessShutdown = (exitCode: number): void => {
    closeSharedSandboxStore()
      .catch(() => {
        // Ignore cleanup errors while handling process shutdown signals.
      })
      .finally(() => process.exit(exitCode));
  };
  process.once("SIGINT", () => {
    handleProcessShutdown(130);
  });
  process.once("SIGTERM", () => {
    handleProcessShutdown(143);
  });
}

function getSandboxStore(): SessionStore {
  registerSandboxStoreCleanupHooks();
  if (sharedSandboxStore) {
    return sharedSandboxStore;
  }
  sharedSandboxStore = new SessionStore({
    provider: new DockerSandboxProvider()
  });
  return sharedSandboxStore;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    value === undefined ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function asTrimmedString(value: unknown): string {
  return asString(value).trim();
}

/**
 * Path inside the sandbox container where the host workspace is bind-mounted.
 * See DockerSandbox: `${workspaceDir}:/workspace:rw`.
 */
const SANDBOX_WORKSPACE_MOUNT = "/workspace";

/**
 * Resolve the host workspace directory to mount into the sandbox.
 * Prefer the explicit node prop; otherwise auto-mount the workflow's
 * workspace from ProcessingContext so sandbox tools see project files.
 */
function resolveSandboxWorkspaceDir(
  prop: unknown,
  context?: ProcessingContext
): string {
  const explicit = asTrimmedString(prop);
  if (explicit.length > 0) return explicit;
  return asTrimmedString(context?.workspaceDir);
}

/**
 * Build a stable context scope used to isolate sandbox sessions per workflow run.
 * Format: "<userId>:<workflowId>:<jobId>" with explicit fallback tokens.
 */
function getContextScope(context?: ProcessingContext): string {
  if (!context) {
    return `${DEFAULT_SCOPE_USER}:${DEFAULT_SCOPE_WORKFLOW}`;
  }
  const userId = asTrimmedString(context.userId) || DEFAULT_SCOPE_USER;
  const workflowId =
    asTrimmedString(context.workflowId) || DEFAULT_SCOPE_WORKFLOW;
  return `${userId}:${workflowId}`;
}

function toEffectiveSessionId(
  sessionId: string,
  context?: ProcessingContext
): string {
  return `${getContextScope(context)}:${sessionId}`;
}

async function getClient(
  sessionId: string,
  workspaceDir: string,
  context?: ProcessingContext
): Promise<ToolClient> {
  const store = getSandboxStore();
  const options: { workspaceDir?: string; env?: Record<string, string> } = {};
  if (workspaceDir.length > 0) {
    options.workspaceDir = workspaceDir;
  }
  if (context?.userId) {
    options.env = { NODETOOL_USER_ID: context.userId };
  }
  const sandbox = await store.acquire(sessionId, options);
  return sandbox.client;
}

/**
 * Public hook used by `agent-tool-hydration.ts` to acquire a sandbox tool
 * client for the current ProcessingContext, scoped per workflow run. The
 * workflow's `workspaceDir` is bind-mounted into the container at /workspace
 * automatically — sandbox tools selected on a regular AgentNode see the
 * project files without any node-level configuration.
 */
export async function acquireSandboxClient(
  context: ProcessingContext
): Promise<ToolClient> {
  const workspaceDir = asTrimmedString(context?.workspaceDir);
  return getClient(
    toEffectiveSessionId(DEFAULT_SESSION_ID, context),
    workspaceDir,
    context
  );
}

/**
 * Wrap a sandbox ActionDef as a Tool subclass. Used to register sandbox
 * shell/file tools globally so they're selectable on a regular AgentNode.
 */
function makeSandboxActionToolClass(def: ActionDef): new () => Tool {
  return class extends Tool {
    readonly name = def.toolName;
    readonly description = def.description;
    readonly inputSchema = def.inputSchema;

    async process(
      ctx: ProcessingContext,
      params: Record<string, unknown>
    ): Promise<unknown> {
      try {
        const client = await acquireSandboxClient(ctx);
        return await def.invoke(client, params ?? {});
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }
  };
}

export class SandboxShellNode extends BaseNode {
  static readonly nodeType = "nodetool.sandbox.SandboxShell";
  static readonly title = "SandboxShell";
  static readonly description =
    "Execute shell commands in an isolated sandbox session.";
  static readonly metadataOutputTypes = {
    output: "str",
    running: "bool",
    exit_code: "union[int, none]",
    timed_out: "bool"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Workspace Dir",
    description: "Optional sandbox workspace directory."
  })
  declare workspace_dir: string;

  @prop({
    type: "str",
    default: "",
    title: "Command",
    description: "Shell command to execute in the sandbox."
  })
  declare command: string;

  @prop({
    type: "float",
    default: 1,
    title: "Wait Seconds",
    description:
      "If greater than 0, wait this long for output after launching command."
  })
  declare wait_seconds: number;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const effectiveSessionId = toEffectiveSessionId(DEFAULT_SESSION_ID, context);
    const workspaceDir = resolveSandboxWorkspaceDir(this.workspace_dir, context);
    const command = asString(this.command);
    const normalizedCommand = asTrimmedString(this.command);
    const waitSeconds = Number(this.wait_seconds ?? 1);
    const commandId = `cmd-${randomUUID().slice(0, 8)}`;

    if (normalizedCommand.length === 0) {
      throw new Error("Command is required");
    }

    const client = await getClient(effectiveSessionId, workspaceDir, context);
    await client.shellExec({
      id: commandId,
      command,
      exec_dir: workspaceDir.length > 0 ? SANDBOX_WORKSPACE_MOUNT : undefined
    });

    const shellResult =
      waitSeconds > 0
        ? await client.shellWait({ id: commandId, seconds: waitSeconds })
        : await client.shellView({ id: commandId });

    return {
      output: shellResult.output,
      running: shellResult.running,
      exit_code: shellResult.exit_code,
      timed_out: "timed_out" in shellResult ? shellResult.timed_out : false
    };
  }
}

export class SandboxFileNode extends BaseNode {
  static readonly nodeType = "nodetool.sandbox.SandboxFile";
  static readonly title = "SandboxFile";
  static readonly description =
    "Read, write, search, and replace files inside a sandbox session.";
  static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Workspace Dir",
    description: "Optional sandbox workspace directory."
  })
  declare workspace_dir: string;

  @prop({
    type: "enum",
    default: "read",
    title: "Action",
    description: "File action to execute.",
    values: ["read", "write", "str_replace", "find_in_content", "find_by_name"]
  })
  declare action: string;

  @prop({
    type: "dict",
    default: {},
    title: "Params",
    description: "Action parameters validated by the sandbox file tool."
  })
  declare params: Record<string, unknown>;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const effectiveSessionId = toEffectiveSessionId(DEFAULT_SESSION_ID, context);
    const workspaceDir = resolveSandboxWorkspaceDir(this.workspace_dir, context);
    const action = asTrimmedString(this.action || "read") as FileAction;
    const params = asRecord(this.params);
    const client = await getClient(effectiveSessionId, workspaceDir, context);

    const actionDef = FILE_ACTIONS[action];
    if (!actionDef) {
      throw new Error(`Unsupported file action: ${action}`);
    }
    const output = await actionDef.invoke(client, params);

    return {
      output
    };
  }
}

export const SANDBOX_NODES: readonly NodeClass[] = [
  SandboxShellNode,
  SandboxFileNode
];

// Register the full sandbox tool surface into the shared agent-tool registry
// so a plain AgentNode can pick any sandbox_* tool by name without needing
// a dedicated SandboxAgent node. The container is acquired lazily, scoped per
// workflow run, with workspaceDir taken from ProcessingContext.
//   - 11 local browser tools (`browser_*`) drive a host-process Chrome.
//   - 11 sandbox browser tools (`sandbox_browser_*`) drive the container's Chrome.
//   - 5 sandbox shell tools (`sandbox_shell_*`).
//   - 5 sandbox file tools (`sandbox_file_*`).
// Registration runs after this module's body so the cycle through
// agent-tool-hydration -> sandbox is broken by inversion of control.
registerBuiltinAgentToolClasses([
  ...buildBrowserAgentToolClasses(acquireSandboxClient),
  ...SHELL_AGENT_TOOLS.map(makeSandboxActionToolClass),
  ...Object.values(FILE_ACTIONS).map(makeSandboxActionToolClass)
]);
