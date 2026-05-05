import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  DockerSandboxProvider,
  SessionStore,
  type ToolClient
} from "@nodetool-ai/sandbox";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { randomUUID } from "node:crypto";
import { AgentNode, type ToolLike } from "./agents.js";

const DEFAULT_SCOPE_USER = "no-user";
const DEFAULT_SCOPE_WORKFLOW = "no-workflow";
const DEFAULT_SESSION_ID = "workflow";

type BrowserAction =
  | "view"
  | "navigate"
  | "restart"
  | "click"
  | "input_text"
  | "move_mouse"
  | "press_key"
  | "select_option"
  | "scroll"
  | "console_exec"
  | "console_view";

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

const BROWSER_ACTIONS: Record<BrowserAction, ActionDef> = {
  view: {
    toolName: "sandbox_browser_view",
    description: "Inspect current sandbox browser page and elements.",
    inputSchema: {
      type: "object",
      properties: {
        include_screenshot: { type: "boolean" }
      }
    },
    invoke: (client, params) =>
      client.browserView(params as Parameters<ToolClient["browserView"]>[0])
  },
  navigate: {
    toolName: "sandbox_browser_navigate",
    description: "Navigate the sandbox browser to a URL.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        wait_until: {
          type: "string",
          enum: ["load", "domcontentloaded", "networkidle"]
        }
      },
      required: ["url"]
    },
    invoke: (client, params) =>
      client.browserNavigate(
        params as Parameters<ToolClient["browserNavigate"]>[0]
      )
  },
  restart: {
    toolName: "sandbox_browser_restart",
    description: "Restart sandbox browser context.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" }
      }
    },
    invoke: (client, params) =>
      client.browserRestart(params as Parameters<ToolClient["browserRestart"]>[0])
  },
  click: {
    toolName: "sandbox_browser_click",
    description: "Click an element in the sandbox browser.",
    inputSchema: {
      type: "object",
      properties: {
        index: { type: "integer" },
        coordinate_x: { type: "integer" },
        coordinate_y: { type: "integer" }
      }
    },
    invoke: (client, params) =>
      client.browserClick(params as Parameters<ToolClient["browserClick"]>[0])
  },
  input_text: {
    toolName: "sandbox_browser_input_text",
    description: "Type into an element in the sandbox browser.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        press_enter: { type: "boolean" },
        index: { type: "integer" },
        coordinate_x: { type: "integer" },
        coordinate_y: { type: "integer" }
      },
      required: ["text"]
    },
    invoke: (client, params) =>
      client.browserInput(params as Parameters<ToolClient["browserInput"]>[0])
  },
  move_mouse: {
    toolName: "sandbox_browser_move_mouse",
    description: "Move mouse in sandbox browser viewport.",
    inputSchema: {
      type: "object",
      properties: {
        coordinate_x: { type: "integer" },
        coordinate_y: { type: "integer" }
      },
      required: ["coordinate_x", "coordinate_y"]
    },
    invoke: (client, params) =>
      client.browserMoveMouse(
        params as Parameters<ToolClient["browserMoveMouse"]>[0]
      )
  },
  press_key: {
    toolName: "sandbox_browser_press_key",
    description: "Press a keyboard key in the sandbox browser.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string" }
      },
      required: ["key"]
    },
    invoke: (client, params) =>
      client.browserPressKey(
        params as Parameters<ToolClient["browserPressKey"]>[0]
      )
  },
  select_option: {
    toolName: "sandbox_browser_select_option",
    description: "Select an option in a sandbox browser select element.",
    inputSchema: {
      type: "object",
      properties: {
        index: { type: "integer" },
        option: { type: "string" }
      },
      required: ["index", "option"]
    },
    invoke: (client, params) =>
      client.browserSelectOption(
        params as Parameters<ToolClient["browserSelectOption"]>[0]
      )
  },
  scroll: {
    toolName: "sandbox_browser_scroll",
    description: "Scroll the sandbox browser page.",
    inputSchema: {
      type: "object",
      properties: {
        to_top: { type: "boolean" },
        to_bottom: { type: "boolean" },
        pixels: { type: "integer" }
      }
    },
    invoke: (client, params) =>
      client.browserScroll(params as Parameters<ToolClient["browserScroll"]>[0])
  },
  console_exec: {
    toolName: "sandbox_browser_console_exec",
    description: "Execute JavaScript in sandbox browser console.",
    inputSchema: {
      type: "object",
      properties: {
        javascript: { type: "string" }
      },
      required: ["javascript"]
    },
    invoke: (client, params) =>
      client.browserConsoleExec(
        params as Parameters<ToolClient["browserConsoleExec"]>[0]
      )
  },
  console_view: {
    toolName: "sandbox_browser_console_view",
    description: "View sandbox browser console messages.",
    inputSchema: {
      type: "object",
      properties: {
        max_lines: { type: "integer" }
      }
    },
    invoke: (client, params) =>
      client.browserConsoleView(
        params as Parameters<ToolClient["browserConsoleView"]>[0]
      )
  }
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

function createAgentTools(client: ToolClient): ToolLike[] {
  const defs: ActionDef[] = [
    ...SHELL_AGENT_TOOLS,
    ...Object.values(FILE_ACTIONS),
    ...Object.values(BROWSER_ACTIONS)
  ];

  return defs.map((def) => ({
    name: def.toolName,
    description: def.description,
    inputSchema: def.inputSchema,
    process: async (_context, params) => def.invoke(client, params)
  }));
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

/**
 * Browser nodes share a single sandbox session per workflow run; they don't
 * own a workspace mount, so the workspace_dir prop is intentionally absent.
 * The session is acquired without a workspaceDir override — if the workflow
 * already has a SandboxShell/SandboxFile node mounting one, that mount is
 * reused; otherwise the sandbox runs without a mount.
 */
async function browserClient(context?: ProcessingContext): Promise<ToolClient> {
  const sessionId = toEffectiveSessionId(DEFAULT_SESSION_ID, context);
  return getClient(sessionId, "", context);
}

export class SandboxBrowserViewNode extends BaseNode {
  static readonly nodeType = "nodetool.sandbox.SandboxBrowserView";
  static readonly title = "SandboxBrowserView";
  static readonly description =
    "Inspect the sandbox browser page: URL, title, viewport, indexed elements, and an optional screenshot.";
  static readonly metadataOutputTypes = {
    url: "str",
    title: "str",
    viewport: "dict[str, any]",
    elements: "list[dict[str, any]]",
    screenshot_png_b64: "union[str, none]"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "bool",
    default: false,
    title: "Include Screenshot",
    description: "Capture a base64-encoded PNG screenshot of the viewport."
  })
  declare include_screenshot: boolean;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const client = await browserClient(context);
    const out = await client.browserView({
      include_screenshot: Boolean(this.include_screenshot)
    });
    return {
      url: out.url,
      title: out.title,
      viewport: out.viewport,
      elements: out.elements,
      screenshot_png_b64: out.screenshot_png_b64
    };
  }
}

export class SandboxBrowserNavigateNode extends BaseNode {
  static readonly nodeType = "nodetool.sandbox.SandboxBrowserNavigate";
  static readonly title = "SandboxBrowserNavigate";
  static readonly description = "Navigate the sandbox browser to a URL.";
  static readonly metadataOutputTypes = {
    url: "str",
    title: "str",
    status: "union[int, none]"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "URL",
    description: "Absolute URL to navigate to."
  })
  declare url: string;

  @prop({
    type: "enum",
    default: "load",
    title: "Wait Until",
    description: "Page lifecycle event to wait for after navigation.",
    values: ["load", "domcontentloaded", "networkidle"]
  })
  declare wait_until: string;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const url = asTrimmedString(this.url);
    if (url.length === 0) throw new Error("URL is required");
    const client = await browserClient(context);
    const out = await client.browserNavigate({
      url,
      wait_until: this.wait_until as
        | "load"
        | "domcontentloaded"
        | "networkidle"
    });
    return { url: out.url, title: out.title, status: out.status };
  }
}

export class SandboxBrowserConsoleExecNode extends BaseNode {
  static readonly nodeType = "nodetool.sandbox.SandboxBrowserConsoleExec";
  static readonly title = "SandboxBrowserConsoleExec";
  static readonly description =
    "Execute a JavaScript expression in the page and return the JSON-serialised result.";
  static readonly metadataOutputTypes = {
    result_json: "str"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "JavaScript",
    description: "Expression evaluated in the page context."
  })
  declare javascript: string;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const javascript = asString(this.javascript);
    if (javascript.trim().length === 0) {
      throw new Error("JavaScript is required");
    }
    const client = await browserClient(context);
    const out = await client.browserConsoleExec({ javascript });
    return { result_json: out.result_json };
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

/**
 * SandboxAgent — same as the standard Agent node, but augments the tool
 * list with the sandbox shell/browser/file actions and auto-mounts the
 * workflow workspace into the container. Inherits streaming, mode
 * dispatch (loop/plan/multi-agent), history, threads, image/audio,
 * structured outputs, control tools, and the agentic-provider fast-path
 * from AgentNode.
 */
export class SandboxAgentNode extends AgentNode {
  static readonly nodeType = "nodetool.sandbox.SandboxAgent";
  static readonly title = "SandboxAgent";
  static readonly description =
    "Agent with access to sandbox shell, browser, and file tools alongside any user-selected tools.";

  @prop({
    type: "str",
    default: "",
    title: "Workspace Dir",
    description:
      "Host directory bind-mounted into the sandbox at /workspace. Defaults to the workflow's workspace."
  })
  declare workspace_dir: string;

  protected override async buildTools(
    context?: ProcessingContext
  ): Promise<ToolLike[]> {
    const userTools = await super.buildTools(context);
    const sessionId = toEffectiveSessionId(DEFAULT_SESSION_ID, context);
    const workspaceDir = resolveSandboxWorkspaceDir(this.workspace_dir, context);
    const client = await getClient(sessionId, workspaceDir, context);
    return [...createAgentTools(client), ...userTools];
  }
}

export const SANDBOX_NODES: readonly NodeClass[] = [
  SandboxShellNode,
  SandboxBrowserViewNode,
  SandboxBrowserNavigateNode,
  SandboxBrowserConsoleExecNode,
  SandboxFileNode,
  SandboxAgentNode
];
