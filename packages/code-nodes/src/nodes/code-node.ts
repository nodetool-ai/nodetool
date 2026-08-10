/**
 * Universal Code Node — sandboxed JavaScript execution via QuickJS WASM.
 *
 * Runs user code in an isolated QuickJS WebAssembly guest (see
 * `@nodetool-ai/agents/js-sandbox`) with standard JavaScript plus the bridge
 * APIs: fetch(), workspace (text/bytes/stat/mkdir/remove/copy/move/root),
 * getSecret(), sleep(), progress(), crypto (randomUUID/digest/hmac), format,
 * data (CSV/HTML parsing) and the base64/hex helpers. Dynamic inputs arrive
 * on the `inputs` object.
 *
 * On a server host the code also gets the `nodetool` object model — the
 * platform as objects (`nodetool.workflows`, `nodetool.assets`, …), backed by
 * the agent toolbelt through a `tools.<name>()` bridge. The belt is loaded
 * lazily and only on Node: the in-browser runner bundles this module, so the
 * toolbelt (native canvas, IMAP, execution) must never sit in its static
 * import graph. Without a belt, `nodetool.capabilities()` reports `{}` and
 * every method throws naming its missing tool instead of a ReferenceError.
 *
 * Example:
 *   // inputs: { x: 5, text: "hello" }
 *   // code:
 *   const sum = inputs.x + 10;
 *   const upper = inputs.text.toUpperCase();
 *   return { sum, upper };
 *   // outputs: { sum: 15, upper: "HELLO" }
 */

import {
  BaseNode,
  prop,
  CODE_INPUTS_GLOBAL,
  NodeRegistry,
  parseSandboxModuleDeclarations
} from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  runInSandbox,
  TOOLS_PRELUDE,
  NODETOOL_API_PRELUDE_FULL,
  type SandboxLimits
} from "@nodetool-ai/agents/js-sandbox";
import { importHidden } from "@nodetool-ai/config";
import { ALL_PLATFORMS, type SandboxModuleResolution } from "@nodetool-ai/protocol";

/** JS keywords that cannot be used as variable names. */
const JS_RESERVED = new Set([
  "abstract",
  "arguments",
  "await",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "double",
  "else",
  "enum",
  "eval",
  "export",
  "extends",
  "false",
  "final",
  "finally",
  "float",
  "for",
  "function",
  "goto",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "int",
  "interface",
  "let",
  "long",
  "native",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "short",
  "static",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "true",
  "try",
  "typeof",
  "undefined",
  "var",
  "void",
  "volatile",
  "while",
  "with",
  "yield"
]);

/** Statement keywords that should never be wrapped with `return (...)`. */
const STATEMENT_KEYWORDS =
  /^(if|else|for|while|do|switch|try|catch|finally|throw|const|let|var|class|function|with|debugger|break|continue|return)\b/;

// ---------------------------------------------------------------------------
// The `nodetool` object model — toolbelt bridge
// ---------------------------------------------------------------------------

/**
 * The guest prelude every run gets: `tools.<name>()` wrappers over the
 * `__callTool` bridge, then the `nodetool` object model on top of them. Both
 * are plain strings, so prepending them costs nothing even where no belt
 * exists — the object model degrades per namespace by design.
 */
const NODETOOL_PRELUDE = `${TOOLS_PRELUDE}\n${NODETOOL_API_PRELUDE_FULL}`;

/** Type-only view of the agents package index; erased at compile time. */
type AgentsModule = typeof import("@nodetool-ai/agents");
type AgentTool = InstanceType<AgentsModule["Tool"]>;

/**
 * Bridge globals for a host with no toolbelt (browser runner, no context):
 * the prelude builds zero wrappers, `nodetool.capabilities()` returns `{}`,
 * and every `nodetool.*` method throws naming its missing tool.
 */
const NO_TOOLS_GLOBALS: Record<string, unknown> = {
  __toolNames: [] as string[],
  __callTool: async () => ({
    ok: false as const,
    error: "no tools in this environment"
  })
};

let agentsModulePromise: Promise<AgentsModule | null> | null = null;

/**
 * The agents package index, loaded lazily and hidden from bundlers.
 * `importHidden` answers `null` off Node, so a browser bundle never resolves
 * the toolbelt's server-only dependencies. Hosts where the bare specifier is
 * not resolvable at runtime (the packaged Electron backend inlines workspace
 * packages instead of staging them in `_modules/`) degrade the same way the
 * browser does unless they inject a belt via {@link setCodeNodeTools}.
 */
function loadAgentsModule(): Promise<AgentsModule | null> {
  if (!agentsModulePromise) {
    agentsModulePromise = importHidden<AgentsModule>(
      "@nodetool-ai/agents"
    ).catch(() => null);
  }
  return agentsModulePromise;
}

let toolOverride: AgentTool[] | null = null;

/**
 * Test/host injection point: replace the assembled toolbelt with a fixed set
 * (`[]` simulates a beltless host). Pass `null` to restore the default
 * assembly.
 */
export function setCodeNodeTools(tools: AgentTool[] | null): void {
  toolOverride = tools;
}

/**
 * Assemble the belt the way an agent loop would: `getAgentToolbelt()` plus
 * the in-process core API tools. Only the node registry is constructible
 * here (`NodeRegistry.global` — populated in any process that registered
 * node packages); the example catalog, DSL exporter and provider set live
 * above this package, so their tools stay dark and the `nodetool` prelude
 * reports the difference via `capabilities()`.
 */
function assembleToolbelt(mod: AgentsModule): AgentTool[] {
  const byName = new Map<string, AgentTool>();
  const registry = NodeRegistry.global;
  for (const tool of [
    ...mod.getAgentToolbelt(),
    ...mod.getAllMcpTools({ registry })
  ]) {
    byName.set(tool.name, tool);
  }
  return [...byName.values()];
}

/**
 * Globals wiring the `tools`/`nodetool` preludes to a real tool bridge, or
 * the inert stub when no belt is constructible. Tool execution needs a
 * ProcessingContext; without one the stub keeps the prelude harmless.
 */
async function toolBridgeGlobals(
  context: ProcessingContext | undefined
): Promise<Record<string, unknown>> {
  if (!context) return NO_TOOLS_GLOBALS;
  const mod = await loadAgentsModule();
  if (!mod) return NO_TOOLS_GLOBALS;
  const tools = toolOverride ?? assembleToolbelt(mod);
  return mod.buildToolBridge({ tools, context }).globals;
}

export class CodeNode extends BaseNode {
  static readonly nodeType = "nodetool.code.Code";
  static readonly platforms = ALL_PLATFORMS;
  static readonly title = "Code";
  static readonly description =
    "Execute vanilla JavaScript in a sandboxed environment. " +
    "APIs: fetch(), workspace.read/write/list/readBytes/writeBytes/stat/mkdir/remove/copy/move/root(), " +
    "getSecret(), sleep(), progress(), crypto.digest/hmac/randomUUID/getRandomValues, " +
    "format.number/date/relativeTime/list, data.parseCsv/selectHtml, " +
    "toBase64/fromBase64/toHex/fromHex, parallelMap, plus the `nodetool` object model " +
    "(workflows, assets, jobs, …) backed by platform tools on server hosts — " +
    "nodetool.capabilities() reports what is live. Tool-backed calls can spend money " +
    "(media generation, workflow runs) and reach the web; each tool applies its own " +
    "permission gating. " +
    "Dynamic inputs arrive on the `inputs` object; return an object to define outputs." +
    "\n    code, javascript, function, script, dynamic";
  static readonly inlineFields = ["code"];
  static readonly inputFields = [];
  static readonly supportsDynamicInputs = true;
  static readonly supportsDynamicOutputs = true;

  /** Persistent state across streaming invocations; reset each workflow run. */
  private _state: Record<string, unknown> = {};

  @prop({
    type: "str",
    default: "return {};",
    title: "Code",
    description:
      "JavaScript code to execute. " +
      "Dynamic inputs arrive on the `inputs` object. " +
      "APIs: fetch(url, options), workspace.read/write/list/readBytes/writeBytes/stat/mkdir/remove/copy/move/root, " +
      "workspace.stat(path) returns {exists, size, isDirectory, isFile, isSymlink, modifiedMs, createdMs, accessedMs}, " +
      "getSecret(name), sleep(ms), progress(percent, message), " +
      "crypto.randomUUID/getRandomValues/digest/hmac, " +
      "format.number/date/relativeTime/list, " +
      "data.parseCsv(text, {delimiter, header}), data.selectHtml(html, selector, {attr, limit}), " +
      "toBase64/fromBase64/toHex/fromHex. Await fetch, sleep, workspace, getSecret, format, " +
      "data and crypto.digest/hmac; the rest are synchronous. " +
      "Concurrent calls run in parallel: use Promise.all or " +
      "parallelMap(items, fn, concurrency) to fan out fetches. " +
      "The `nodetool` object model exposes platform tools (nodetool.workflows, " +
      "nodetool.assets, …) where the host carries them — nodetool.capabilities() " +
      "reports live namespaces; elsewhere a method throws naming its missing tool. " +
      "A persistent `state` object survives across streaming invocations. " +
      "Return an object — its keys become output handles."
  })
  declare code: string;

  @prop({
    type: "list[dict]",
    default: [],
    title: "Packages",
    description:
      "Sandbox packages this code may import, as specifiers or " +
      '{specifier, resolvedPackVersion, contentDigest} objects — e.g. ["@acme/geo"]. ' +
      "The sandbox resolves only what is listed here; every other `import` fails, " +
      "and dynamic `import()`/`require()` are never available."
  })
  declare packages: unknown[];

  @prop({
    type: "int",
    default: 30,
    title: "Timeout",
    description: "Max seconds before execution is aborted (0 = no limit)."
  })
  declare timeout: number;

  @prop({
    type: "int",
    default: 1,
    title: "Max Response Size",
    description:
      "Megabytes of response body a single fetch() may read before it is aborted."
  })
  declare max_response_mb: number;

  @prop({
    type: "bool",
    default: false,
    title: "Allow Local Network",
    description:
      "Permit fetch() to reach localhost and private IP ranges. Off by default — " +
      "sandboxed code is untrusted, so the SSRF guard is the norm. Turn it on " +
      "only for a node that has to reach a service on this machine or network."
  })
  declare allow_local_network: boolean;

  @prop({
    type: "bool",
    default: false,
    title: "Allow Host Filesystem",
    description:
      "Let workspace.* reach any path the process can, with ~ expanded, instead " +
      "of being confined to the workspace. Off by default — host mode can read " +
      "credential files. Turn it on only for a node that has to work outside " +
      "the workspace."
  })
  declare allow_host_filesystem: boolean;

  async initialize(): Promise<void> {
    this._state = {};
  }

  /**
   * Forward guest `progress(percent, message)` calls to the kernel as
   * `node_progress` messages — the same channel the Python worker and the
   * ComfyUI node use, so the editor's node progress bar picks them up.
   */
  private progressSink(
    context?: ProcessingContext
  ): ((progress: number, message?: string) => void) | undefined {
    if (!context || !this.__node_id) return undefined;
    return (progress: number, message?: string) => {
      context.postMessage({
        type: "node_progress",
        node_id: this.__node_id,
        progress,
        total: 100,
        chunk: message,
        workflow_id: context.workflowId
      });
    };
  }

  /**
   * Sandbox policy from the node's props. The sandbox clamps
   * `maxResponseBodyBytes` to its own ceiling, so no clamping here.
   *
   * The two capability switches default to the restrictive value and are only
   * ever widened by an explicit choice on this node — nothing the guest code
   * can reach.
   */
  private sandboxLimits(): SandboxLimits {
    const mb = Number(this.max_response_mb ?? 1);
    return {
      maxResponseBodyBytes: Number.isFinite(mb)
        ? Math.round(mb * 1024 * 1024)
        : undefined,
      allowPrivateNetwork: this.allow_local_network === true,
      filesystemAccess:
        this.allow_host_filesystem === true ? "host" : "workspace"
    };
  }

  /**
   * Resolve the node's `packages` declarations through the host's catalog.
   *
   * Nothing declared means nothing importable: no resolution is built and the
   * sandbox installs no loader at all. A declaration that cannot be served —
   * no catalog in this process, an uninstalled pack, a module the host refused
   * — fails the node here rather than as a resolve error inside the guest.
   * Version and digest drift only warn: resolution uses what is installed, and
   * saying so on the node's log is the whole remedy.
   */
  private resolveModules(
    context?: ProcessingContext
  ): SandboxModuleResolution | undefined {
    const { declarations, invalid } = parseSandboxModuleDeclarations(
      this.packages
    );
    if (invalid.length > 0) {
      throw new Error(
        `Invalid \`packages\` declaration${invalid.length > 1 ? "s" : ""}: ${invalid.join(", ")}. ` +
          "Each entry is a module specifier, or an object with a `specifier`."
      );
    }
    if (declarations.length === 0) return undefined;

    const catalog = context?.sandboxModuleCatalog;
    if (!catalog) {
      throw new Error(
        `Sandbox packages are not available in this process, so ${declarations
          .map((declaration) => `"${declaration.specifier}"`)
          .join(", ")} cannot be imported.`
      );
    }

    const resolution = catalog.resolveForExecution(declarations);
    const errors = resolution.statuses.filter(
      (status) => status.status === "error"
    );
    if (errors.length > 0) {
      throw new Error(
        errors
          .map((status) => `${status.message} (pack "${status.packName}")`)
          .join(" ")
      );
    }
    for (const status of resolution.statuses) {
      if (status.status !== "warning") continue;
      this.logWarning(context, `${status.message} (pack "${status.packName}")`);
    }
    return resolution;
  }

  /** Post a warning on the node's log channel, where the run has one. */
  private logWarning(
    context: ProcessingContext | undefined,
    content: string
  ): void {
    if (!context || !this.__node_id) return;
    context.postMessage({
      type: "log_update",
      node_id: this.__node_id,
      node_name: CodeNode.title,
      content,
      severity: "warning",
      workflow_id: context.workflowId
    });
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const code = String(this.code ?? "return {};");
    const timeout = Number(this.timeout ?? 30);

    // Extract dynamic inputs (filter reserved/invalid keys).
    // Merge declared props with dynamicProps so that dynamic inputs are available.
    const allInputs = {
      ...this.serialize(),
      ...Object.fromEntries(this.dynamicProps)
    };
    const dynamicInputs = extractDynamicInputs(allInputs);

    // Build the function body with implicit return support.
    const body = hasReturnStatement(code) ? code : wrapImplicitReturn(code);

    // Declared inputs arrive on one `inputs` object rather than as globals of
    // their own name. Sharing the global namespace with the sandbox API let an
    // input called `env` or `data` shadow a bridge, and made every undeclared
    // identifier ambiguous between a typo and a missing slot.
    // State stays a direct reference so mutations persist across calls.
    const globals = {
      [CODE_INPUTS_GLOBAL]: deepCopyInputs(dynamicInputs),
      state: this._state,
      ...(await toolBridgeGlobals(context))
    };

    const sandboxResult = await runInSandbox({
      code: `${NODETOOL_PRELUDE}\n${body}`,
      context,
      timeoutMs: timeout > 0 ? timeout * 1000 : undefined,
      globals,
      limits: this.sandboxLimits(),
      onProgress: this.progressSink(context),
      modules: this.resolveModules(context)
    });

    if (!sandboxResult.success) {
      throw new Error(sandboxResult.error ?? "Code execution failed");
    }

    return normalizeOutput(sandboxResult.result);
  }

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const code = String(this.code ?? "return {};");
    const timeout = Number(this.timeout ?? 30);

    // If no yield in code, fall back to single-shot process().
    if (!hasYieldStatement(code)) {
      yield await this.process(context);
      return;
    }

    // For streaming: collect all yielded values, then emit them.
    const allInputs = {
      ...this.serialize(),
      ...Object.fromEntries(this.dynamicProps)
    };
    const dynamicInputs = extractDynamicInputs(allInputs);

    // The prelude sits outside the yield_ rewrite: only user code streams.
    const wrappedBody = `${NODETOOL_PRELUDE}
      const __yielded = [];
      function yield_(value) { __yielded.push(value); }
      ${code.replace(/\byield\b/g, "yield_")}
      return __yielded;
    `;

    // Declared inputs arrive on one `inputs` object rather than as globals of
    // their own name. Sharing the global namespace with the sandbox API let an
    // input called `env` or `data` shadow a bridge, and made every undeclared
    // identifier ambiguous between a typo and a missing slot.
    // State stays a direct reference so mutations persist across calls.
    const globals = {
      [CODE_INPUTS_GLOBAL]: deepCopyInputs(dynamicInputs),
      state: this._state,
      ...(await toolBridgeGlobals(context))
    };

    const sandboxResult = await runInSandbox({
      code: wrappedBody,
      context,
      timeoutMs: timeout > 0 ? timeout * 1000 : undefined,
      globals,
      limits: this.sandboxLimits(),
      onProgress: this.progressSink(context),
      modules: this.resolveModules(context)
    });

    if (!sandboxResult.success) {
      throw new Error(sandboxResult.error ?? "Code execution failed");
    }

    const items = sandboxResult.result as unknown[];
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item !== null && item !== undefined) {
          yield normalizeOutput(item);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract dynamic inputs, filtering reserved/invalid keys. */
function extractDynamicInputs(
  inputs: Record<string, unknown>
): Record<string, unknown> {
  const reserved = new Set([
    "code",
    "packages",
    "timeout",
    "max_response_mb",
    "allow_local_network",
    "allow_host_filesystem"
  ]);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (reserved.has(key) || key.startsWith("_")) continue;
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) continue;
    if (JS_RESERVED.has(key)) continue;
    result[key] = value;
  }
  return result;
}

/**
 * Deep-copy all input values to make them safe for the sandbox.
 * Strips functions, symbols, and other non-serializable types.
 */
function deepCopyInputs(
  inputs: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (value === null || value === undefined) {
      result[key] = value;
      continue;
    }
    try {
      result[key] = JSON.parse(JSON.stringify(value));
    } catch {
      result[key] = null;
    }
  }
  return result;
}

/**
 * Normalize return value to Record<string, unknown>.
 *
 * The sandbox hands back real `Uint8Array`s for typed arrays at any depth
 * (`serializeResult`), so binary values need no conversion here — only the
 * decision of whether the value is an output bag or a single `output`.
 */
function normalizeOutput(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as object).constructor?.name === "Object"
  ) {
    return value as Record<string, unknown>;
  }
  return { output: value };
}

/**
 * Check for a real `return` statement — not one inside a string or comment.
 */
function hasReturnStatement(code: string): boolean {
  const stripped = stripStringsAndComments(code);
  return /(?:^|[;\n{}\s])return[\s;(]/.test(stripped);
}

/**
 * Check for a real `yield` statement — not one inside a string or comment.
 */
function hasYieldStatement(code: string): boolean {
  const stripped = stripStringsAndComments(code);
  return /(?:^|[;\n{}\s])yield[\s;(]/.test(stripped);
}

/** Strip string literals and comments to avoid false-positive keyword detection. */
function stripStringsAndComments(code: string): string {
  return code
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

/**
 * Wrap the last expression with `return(...)` for implicit return support.
 */
function wrapImplicitReturn(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return "return {};";

  const lines = trimmed.split("\n");
  const lastIdx = lines.length - 1;
  const last = lines[lastIdx].trim();

  if (STATEMENT_KEYWORDS.test(last)) return code;
  if (!last || last.startsWith("//") || last.startsWith("/*")) return code;

  if (
    last.startsWith("{") ||
    last.startsWith("(") ||
    last.startsWith("[") ||
    last.startsWith('"') ||
    last.startsWith("'") ||
    last.startsWith("`") ||
    last.startsWith(".") ||
    /^[0-9]/.test(last) ||
    /^(true|false|null|undefined|NaN|Infinity)\b/.test(last) ||
    /^[a-zA-Z_$][a-zA-Z0-9_$.]*(\s*[({[])?/.test(last)
  ) {
    lines[lastIdx] = `return (${lines[lastIdx]})`;
    return lines.join("\n");
  }

  return code;
}
