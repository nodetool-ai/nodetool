import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  DockerSandboxProvider,
  SessionStore,
  type ToolClient
} from "@nodetool-ai/sandbox";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { randomUUID } from "node:crypto";
import { runAgentLoop, type ToolLike } from "./agents.js";

type LanguageModelLike = {
  provider?: string;
  id?: string;
};

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
    const workspaceDir = asTrimmedString(this.workspace_dir);
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
      exec_dir: workspaceDir || undefined
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

export class SandboxBrowserNode extends BaseNode {
  static readonly nodeType = "nodetool.sandbox.SandboxBrowser";
  static readonly title = "SandboxBrowser";
  static readonly description =
    "Control the sandbox browser (navigate, inspect, click, input, and console actions).";
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
    default: "view",
    title: "Action",
    description: "Browser action to execute.",
    values: [
      "view",
      "navigate",
      "restart",
      "click",
      "input_text",
      "move_mouse",
      "press_key",
      "select_option",
      "scroll",
      "console_exec",
      "console_view"
    ]
  })
  declare action: string;

  @prop({
    type: "dict",
    default: {},
    title: "Params",
    description: "Action parameters validated by the sandbox browser tool."
  })
  declare params: Record<string, unknown>;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const effectiveSessionId = toEffectiveSessionId(DEFAULT_SESSION_ID, context);
    const workspaceDir = asTrimmedString(this.workspace_dir);
    const action = asTrimmedString(this.action || "view") as BrowserAction;
    const params = asRecord(this.params);
    const client = await getClient(effectiveSessionId, workspaceDir, context);

    const actionDef = BROWSER_ACTIONS[action];
    if (!actionDef) {
      throw new Error(`Unsupported browser action: ${action}`);
    }
    const output = await actionDef.invoke(client, params);

    return {
      output
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
    const workspaceDir = asTrimmedString(this.workspace_dir);
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

export class SandboxAgentNode extends BaseNode {
  static readonly nodeType = "nodetool.sandbox.SandboxAgent";
  static readonly title = "SandboxAgent";
  static readonly description =
    "Prompt-driven agent with access to configured sandbox shell, browser, and file tools.";
  static readonly metadataOutputTypes = {
    text: "str"
  };
  static readonly isStreamingOutput = true;

  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used by the sandbox agent."
  })
  declare model: LanguageModelLike;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt describing what the sandbox agent should do."
  })
  declare prompt: string;

  @prop({
    type: "str",
    default: "",
    title: "System Prompt",
    description: "Optional system prompt."
  })
  declare system_prompt: string;

  @prop({
    type: "str",
    default: "",
    title: "Workspace Dir",
    description: "Optional sandbox workspace directory."
  })
  declare workspace_dir: string;

  @prop({
    type: "int",
    default: 12,
    title: "Max Iterations",
    description: "Maximum agent tool-calling iterations.",
    min: 1,
    max: 100
  })
  declare max_iterations: number;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const prompt = String(this.prompt ?? "").trim();
    if (prompt.length === 0) {
      throw new Error("Prompt is required");
    }
    if (!context || typeof context.getProvider !== "function") {
      throw new Error("Processing context with provider access is required");
    }

    const model = (this.model ?? {}) as LanguageModelLike;
    const providerId = asTrimmedString(model.provider);
    const modelId = asTrimmedString(model.id);
    if (providerId.length === 0 || modelId.length === 0) {
      throw new Error("Select a model for SandboxAgent.");
    }

    const effectiveSessionId = toEffectiveSessionId(DEFAULT_SESSION_ID, context);
    const workspaceDir = asTrimmedString(this.workspace_dir);
    const maxIterations = Number(this.max_iterations ?? 12);
    const client = await getClient(effectiveSessionId, workspaceDir, context);
    const tools = createAgentTools(client);

    const { text } = await runAgentLoop({
      context,
      providerId,
      modelId,
      systemPrompt:
        String(this.system_prompt ?? "").trim() ||
        "You are a careful sandbox execution agent. Use tools and provide concise results.",
      prompt,
      tools,
      maxTokens: 4096,
      maxIterations
    });

    return {
      text
    };
  }
}

export const SANDBOX_NODES: readonly NodeClass[] = [
  SandboxShellNode,
  SandboxBrowserNode,
  SandboxFileNode,
  SandboxAgentNode
];
