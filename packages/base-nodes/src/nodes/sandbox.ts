import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  DockerSandboxProvider,
  SessionStore,
  type ToolClient
} from "@nodetool/sandbox";
import type { ProcessingContext } from "@nodetool/runtime";
import { randomUUID } from "node:crypto";
import { runAgentLoop, type ToolLike } from "./agents.js";

type LanguageModelLike = {
  provider?: string;
  id?: string;
};

let sharedSandboxStore: SessionStore | null = null;

function getSandboxStore(): SessionStore {
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

function resolveSessionId(value: unknown): string {
  const sessionId = String(value ?? "").trim();
  if (sessionId.length > 0) {
    return sessionId;
  }
  return `workflow-${randomUUID().slice(0, 8)}`;
}

async function getClient(
  sessionId: string,
  workspaceDir: string
): Promise<ToolClient> {
  const store = getSandboxStore();
  const options: { workspaceDir?: string } = {};
  if (workspaceDir.length > 0) {
    options.workspaceDir = workspaceDir;
  }
  const sandbox = await store.acquire(sessionId, options);
  return sandbox.client;
}

function createAgentTools(client: ToolClient): ToolLike[] {
  return [
    {
      name: "sandbox_shell_exec",
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
      process: async (_context, params) =>
        client.shellExec(params as Parameters<ToolClient["shellExec"]>[0])
    },
    {
      name: "sandbox_shell_wait",
      description: "Wait for a shell command in the sandbox and collect output.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          seconds: { type: "number" }
        },
        required: ["id"]
      },
      process: async (_context, params) =>
        client.shellWait(params as Parameters<ToolClient["shellWait"]>[0])
    },
    {
      name: "sandbox_shell_view",
      description: "Read current shell command output in the sandbox.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"]
      },
      process: async (_context, params) =>
        client.shellView(params as Parameters<ToolClient["shellView"]>[0])
    },
    {
      name: "sandbox_file_read",
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
      process: async (_context, params) =>
        client.fileRead(params as Parameters<ToolClient["fileRead"]>[0])
    },
    {
      name: "sandbox_file_write",
      description: "Write a file in the sandbox.",
      inputSchema: {
        type: "object",
        properties: {
          file: { type: "string" },
          content: { type: "string" },
          append: { type: "boolean" }
        },
        required: ["file", "content"]
      },
      process: async (_context, params) =>
        client.fileWrite(params as Parameters<ToolClient["fileWrite"]>[0])
    },
    {
      name: "sandbox_browser_navigate",
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
      process: async (_context, params) =>
        client.browserNavigate(
          params as Parameters<ToolClient["browserNavigate"]>[0]
        )
    },
    {
      name: "sandbox_browser_view",
      description: "Inspect current sandbox browser page and elements.",
      inputSchema: {
        type: "object",
        properties: {
          include_screenshot: { type: "boolean" }
        }
      },
      process: async (_context, params) =>
        client.browserView(params as Parameters<ToolClient["browserView"]>[0])
    },
    {
      name: "sandbox_browser_click",
      description: "Click an element in the sandbox browser.",
      inputSchema: {
        type: "object",
        properties: {
          index: { type: "integer" },
          coordinate_x: { type: "integer" },
          coordinate_y: { type: "integer" }
        }
      },
      process: async (_context, params) =>
        client.browserClick(params as Parameters<ToolClient["browserClick"]>[0])
    },
    {
      name: "sandbox_browser_input",
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
      process: async (_context, params) =>
        client.browserInput(params as Parameters<ToolClient["browserInput"]>[0])
    }
  ];
}

export class SandboxShellNode extends BaseNode {
  static readonly nodeType = "nodetool.sandbox.SandboxShell";
  static readonly title = "SandboxShell";
  static readonly description =
    "Execute shell commands in an isolated sandbox session.";
  static readonly metadataOutputTypes = {
    session_id: "str",
    command_id: "str",
    output: "dict[str, any]"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Session ID",
    description:
      "Reuse a sandbox session by ID. Leave empty to create a transient session ID."
  })
  declare session_id: string;

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
    type: "str",
    default: "",
    title: "Command ID",
    description: "Optional command process ID for later shell view/wait calls."
  })
  declare command_id: string;

  @prop({
    type: "float",
    default: 1,
    title: "Wait Seconds",
    description:
      "If greater than 0, wait this long for output after launching command."
  })
  declare wait_seconds: number;

  async process(): Promise<Record<string, unknown>> {
    const sessionId = resolveSessionId(this.session_id);
    const workspaceDir = String(this.workspace_dir ?? "").trim();
    const command = String(this.command ?? "").trim();
    const waitSeconds = Number(this.wait_seconds ?? 1);
    const commandId =
      String(this.command_id ?? "").trim() ||
      `cmd-${randomUUID().slice(0, 8)}`;

    if (command.length === 0) {
      throw new Error("Command is required");
    }

    const client = await getClient(sessionId, workspaceDir);
    await client.shellExec({
      id: commandId,
      command,
      exec_dir: workspaceDir || undefined
    });

    const output =
      waitSeconds > 0
        ? await client.shellWait({ id: commandId, seconds: waitSeconds })
        : await client.shellView({ id: commandId });

    return {
      session_id: sessionId,
      command_id: commandId,
      output
    };
  }
}

export class SandboxBrowserNode extends BaseNode {
  static readonly nodeType = "nodetool.sandbox.SandboxBrowser";
  static readonly title = "SandboxBrowser";
  static readonly description =
    "Control the sandbox browser (navigate, inspect, click, input, and console actions).";
  static readonly metadataOutputTypes = {
    session_id: "str",
    output: "dict[str, any]"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Session ID",
    description: "Sandbox session ID."
  })
  declare session_id: string;

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

  async process(): Promise<Record<string, unknown>> {
    const sessionId = resolveSessionId(this.session_id);
    const workspaceDir = String(this.workspace_dir ?? "").trim();
    const action = String(this.action ?? "view");
    const params = asRecord(this.params);
    const client = await getClient(sessionId, workspaceDir);

    let output: unknown;
    switch (action) {
      case "view":
        output = await client.browserView(
          params as Parameters<ToolClient["browserView"]>[0]
        );
        break;
      case "navigate":
        output = await client.browserNavigate(
          params as Parameters<ToolClient["browserNavigate"]>[0]
        );
        break;
      case "restart":
        output = await client.browserRestart(
          params as Parameters<ToolClient["browserRestart"]>[0]
        );
        break;
      case "click":
        output = await client.browserClick(
          params as Parameters<ToolClient["browserClick"]>[0]
        );
        break;
      case "input_text":
        output = await client.browserInput(
          params as Parameters<ToolClient["browserInput"]>[0]
        );
        break;
      case "move_mouse":
        output = await client.browserMoveMouse(
          params as Parameters<ToolClient["browserMoveMouse"]>[0]
        );
        break;
      case "press_key":
        output = await client.browserPressKey(
          params as Parameters<ToolClient["browserPressKey"]>[0]
        );
        break;
      case "select_option":
        output = await client.browserSelectOption(
          params as Parameters<ToolClient["browserSelectOption"]>[0]
        );
        break;
      case "scroll":
        output = await client.browserScroll(
          params as Parameters<ToolClient["browserScroll"]>[0]
        );
        break;
      case "console_exec":
        output = await client.browserConsoleExec(
          params as Parameters<ToolClient["browserConsoleExec"]>[0]
        );
        break;
      case "console_view":
        output = await client.browserConsoleView(
          params as Parameters<ToolClient["browserConsoleView"]>[0]
        );
        break;
      default:
        throw new Error(`Unsupported browser action: ${action}`);
    }

    return {
      session_id: sessionId,
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
    session_id: "str",
    output: "dict[str, any]"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Session ID",
    description: "Sandbox session ID."
  })
  declare session_id: string;

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

  async process(): Promise<Record<string, unknown>> {
    const sessionId = resolveSessionId(this.session_id);
    const workspaceDir = String(this.workspace_dir ?? "").trim();
    const action = String(this.action ?? "read");
    const params = asRecord(this.params);
    const client = await getClient(sessionId, workspaceDir);

    let output: unknown;
    switch (action) {
      case "read":
        output = await client.fileRead(
          params as Parameters<ToolClient["fileRead"]>[0]
        );
        break;
      case "write":
        output = await client.fileWrite(
          params as Parameters<ToolClient["fileWrite"]>[0]
        );
        break;
      case "str_replace":
        output = await client.fileStrReplace(
          params as Parameters<ToolClient["fileStrReplace"]>[0]
        );
        break;
      case "find_in_content":
        output = await client.fileFindInContent(
          params as Parameters<ToolClient["fileFindInContent"]>[0]
        );
        break;
      case "find_by_name":
        output = await client.fileFindByName(
          params as Parameters<ToolClient["fileFindByName"]>[0]
        );
        break;
      default:
        throw new Error(`Unsupported file action: ${action}`);
    }

    return {
      session_id: sessionId,
      output
    };
  }
}

export class SandboxAgentNode extends BaseNode {
  static readonly nodeType = "nodetool.sandbox.SandboxAgent";
  static readonly title = "SandboxAgent";
  static readonly description =
    "Prompt-driven agent with full sandbox tool access (shell, browser, file, desktop).";
  static readonly metadataOutputTypes = {
    session_id: "str",
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
    title: "Session ID",
    description: "Sandbox session ID."
  })
  declare session_id: string;

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
    const providerId = String(model.provider ?? "").trim();
    const modelId = String(model.id ?? "").trim();
    if (providerId.length === 0 || modelId.length === 0) {
      throw new Error("Select a model for SandboxAgent.");
    }

    const sessionId = resolveSessionId(this.session_id);
    const workspaceDir = String(this.workspace_dir ?? "").trim();
    const maxIterations = Number(this.max_iterations ?? 12);
    const client = await getClient(sessionId, workspaceDir);
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
      session_id: sessionId,
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
