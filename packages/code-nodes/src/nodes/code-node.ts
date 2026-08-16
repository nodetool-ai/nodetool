/**
 * Universal Code Node — sandboxed JavaScript execution via QuickJS WASM.
 *
 * Runs user code in an isolated QuickJS WebAssembly guest (see
 * `@nodetool-ai/agents/js-sandbox`) with standard JavaScript plus the bridge
 * APIs: fetch(), workspace (text/bytes/stat/mkdir/remove/copy/move/root),
 * getSecret(), sleep(), progress(), crypto (randomUUID/digest/hmac), format,
 * media (read a media input's bytes, build a media output) and the base64/hex
 * helpers. Dynamic inputs arrive on the `inputs` object.
 *
 * On a server host the code also gets the `nodetool` object model — the
 * platform as objects (`nodetool.workflows`, `nodetool.assets`, …), backed by
 * the agent toolbelt through a `tools.<name>()` bridge. The belt is loaded
 * lazily and only on Node: the in-browser runner bundles this module, so the
 * toolbelt (native canvas, IMAP, execution) must never sit in its static
 * import graph. Without a belt, `nodetool.capabilities()` reports `{}` and
 * every method throws naming its missing tool instead of a ReferenceError.
 *
 * Outputs leave the body through two host calls: `await emit(name, value)`
 * streams one value downstream immediately, `await output(name, value)` sets a
 * handle's final value, delivered as one bag when the body completes. The
 * body's return value carries no outputs.
 *
 * Example:
 *   // inputs: { x: 5, text: "hello" }
 *   // code:
 *   for (const word of inputs.text.split(" ")) await emit("word", word);
 *   await output("sum", inputs.x + 10);
 *   // streams { word: … } per word, then the final bag { sum: 15 }
 *
 * A body that calls neither runs the deprecated return/yield contract.
 *
 * Inputs arrive one of two ways. A body that never mentions `stream` runs once
 * per incoming item with `inputs` holding that item's snapshot. A body that
 * calls `stream` runs once for the whole stream and pulls values itself
 * (`stream(name)`, `stream.any()`, `stream.first`, `stream.open`), executing
 * through {@link CodeNode.run} — the kernel's streaming-input mode, which
 * hydration selects per node from the body itself.
 */

import {
  BaseNode,
  prop,
  CODE_INPUTS_GLOBAL,
  NodeRegistry,
  parseSandboxModuleDeclarations,
  hasReturnStatement,
  hasYieldStatement,
  wrapImplicitReturn,
  normalizeCodeOutput,
  usesEmitOutputContract,
  usesStreamInputContract
} from "@nodetool-ai/node-sdk";
import type {
  ProcessingContext,
  StreamingInputs,
  StreamingOutputs
} from "@nodetool-ai/runtime";
import {
  runInSandbox,
  TOOLS_PRELUDE,
  NODETOOL_API_PRELUDE_FULL,
  type SandboxLimits,
  type RunSandboxOptions,
  type RunSandboxResult,
  type SandboxInputTake
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
const NO_TOOLS_GLOBALS = {
  __toolNames: [] as string[],
  __callTool: async () => ({
    ok: false as const,
    error: "no tools in this environment"
  })
} satisfies Record<string, unknown>;

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
 * the in-process core API tools. Must match `assembleSandboxToolbelt` in
 * `@nodetool-ai/agents` — that is the belt a JS script run uses. Only the
 * node registry is constructible here (`NodeRegistry.global`); the example
 * catalog, DSL exporter and provider set live above this package, so their
 * tools stay dark and the `nodetool` prelude reports the difference via
 * `capabilities()`.
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

/**
 * Bags a node invocation may hold before `emit` blocks the guest. Exported so
 * a test can drive the producer past the bound without guessing the number.
 */
export const EMIT_CHANNEL_CAPACITY = 64;

/**
 * A bounded async queue with one producer (the guest's `emit` bridge) and one
 * consumer (the `genProcess` pump). `push` resolves once the item is in the
 * queue, which is only below capacity — that resolution is the backpressure
 * release. `take` resolves `null` when the channel is closed and drained, so
 * the consumer cannot finish while bags are still queued.
 */
class BoundedChannel<T> {
  private readonly items: T[] = [];
  private readonly takers: Array<() => void> = [];
  private readonly pushers: Array<() => void> = [];
  private closed = false;

  constructor(private readonly capacity: number) {}

  async push(item: T): Promise<void> {
    while (this.items.length >= this.capacity && !this.closed) {
      await new Promise<void>((resolve) => this.pushers.push(resolve));
    }
    if (this.closed) return;
    this.items.push(item);
    this.takers.shift()?.();
  }

  async take(): Promise<T | null> {
    for (;;) {
      if (this.items.length > 0) {
        const item = this.items.shift() as T;
        this.pushers.shift()?.();
        return item;
      }
      if (this.closed) return null;
      await new Promise<void>((resolve) => this.takers.push(resolve));
    }
  }

  /** No further pushes; queued items still drain. Wakes everyone waiting. */
  close(): void {
    this.closed = true;
    while (this.takers.length > 0) this.takers.shift()?.();
    while (this.pushers.length > 0) this.pushers.shift()?.();
  }
}

/** Answer the guest gets for a take that never resolved into a value. */
const END_OF_STREAM: SandboxInputTake = { done: true };

/**
 * The host side of the guest's `stream` global: one inbox iterator per handle
 * (plus one `any()` iterator), created on first use and driven one take at a
 * time.
 *
 * Two takes on the same handle cannot run concurrently — an async generator
 * rejects a `next()` while another is pending — so calls are serialized on a
 * per-key promise chain. Distinct handles keep their own chain and proceed in
 * parallel, which is what lets a body await two streams at once.
 */
class InputStreamBridge {
  private readonly perHandle = new Map<string, AsyncGenerator<unknown>>();
  private anyIterator: AsyncGenerator<[string, unknown]> | undefined;
  /** Per-key serialization: `null` is the `any()` iterator's own chain. */
  private readonly chains = new Map<
    string | null,
    Promise<SandboxInputTake>
  >();
  private readonly cancelled: Promise<SandboxInputTake>;

  constructor(private readonly inputs: StreamingInputs) {
    // A cancelled run must not leave the guest parked on a take that can no
    // longer be answered: every pending and future take resolves as EOS, the
    // body unwinds, and the sandbox's own abort ends the run.
    this.cancelled = new Promise<SandboxInputTake>((resolve) => {
      const signal = inputs.signal;
      if (signal.aborted) {
        resolve(END_OF_STREAM);
        return;
      }
      signal.addEventListener("abort", () => resolve(END_OF_STREAM), {
        once: true
      });
    });
  }

  take(handle: string | null): Promise<SandboxInputTake> {
    const previous = this.chains.get(handle);
    const next = previous
      ? previous.then(
          () => this.pull(handle),
          () => this.pull(handle)
        )
      : this.pull(handle);
    this.chains.set(handle, next);
    return next;
  }

  /** `stream.open(name)`: could this handle still produce a value? */
  isOpen(handle: string): boolean {
    return (
      this.inputs.hasStream(handle) ||
      this.inputs.hasBuffered?.(handle) === true
    );
  }

  private async pull(handle: string | null): Promise<SandboxInputTake> {
    if (this.inputs.signal.aborted) return END_OF_STREAM;
    if (handle === null) {
      const iterator = (this.anyIterator ??= this.inputs.any());
      const result = await Promise.race([iterator.next(), this.cancelled]);
      if ("done" in result && result.done === true) return END_OF_STREAM;
      const [source, value] = (result as IteratorYieldResult<
        [string, unknown]
      >).value;
      return { done: false, handle: source, value: jsonSafe(value) };
    }
    let iterator = this.perHandle.get(handle);
    if (!iterator) {
      iterator = this.inputs.stream(handle);
      this.perHandle.set(handle, iterator);
    }
    const result = await Promise.race([iterator.next(), this.cancelled]);
    if ("done" in result && result.done === true) return END_OF_STREAM;
    return {
      done: false,
      handle,
      value: jsonSafe((result as IteratorYieldResult<unknown>).value)
    };
  }
}

/** What one invocation executes: the node's own properties. */
interface CodeEnvelope {
  code: string;
  packages: unknown[];
  secrets: string[];
  timeoutSeconds: number;
}

export class CodeNode extends BaseNode {
  static readonly nodeType = "nodetool.code.Code";
  static readonly platforms = ALL_PLATFORMS;
  static readonly title = "Code";
  static readonly description =
    "Execute vanilla JavaScript in a sandboxed environment. " +
    "APIs: fetch(), workspace.read/write/list/readBytes/writeBytes/stat/mkdir/remove/copy/move/root(), " +
    "getSecret(), sleep(), progress(), crypto.digest/hmac/randomUUID/getRandomValues, " +
    "format.number/date/relativeTime/list, " +
    "media.bytes/text/info to read a document, image, audio or video input and " +
    "media.toDocument/toImage/toAudio/toVideo to return one, " +
    "toBase64/fromBase64/toHex/fromHex, parallelMap, plus the `nodetool` object model " +
    "(workflows, assets, jobs, …) backed by platform tools on server hosts — " +
    "nodetool.capabilities() reports what is live. Tool-backed calls can spend money " +
    "(media generation, workflow runs) and reach the web; each tool applies its own " +
    "permission gating. " +
    "Dynamic inputs arrive on the `inputs` object; outputs leave through " +
    "await emit(name, value) to stream a value now and await output(name, value) " +
    "to set a handle's final value. The return value carries no outputs. " +
    "A body that calls stream(name), stream.any(), stream.first(name) or " +
    "stream.open(name) runs once and reads its connected inputs as they " +
    "arrive, instead of once per item." +
    "\n    code, javascript, script, function, dynamic, custom, logic, " +
    "parse, transform, convert, format, compute, calculate, filter, map, " +
    "merge, extract, json, csv, text, string, math, " +
    "pdf, document, read document, image bytes, audio, video, file, media";
  static readonly inlineFields = ["code"];
  static readonly inputFields = [];
  static readonly supportsDynamicInputs = true;
  static readonly supportsDynamicOutputs = true;
  /**
   * Whether this node streams its inputs is a property of its body, not of the
   * type: a body that calls `stream` drains its own inbox in {@link run},
   * every other body keeps the buffered per-item invocation. Both hydration
   * paths re-read the body through this hook, so editing the last `stream`
   * call out flips the mode back with no saved flag involved.
   */
  static readonly resolveStreamingInput = (node: {
    properties?: Record<string, unknown>;
  }): boolean => usesStreamInputContract(String(node?.properties?.code ?? ""));

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
      "nodetool.secrets.get(name) (throws when unset; limited to the names in " +
      "`secrets` when that is set), getSecret(name), sleep(ms), progress(percent, message), " +
      "crypto.randomUUID/getRandomValues/digest/hmac, " +
      "format.number/date/relativeTime/list, " +
      "media.bytes(ref)/media.text(ref, {encoding})/media.info(ref) to read a document, " +
      "image, audio or video input, and media.toDocument/toImage/toAudio/toVideo(bytes, " +
      "{mimeType, filename}) to build one to return, " +
      "toBase64/fromBase64/toHex/fromHex. Libraries — CSV, HTML, XML, XLSX, YAML, zip, dates, " +
      "diffs — are sandbox packages: declare one in `packages` and `import` it at the top. " +
      "Await fetch, sleep, workspace, getSecret, format, media, an imported package's " +
      "calls, and crypto.digest/hmac; the rest are synchronous. " +
      "Concurrent calls run in parallel: use Promise.all or " +
      "parallelMap(items, fn, concurrency) to fan out fetches. " +
      "The `nodetool` object model exposes platform tools (nodetool.workflows, " +
      "nodetool.assets, …) where the host carries them — nodetool.capabilities() " +
      "reports live namespaces; elsewhere a method throws naming its missing tool. " +
      "A persistent `state` object survives across streaming invocations. " +
      "Outputs: `await emit(name, value)` streams one value to output handle " +
      "`name` right away and can be called any number of times; " +
      "`await output(name, value)` records that handle's final value, delivered " +
      "as one bag when the body ends. `return` is control flow only — the " +
      "returned value carries no outputs. " +
      "Inputs: `for await (const item of stream(name))` reads a connected " +
      "handle as values arrive, `stream.any()` yields [handle, value] across " +
      "all handles in arrival order, `stream.first(name)` takes one value " +
      "(undefined at end of stream), and `stream.open(name)` says whether more " +
      "can still arrive. A body using any of them runs once for the whole " +
      "stream — waiting on input does not spend the timeout — and `inputs.*` " +
      "then carries only the values configured on the node. A body that never " +
      "mentions `stream` runs once per incoming item, as before. " +
      "Deprecated: a body that calls neither emit nor output still runs the old " +
      "contract, where a returned object's keys become output handles and " +
      "yield(value) streams."
  })
  declare code: string;

  @prop({
    type: "list[dict]",
    default: [],
    title: "Packages",
    // The editor renders this with the sandbox package picker, which lists the
    // installed packs and stamps each declaration with the version and digest
    // it was chosen against.
    json_schema_extra: { type: "sandbox_packages" },
    description:
      "Sandbox packages this code may import, as specifiers or " +
      "{specifier, resolvedPackVersion, contentDigest} objects — e.g. " +
      '["@nodetool-ai/sandbox-csv", "@nodetool-ai/sandbox-yaml", "@nodetool-ai/sandbox-html"]. ' +
      "The sandbox resolves only what is listed here; every other `import` fails, " +
      "and dynamic `import()`/`require()` are never available."
  })
  declare packages: unknown[];

  @prop({
    type: "list[str]",
    default: [],
    title: "Secrets",
    description:
      "Secret names this code may read, e.g. [\"NOTION_API_KEY\"]. " +
      "nodetool.secrets.get(name) and getSecret(name) refuse every other name, " +
      "so a node that talks to one service cannot read the credentials of " +
      "another. Empty means unscoped — the whole secret store, which is what a " +
      "node written before scopes existed still gets."
  })
  declare secrets: string[];

  @prop({
    type: "dict",
    default: {},
    title: "Script",
    // The editor renders this with the script picker; an unlinked node stores
    // the empty object.
    json_schema_extra: { type: "js_script_link" },
    description:
      "Which JS script version this node's body was copied from, as " +
      '{"id": "<script id>", "version": <n>}. Linking materializes the pinned ' +
      "version: its code, packages, secrets and timeout become the node's own, " +
      "so editing the script does not silently change this workflow and a run " +
      "needs no script storage. \"Update to latest\" re-copies and re-pins. " +
      "Empty means the node was never linked."
  })
  declare script: Record<string, unknown>;

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
  private sandboxLimits(envelope: CodeEnvelope): SandboxLimits {
    const mb = Number(this.max_response_mb ?? 1);
    const declared = envelope.secrets
      .map((name) => String(name).trim())
      .filter((name) => name !== "");
    return {
      maxResponseBodyBytes: Number.isFinite(mb)
        ? Math.round(mb * 1024 * 1024)
        : undefined,
      allowPrivateNetwork: this.allow_local_network === true,
      filesystemAccess:
        this.allow_host_filesystem === true ? "host" : "workspace",
      // An empty list is "no scope declared", not "no secrets": scoping is
      // opt-in, so a node authored before it existed keeps the reach it had.
      secretScope: declared.length > 0 ? declared : null
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
    envelope: CodeEnvelope,
    context?: ProcessingContext
  ): SandboxModuleResolution | undefined {
    const { declarations, invalid } = parseSandboxModuleDeclarations(
      envelope.packages
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

  /**
   * The globals every run gets, on either contract. Declared inputs arrive on
   * one `inputs` object rather than as globals of their own name: sharing the
   * global namespace with the sandbox API let an input called `env` or `data`
   * shadow a bridge, and made every undeclared identifier ambiguous between a
   * typo and a missing slot. State stays a direct reference so mutations
   * persist across calls.
   */
  private async sandboxGlobals(
    context: ProcessingContext | undefined
  ): Promise<Record<string, unknown>> {
    const allInputs = {
      ...this.serialize(),
      ...Object.fromEntries(this.dynamicProps)
    };
    return {
      [CODE_INPUTS_GLOBAL]: deepCopyInputs(extractDynamicInputs(allInputs)),
      state: this._state,
      ...(await toolBridgeGlobals(context))
    };
  }

  /** Milliseconds the guest may run, or undefined for no limit. */
  private timeoutMs(envelope: CodeEnvelope): number | undefined {
    return envelope.timeoutSeconds > 0
      ? envelope.timeoutSeconds * 1000
      : undefined;
  }

  /**
   * What this invocation runs: the node's own properties, always.
   *
   * Linking a script *materializes* it — the pinned version's code, packages,
   * secrets and timeout are copied onto the node when the link is made or
   * updated, and the `script` property records only which version they came
   * from. So execution needs no database, no resolver, and no await: the body
   * a run executes is the body the graph carries, which is also the body
   * hydration read to decide whether this node streams its inputs.
   */
  private envelope(): CodeEnvelope {
    return {
      code: String(this.code ?? "return {};"),
      packages: Array.isArray(this.packages) ? this.packages : [],
      secrets: Array.isArray(this.secrets) ? this.secrets : [],
      timeoutSeconds: Number(this.timeout ?? 30)
    };
  }

  /**
   * Everything a run of this node's body needs regardless of contract: the
   * prelude, the node's own policy, its globals and its module resolution.
   * Every execution path starts from this and adds only what its own contract
   * needs (an emit sink, an input bridge, a cancellation signal).
   */
  private async sandboxOptions(
    code: string,
    envelope: CodeEnvelope,
    context: ProcessingContext | undefined
  ): Promise<RunSandboxOptions> {
    return {
      code: `${NODETOOL_PRELUDE}\n${code}`,
      context,
      timeoutMs: this.timeoutMs(envelope),
      globals: await this.sandboxGlobals(context),
      limits: this.sandboxLimits(envelope),
      onProgress: this.progressSink(context),
      modules: this.resolveModules(envelope, context)
    };
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const envelope = this.envelope();
    const code = envelope.code;
    if (!usesEmitOutputContract(code)) {
      // The legacy return/yield contract runs unwarned: the deprecation
      // notice lives in validate_code, not in every run's message stream —
      // reliability goldens and downstream consumers pin that stream.
      return this.runLegacySingleShot(envelope, context);
    }

    const result = await runInSandbox(
      await this.sandboxOptions(code, envelope, context)
    );

    if (!result.success) {
      throw new Error(result.error ?? "Code execution failed");
    }

    // Single-shot callers see no stream, so an emitted value would be lost.
    // Precedence: a handle's final `output` value wins; where there is none,
    // the LAST value emitted for that handle stands in.
    const merged: Record<string, unknown> = {};
    for (const { name, value } of result.emitted ?? []) {
      merged[name] = value;
    }
    return { ...merged, ...(result.outputs ?? {}) };
  }

  /**
   * Streaming-input execution: one invocation that drains its own inbox.
   *
   * The kernel calls this instead of the per-item path when the hydrated
   * `is_streaming_input` flag is true, which for this node means the body
   * calls `stream` (see {@link CodeNode.resolveStreamingInput}). The body runs
   * once; `stream(name)` / `stream.any()` pull values out of `inputs` one take
   * at a time, `emit` routes live through `outputs.emit`, and the `output`
   * finals post as one bag when the body ends.
   */
  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs,
    context?: ProcessingContext
  ): Promise<void> {
    const envelope = this.envelope();
    const code = envelope.code;
    if (!usesStreamInputContract(code)) {
      // The kernel only routes here when hydration said the body streams, and
      // hydration re-reads the body every time. Reaching this means a stale
      // saved flag was trusted (a graph built with `withExplicitNodeFlags` and
      // never hydrated), and there is no safe recovery: this path never
      // delivers per-item invocations, so a buffered body would silently see
      // none of its connected inputs. Fail loudly instead.
      throw new Error(
        "Code node is flagged streaming-input but its body never calls " +
          "stream(...). Hydrate the graph against the node registry, or add " +
          "a stream(name) call to consume the connected inputs."
      );
    }

    const bridge = new InputStreamBridge(inputs);
    const abort = new AbortController();
    const onCancel = () => abort.abort();
    if (inputs.signal.aborted) {
      abort.abort();
    } else {
      inputs.signal.addEventListener("abort", onCancel, { once: true });
    }

    try {
      const result = await runInSandbox({
        ...(await this.sandboxOptions(code, envelope, context)),
        signal: abort.signal,
        // Awaited, so a downstream inbox at its bound blocks the guest's
        // `emit` — the same backpressure the buffered pump gets from its
        // channel, one link earlier.
        onEmit: async (name: string, value: unknown) => {
          await outputs.emit(name, value);
        },
        onTakeInput: (handle) => bridge.take(handle),
        onStreamOpen: (handle) => bridge.isOpen(handle)
      });

      // A cancelled run has nothing to report: the takes were unparked as
      // end-of-stream and the body unwound on a signal it did not choose.
      if (inputs.signal.aborted) return;
      if (!result.success) {
        throw new Error(result.error ?? "Code execution failed");
      }
      // One bag, one frame: the finals of a single invocation belong together,
      // so sibling handles share lineage instead of arriving as N items.
      const finals = result.outputs ?? {};
      if (Object.keys(finals).length > 0) {
        await outputs.emitGroup(finals);
      }
    } finally {
      inputs.signal.removeEventListener("abort", onCancel);
      abort.abort();
    }
  }

  /** The deprecated return-bag path: implicit return, normalized output. */
  private async runLegacySingleShot(
    envelope: CodeEnvelope,
    context: ProcessingContext | undefined
  ): Promise<Record<string, unknown>> {
    const code = envelope.code;
    const body = hasReturnStatement(code) ? code : wrapImplicitReturn(code);
    const result = await runInSandbox(
      await this.sandboxOptions(body, envelope, context)
    );
    if (!result.success) {
      throw new Error(result.error ?? "Code execution failed");
    }
    return normalizeCodeOutput(result.result);
  }

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const envelope = this.envelope();

    if (usesEmitOutputContract(envelope.code)) {
      yield* this.pumpEmitContract(envelope, context);
      return;
    }

    if (!hasYieldStatement(envelope.code)) {
      yield await this.runLegacySingleShot(envelope, context);
      return;
    }
    yield* this.runLegacyStream(envelope, context);
  }

  /**
   * The emit/output pump: start the run, hand every `emit` bag downstream as
   * it happens, then post the final `output` bag once the run succeeds.
   *
   * The guest's `emit` promise resolves only when the channel has accepted its
   * bag, so a producer faster than the kernel blocks at the channel bound —
   * backpressure with no new kernel concept.
   */
  private async *pumpEmitContract(
    envelope: CodeEnvelope,
    context: ProcessingContext | undefined
  ): AsyncGenerator<Record<string, unknown>> {
    const channel = new BoundedChannel<Record<string, unknown>>(
      EMIT_CHANNEL_CAPACITY
    );
    const abort = new AbortController();

    let result: RunSandboxResult | undefined;
    let failure: unknown;
    // Never rejects: the run's outcome is read after the drain, so a rejection
    // parked on the promise would otherwise look unhandled while we pump.
    const run = (async () => {
      try {
        result = await runInSandbox({
          ...(await this.sandboxOptions(envelope.code, envelope, context)),
          signal: abort.signal,
          onEmit: (name: string, value: unknown) =>
            channel.push({ [name]: value })
        });
      } catch (err) {
        failure = err;
      } finally {
        // Closing here is what ends the drain, and it happens only after the
        // run has settled — so every bag pushed before that is still taken.
        channel.close();
      }
    })();

    try {
      for (;;) {
        const bag = await channel.take();
        if (!bag) break;
        yield bag;
      }

      await run;
      if (failure) throw failure;
      if (!result || !result.success) {
        throw new Error(result?.error ?? "Code execution failed");
      }
      // A failed run discards finals; only a successful one posts its bag.
      const outputs = result.outputs ?? {};
      if (Object.keys(outputs).length > 0) {
        yield outputs;
      }
    } finally {
      // The consumer may abandon the generator mid-stream (a downstream
      // routing error, or a `break`). Aborting unblocks the guest, closing the
      // channel releases any `emit` waiting for room, and awaiting the run
      // leaves nothing in flight behind us.
      abort.abort();
      channel.close();
      await run;
    }
  }

  /** The deprecated `yield` path: the guest collects, the host replays. */
  private async *runLegacyStream(
    envelope: CodeEnvelope,
    context: ProcessingContext | undefined
  ): AsyncGenerator<Record<string, unknown>> {
    const code = envelope.code;
    // The prelude sits outside the yield_ rewrite: only user code streams.
    const wrappedBody = `${NODETOOL_PRELUDE}
      const __yielded = [];
      function yield_(value) { __yielded.push(value); }
      ${code.replace(/\byield\b/g, "yield_")}
      return __yielded;
    `;

    const result = await runInSandbox({
      ...(await this.sandboxOptions("", envelope, context)),
      code: wrappedBody
    });

    if (!result.success) {
      throw new Error(result.error ?? "Code execution failed");
    }

    const items = result.result as unknown[];
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item !== null && item !== undefined) {
          yield normalizeCodeOutput(item);
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
) {
  const reserved = new Set([
    "code",
    "script",
    "packages",
    "secrets",
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

/** A value that survived the JSON round trip: plain data, nested as it was. */
type JsonSafeValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonSafeValue[]
  | { [key: string]: JsonSafeValue };

/**
 * One value, deep-copied into JSON-safe form for the guest. The marshal rule
 * for a streamed item is the buffered one: plain data crosses, anything that
 * cannot be serialized becomes `null`. Media inputs are refs — plain objects —
 * so they survive and stay readable through `media.*`.
 */
function jsonSafe(value: unknown): JsonSafeValue {
  if (value === null || value === undefined) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

/**
 * Deep-copy all input values to make them safe for the sandbox.
 * Strips functions, symbols, and other non-serializable types.
 */
function deepCopyInputs(
  inputs: Record<string, unknown>
) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs)) {
    result[key] = jsonSafe(value);
  }
  return result;
}


