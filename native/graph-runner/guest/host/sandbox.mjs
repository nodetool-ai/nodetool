import { installOptionalLibraries } from "./optional-libraries.mjs";
import * as nativeAgents from "./agents.mjs";
import { buildSandbox } from "../../../../packages/agents/src/js-sandbox.ts";
import sandboxBootstrapSource from "nodetool:sandbox-bootstrap";
import { encodeSandboxValue, decodeSandboxValue } from "./sandbox-values.mjs";
import { createSandboxHostDispatcher } from "../../../../packages/agents/src/host-modules/dispatcher.ts";
import {
  parseWasmBinary,
  wasmExportContractViolation,
  SANDBOX_WASM_BUDGETS
} from "@nodetool-ai/protocol";
import { sandboxHostModule } from "@nodetool-ai/protocol";
import { Tool, gateLegacyTools, gateFromContext } from "./agents.mjs";
import { parse } from "acorn";
// Each session owns a separate native QuickJS heap. Host bridges suspend it
// on promises so the workflow guest can await actual storage, tools and streams.
export { TOOLS_PRELUDE } from "../../../../packages/agents/src/codeact/tools-prelude.ts";
export { NODETOOL_API_PRELUDE_FULL } from "../../../../packages/agents/src/codeact/nodetool-api.ts";
class GrantedCodeTool extends Tool {
  constructor(inner) {
    super();
    this.inner = inner;
  }
  get name() {
    return this.inner.name;
  }
  get description() {
    return this.inner.description ?? "";
  }
  get inputSchema() {
    return this.inner.inputSchema ?? { type: "object", properties: {} };
  }
  process(context, args) {
    return this.inner.execute
      ? this.inner.execute(context, args)
      : this.inner.process(context, args);
  }
}
globalThis.__guestImports ??= Object.create(null);
globalThis.__guestImports["@nodetool-ai/agents"] = async () => nativeAgents;
installOptionalLibraries();

export async function runInSandbox(options) {
  const signal = options.signal ?? options.context?.signal;
  const context = options.context;
  const supplied = context?._injectedTools ?? [];
  if (supplied.length) {
    const tools = gateLegacyTools(
      supplied.map((tool) =>
        tool instanceof Tool ? tool : new GrantedCodeTool(tool)
      ),
      gateFromContext(context, "Code node")
    );
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    options = {
      ...options,
      globals: {
        ...options.globals,
        __toolNames: [...byName.keys()],
        __callTool: async (name, encoded) => {
          const tool = byName.get(name);
          if (!tool)
            return { ok: false, error: `Tool is not granted: ${name}` };
          try {
            return {
              ok: true,
              result: await tool.execute(context, JSON.parse(encoded))
            };
          } catch (error) {
            return { ok: false, error: String(error) };
          }
        }
      }
    };
  }
  signal?.throwIfAborted();

  const wasmModules = new Map();
  let wasmCalls = 0,
    wasmTime = 0;
  const wasmBudgets = { ...SANDBOX_WASM_BUDGETS };
  for (const module of options.modules?.modules ?? []) {
    if (module.kind !== "wasm") continue;
    const binary = parseWasmBinary(module.bytes);
    if (binary.importCount)
      throw new Error("WASM host imports are not granted");
    const allowed = new Map();
    for (const exported of module.wasm.exports) {
      const entry = binary.exports.get(exported.wasm);
      const signature =
        entry === undefined ? undefined : binary.functions[entry.index];
      const violation = wasmExportContractViolation(entry, signature);
      if (violation) throw new Error(`${module.specifier}: ${violation}`);
      allowed.set(exported.as, {
        name: exported.wasm,
        arity: signature.parameters.length
      });
    }
    for (const key of ["callsPerInvocation", "wallClockMs", "callTimeoutMs"])
      wasmBudgets[key] = Math.min(
        wasmBudgets[key],
        module.wasm.limits?.[key] ?? wasmBudgets[key]
      );
    wasmModules.set(module.specifier, { module, allowed });
  }
  const hostDispatcher = createSandboxHostDispatcher(
    options.modules?.modules ?? [],
    { signal }
  );
  const admittedModules = (options.modules?.modules ?? []).map((module) => {
    if (module.kind === "wasm") {
      const source = module.wasm.exports
        .map(
          (exp) =>
            `export async function ${exp.as}(...args){return __nativeWasmDispatch(${JSON.stringify(module.specifier)},${JSON.stringify(exp.as)},args);}`
        )
        .join("\n");
      return {
        kind: "js",
        source,
        packName: module.packName,
        moduleId: module.moduleId,
        specifier: module.specifier,
        graph: module.graph.filter((file) => file.kind === "js")
      };
    }
    if (module.kind !== "host") return module;
    const spec = sandboxHostModule(module.hostId);
    const source = spec.exports
      .map(
        (name) =>
          `export async function ${name}(...args){return __nativeHostDispatch(${JSON.stringify(module.specifier)},${JSON.stringify(name)},args);}`
      )
      .join("\n");
    return {
      kind: "js",
      source,
      packName: module.packName,
      moduleId: module.moduleId,
      specifier: module.specifier,
      graph: module.graph.filter((file) => file.kind === "js")
    };
  });
  for (const [specifier, source] of options.capabilities?.facades ?? []) {
    admittedModules.push({
      kind: "js",
      packName: "native-capabilities",
      moduleId: specifier,
      specifier,
      graph: [],
      source: source.replace(
        /import \{ __call \} from "[^"]+";/,
        "const __call=(...args)=>__nativeCapabilityDispatch(...args);"
      )
    });
  }
  let code = options.code;
  const imports = [];
  try {
    const ast = parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true
    });
    for (const declaration of ast.body.filter(
      (node) => node.type === "ImportDeclaration"
    )) {
      imports.push(code.slice(declaration.start, declaration.end));
      code =
        code.slice(0, declaration.start) +
        code.slice(declaration.start, declaration.end).replace(/[^\n]/g, " ") +
        code.slice(declaration.end);
    }
  } catch {
    /* The isolated engine reports syntax errors. */
  }
  const host = globalThis.__host?.sandbox;
  if (!host?.start)
    throw new Error("Native isolated Code sandbox is not installed");
  const id = host.start(
    JSON.stringify({
      code,
      imports,
      bootstrap: sandboxBootstrapSource,
      modules: admittedModules,
      globals: encodeSandboxValue(options.globals ?? {}),
      timeoutMs: options.timeoutMs,
      limits: options.limits
    }),
    options.onStreamOpen,
    (operation, payload) => {
      signal?.throwIfAborted();
      const args = JSON.parse(payload);
      if (operation === "randomUUID")
        return JSON.stringify(globalThis.crypto.randomUUID());
      if (operation === "randomBytes") {
        const size = Number(args[0]);
        if (!Number.isFinite(size) || size < 0)
          throw new Error("Random byte length must be non-negative");
        return JSON.stringify(
          encodeSandboxValue(
            globalThis.crypto.getRandomValues(
              new Uint8Array(Math.min(65536, Math.floor(size)))
            )
          )
        );
      }
      throw new Error("Synchronous bridge is not granted");
    }
  );
  const canonical = buildSandbox(
    context,
    signal,
    options.limits,
    options.onProgress,
    options.onLog,
    options.onEmit,
    { onTakeInput: options.onTakeInput, onStreamOpen: options.onStreamOpen }
  );
  let progressCalls = 0,
    lastProgress = 0;
  async function dispatch(operation, args) {
    signal?.throwIfAborted();
    if (operation === "capabilityModule") {
      if (!options.capabilities)
        throw new Error("No capability modules were declared");
      return options.capabilities.call(...args);
    }
    if (operation === "helper") {
      const [namespace, member, values] = args;
      if (
        ![
          "format",
          "crypto",
          "image",
          "canvas",
          "audio",
          "video",
          "media"
        ].includes(namespace)
      )
        throw new Error("Sandbox helper namespace is not granted");
      const group = canonical.sandbox[namespace];
      if (!Object.hasOwn(group, member) || typeof group[member] !== "function")
        throw new Error(
          `Sandbox helper '${namespace}.${member}' does not exist`
        );
      return group[member](...values);
    }
    if (operation === "assetToSandbox" || operation === "sandboxToAsset")
      return canonical.sandbox[operation](...args);
    if (operation === "fetch") return canonical.sandbox.fetch(...args);
    if (operation === "wasmModule") {
      const entry = wasmModules.get(args[0]);
      const exp = entry?.allowed.get(args[1]);
      if (
        !entry ||
        !exp ||
        !Array.isArray(args[2]) ||
        exp.arity !== args[2].length
      )
        throw new Error("WASM call is outside the declared contract");
      if (
        ++wasmCalls > wasmBudgets.callsPerInvocation ||
        wasmTime >= wasmBudgets.wallClockMs
      )
        throw new Error("WASM invocation budget exhausted");
      const started = Date.now();
      try {
        return JSON.parse(
          host.wasm(
            entry.module.bytes,
            exp.name,
            JSON.stringify(args[2]),
            JSON.stringify({
              memoryPagesMax: entry.module.wasm.memoryPagesMax,
              callTimeoutMs: Math.min(
                wasmBudgets.callTimeoutMs,
                wasmBudgets.wallClockMs - wasmTime
              )
            })
          )
        );
      } finally {
        wasmTime += Date.now() - started;
      }
    }
    if (operation === "hostModule") {
      if (!hostDispatcher) throw new Error("No host modules were declared");
      const declaration = options.modules.modules.find(
        (module) => module.specifier === args[0]
      );
      if (declaration?.hostId === "ocr") {
        if (args[1] !== "recognize" || !Array.isArray(args[2]))
          throw new Error("OCR export is not granted");
        const [bytes, ocrOptions] = args[2];
        const language = String(ocrOptions?.language ?? "eng").trim() || "eng";
        // A promise inside a run: the recognition runs on the CPU lane.
        return JSON.parse(
          await globalThis.__host.context.ocr(
            bytes,
            language,
            Math.min(30000, Math.max(1, options.timeoutMs ?? 30000))
          )
        );
      }
      return hostDispatcher.call(...args);
    }
    if (operation === "output") return null;
    if (operation === "emit") {
      await options.onEmit?.(args[0], args[1]);
      return null;
    }
    if (operation === "take") {
      if (!options.onTakeInput)
        throw new Error(
          "stream() requires streaming-input mode; this run has no input stream"
        );
      return options.onTakeInput(args[0]);
    }
    if (operation === "log") {
      canonical.sandbox.console[args[0]](args[1]);
      return null;
    }
    if (operation === "progress") {
      if (++progressCalls > 1000)
        throw new Error("Sandbox progress call limit exceeded");
      if (Date.now() - lastProgress >= 100) {
        lastProgress = Date.now();
        options.onProgress?.(
          Math.max(0, Math.min(100, Number(args[0]) || 0)),
          String(args[1] ?? "").slice(0, 500)
        );
      }
      return null;
    }
    if (operation === "secret") {
      const scope = options.limits?.secretScope;
      if (scope && !scope.includes(args[0]))
        throw new Error(`Secret '${args[0]}' is outside the declared scope`);
      if (!context?.hasSecretResolver)
        throw new Error("Secret resolver is not granted");
      return context.getSecret(args[0]);
    }
    if (operation === "sleep") {
      await canonical.sandbox.sleep(args[0]);
      return null;
    }
    if (operation.startsWith("workspace.")) {
      const method = operation.slice("workspace.".length);
      const group = canonical.sandbox.workspace;
      const translated =
        { readText: "read", delete: "remove" }[method] ?? method;
      let value;
      if (method === "exists") value = (await group.stat(...args)).exists;
      else {
        if (
          !Object.hasOwn(group, translated) ||
          typeof group[translated] !== "function"
        )
          throw new Error("Workspace operation is not granted");
        value = await group[translated](...args);
      }
      value = decodeSandboxValue(value ?? null);
      const size =
        typeof value === "string"
          ? new TextEncoder().encode(value).length
          : (value?.byteLength ?? 0);
      const limit = Math.min(
        50 * 1024 * 1024,
        Math.max(1024, options.limits?.maxResponseBodyBytes ?? 1000000)
      );
      if (size > limit)
        throw new Error("Sandbox response body size limit exceeded");
      return value ?? null;
    }
    if (operation === "tool") {
      // The Code node's own tool bridge applies the run's permission gate.
      // A body cannot name an unadvertised tool to bypass that bridge.
      if (
        !options.globals?.__toolNames?.includes(args[0]) ||
        typeof options.globals?.__callTool !== "function"
      ) {
        return { ok: false, error: `Tool is not granted: ${args[0]}` };
      }
      return options.globals.__callTool(...args);
    }
    throw new Error(`Sandbox bridge '${operation}' is not granted`);
  }
  const tasks = new Map();
  async function service(event) {
    const { token, operation } = event;
    const args = decodeSandboxValue(event.args);
    let remove;
    let timer;
    const deadline = new Promise((_, reject) => {
      const ms =
        operation === "take"
          ? 30 * 60 * 1000
          : Math.min(600000, Math.max(1, options.timeoutMs ?? 30000));
      timer = setTimeout(
        () => reject(new Error("Sandbox bridge deadline exceeded")),
        ms
      );
    });
    const aborted = new Promise((_, reject) => {
      const listener = () => reject(signal.reason);
      signal?.addEventListener("abort", listener, { once: true });
      remove = () => signal?.removeEventListener("abort", listener);
    });
    try {
      const result = await Promise.race([
        dispatch(operation, args),
        aborted,
        deadline
      ]);
      host.resume(
        id,
        token,
        JSON.stringify(encodeSandboxValue(result ?? null)),
        false
      );
    } catch (error) {
      signal?.throwIfAborted();
      host.resume(id, token, JSON.stringify(String(error)), true);
    } finally {
      remove();
      clearTimeout(timer);
    }
  }
  try {
    for (;;) {
      signal?.throwIfAborted();
      const step = JSON.parse(host.step(id));
      if (step.done) {
        if (options.globals?.state && step.result.state) {
          for (const key of Object.keys(options.globals.state))
            delete options.globals.state[key];
          Object.assign(options.globals.state, step.result.state);
        }
        return decodeSandboxValue(step.result);
      }
      if (step.waiting) {
        if (tasks.size === 0) throw new Error("Sandbox promise did not settle");
        const result = await Promise.race(tasks.values());
        if (!result.ok) throw result.error;
      } else {
        const token = step.event.token;
        // Start the bridge now, preserving Promise.all fan-out. Keep the
        // rejection observed until the loop has handled it.
        const task = service(step.event).then(
          () => ({ ok: true }),
          (error) => ({ ok: false, error })
        );
        tasks.set(token, task);
        task.then((result) => {
          if (result.ok) tasks.delete(token);
        });
        if (tasks.size > 128) {
          const result = await Promise.race(tasks.values());
          if (!result.ok) throw result.error;
        }
      }
    }
  } finally {
    host.close(id);
  }
}
