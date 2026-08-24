/**
 * The interpreter half of the QuickJS sandbox: everything that happens *inside*
 * one `runSandboxed` call.
 *
 * `runInSandbox` (../js-sandbox.ts) owns the host half — building the bridge
 * record, the WASM/host/capability dispatchers, the cancellation race, the
 * unhandled-rejection guard, and the result shape callers see. This module owns
 * what runs against the guest context: the interrupt handler, the never-reject
 * wrap layer, the init prelude, the entry module, and the sync-back extractor.
 *
 * The split exists so the guest can run on a `worker_threads` worker without a
 * second copy of any of it. Both hosts call {@link runInterpreter}; the pieces
 * that must live next to the guest (the module loader's closures, the
 * serializers, the interrupt handler) live here, and the pieces that need live
 * host objects reach this module as plain functions — {@link
 * InterpreterParams.isAborted} and {@link InterpreterParams.suspendedMs} stand
 * in for the `AbortSignal` and the `SandboxClock`, neither of which can cross a
 * thread.
 *
 * Browser-safe: nothing here imports a Node builtin, statically or otherwise.
 */

import {
  addSerializer,
  expose,
  getModuleLoader as createDefaultModuleLoader,
  loadQuickJs,
  modulePathNormalizer as defaultModulePathNormalizer
} from "@sebastianwessel/quickjs";
import * as acorn from "acorn";
import { Scope } from "quickjs-emscripten-core";
import {
  SANDBOX_CAPABILITY_BRIDGE_SOURCE,
  SANDBOX_CAPABILITY_BRIDGE_SPECIFIER,
  SANDBOX_CAPABILITY_DISPATCH_GLOBAL
} from "@nodetool-ai/protocol/sandbox-capability";
import {
  generateSandboxHostFacade,
  sandboxHostModule,
  SANDBOX_HOST_BRIDGE_SOURCE,
  SANDBOX_HOST_BRIDGE_SPECIFIER,
  SANDBOX_HOST_DISPATCH_GLOBAL
} from "@nodetool-ai/protocol/sandbox-host";
import {
  generateSandboxWasmFacade,
  SANDBOX_WASM_BRIDGE_SOURCE,
  SANDBOX_WASM_BRIDGE_SPECIFIER,
  SANDBOX_WASM_DISPATCH_GLOBAL
} from "@nodetool-ai/protocol/sandbox-wasm";
import type { SandboxModuleResolution } from "@nodetool-ai/protocol/sandbox-package";

import {
  CANVAS_GRADIENT_FACTORIES,
  CANVAS_GRADIENT_MARKER,
  CANVAS_METHODS,
  CANVAS_PROPERTIES
} from "../sandbox-canvas-api.js";
import {
  BASE64_ALPHABET,
  SANDBOX_BYTES_MARKER,
  type GuestBytes
} from "../sandbox-bytes.js";
import { MEDIA_REF_MEMBERS } from "../sandbox-constants.js";
import {
  BOOTSTRAP_MODULE_SOURCES,
  normalizeBootstrapModuleId
} from "../sandbox-bootstrap-modules.js";
import {
  decodeGuestPayload,
  encodeHostRecord,
  GUEST_GLOBALS_JSON_BINDING,
  GUEST_GLOBALS_SIDECAR_BINDING,
  GUEST_JSON_TRANSPORT_SOURCE,
  GUEST_MARSHAL_GLOBAL
} from "../sandbox-json-transport.js";
import type { ResolvedSandboxLimits } from "../js-sandbox.js";
import { isFunction, isObjectLike } from "../utils/type-guards.js";

// ---------------------------------------------------------------------------
// Engine types
// ---------------------------------------------------------------------------

/** The engine entry point one interpreter run drives. */
export type SandboxRunSandboxed = Awaited<
  ReturnType<typeof loadQuickJs>
>["runSandboxed"];

type SandboxRunOptions = NonNullable<Parameters<SandboxRunSandboxed>[1]>;

/**
 * The engine's wall-clock abort is a `setTimeout`, and Node fires a delay past
 * this immediately instead of never — so this is the practical "no backstop".
 */
export const MAX_ENGINE_TIMEOUT_MS = 2_147_483_647;

/**
 * What the guest is told when it calls `stream` in a run that has no input
 * stream behind it. Shared by the host bridge and the guest prelude so both
 * paths say the same thing.
 */
export const NO_INPUT_STREAM_MESSAGE =
  "stream() requires streaming-input mode; this run has no input stream";

let serializersRegistered = false;

/**
 * The library's serializer table is module-global, so this registers once —
 * and a worker, holding its own module instance, registers its own.
 */
export function registerTypedArraySerializers(): void {
  if (serializersRegistered) return;
  serializersRegistered = true;

  // Map every typed-array class to a native Uint8Array on the host side.
  // The guest returns `new Uint8Array([...])` (or friends); without this,
  // the library's generic object serializer produces a plain object with
  // numeric keys, which downstream code (CodeNode's normalizeOutput) would
  // miss when detecting binary values.
  const typedArrayNames = [
    "Uint8Array",
    "Int8Array",
    "Uint8ClampedArray",
    "Int16Array",
    "Uint16Array",
    "Int32Array",
    "Uint32Array",
    "Float32Array",
    "Float64Array"
  ];
  for (const name of typedArrayNames) {
    addSerializer(name, (ctx, handle) => {
      const bufferHandle = ctx.getProp(handle, "buffer");
      try {
        // `getArrayBuffer` hands back a Lifetime that owns a view into the
        // guest heap, not a plain value. Dropping it leaks the underlying
        // object, and enough leaks trip `list_empty(&rt->gc_obj_list)` in
        // JS_FreeRuntime — an Emscripten abort that kills the run *after* it
        // produced its answer. Copy out, then release.
        const ab = ctx.getArrayBuffer(bufferHandle);
        try {
          return Uint8Array.from(ab.value);
        } finally {
          ab.dispose();
        }
      } finally {
        bufferHandle.dispose();
      }
    });
  }
}

// ---------------------------------------------------------------------------
// The never-reject convention
// ---------------------------------------------------------------------------

/**
 * Marker key placed on an object to signal a sandboxed error. A host async
 * function that would normally `throw` instead resolves with one of these
 * objects; a prelude inside the guest rewraps them as real guest-side errors.
 *
 * This indirection exists because the current `@sebastianwessel/quickjs`
 * runtime leaks handles whenever a host-backed guest Promise is *rejected*,
 * tripping an internal assertion (`list_empty(&rt->gc_obj_list)`) in
 * quickjs-ng when the runtime is freed. Routing failures through a resolved
 * tagged value sidesteps the leak while preserving the guest-visible
 * behaviour (the user still gets a thrown Error with name + message).
 */
export const SANDBOX_ERROR_MARKER = "__nodetool_sandbox_error__";

function neverReject<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>
): (...args: Args) => Promise<R | Record<string, unknown>> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (e) {
      return {
        [SANDBOX_ERROR_MARKER]: true,
        name: e instanceof Error ? e.name : "Error",
        message: e instanceof Error ? e.message : String(e)
      };
    }
  };
}

/**
 * Compose with {@link neverReject}: once the run is cancelled, every subsequent
 * host bridge call fails fast instead of doing work. The guest prelude rewraps
 * the marker into a real `throw`, so an awaiting script unwinds on its next
 * bridge call rather than running to completion after the user cancelled.
 *
 * Without an `isAborted` probe — a run the caller gave no cancellation source —
 * the bridge is handed back untouched, exactly as when there is no signal.
 */
function guardAbort<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R | Record<string, unknown>>,
  isAborted?: () => boolean
): (...args: Args) => Promise<R | Record<string, unknown>> {
  if (!isAborted) return fn;
  return async (...args: Args) => {
    if (isAborted()) {
      return {
        [SANDBOX_ERROR_MARKER]: true,
        name: "ExecutionCancelled",
        message: "Execution cancelled"
      };
    }
    return fn(...args);
  };
}

// ---------------------------------------------------------------------------
// Guest surface tables
// ---------------------------------------------------------------------------

/**
 * Names injected as bridge bindings into the QuickJS guest. The rest of the
 * `buildSandbox` record (JSON, Math, Date, URL, etc.) is deliberately NOT
 * marshaled — QuickJS already provides native implementations, and re-exposing
 * host versions creates thousands of handles that slow execution and leak on
 * teardown.
 */
export const EXPOSED_BRIDGE_NAMES = [
  "console",
  "fetch",
  "crypto",
  "sleep",
  "getSecret",
  "workspace",
  "assetToSandbox",
  "sandboxToAsset",
  "progress",
  "emit",
  "output",
  "format",
  "image",
  "audio",
  "video",
  "canvas",
  "media",
  "__maxIter",
  "__secretScope"
] as const;

export type ExposedBridgeName = (typeof EXPOSED_BRIDGE_NAMES)[number];

/**
 * Globals the init prelude removes. `eval` and `Function` go so the guest
 * cannot re-enter code generation. The rest are stubs
 * `@sebastianwessel/quickjs` installs unconditionally (its node-compatibility
 * layer and `provideEnv` have no off switch): `Buffer`, `process`, `env`,
 * `Headers`, `Request`, `Response`, `performance`. Nothing in the sandbox's
 * own machinery uses them — the fetch bridge returns plain objects and the
 * guest-to-host serializers dispatch on constructor names no guest code can
 * reach once the classes are gone — so they are deleted to keep the guest
 * surface minimal instead of documented as stubs.
 */
export const DELETED_GUEST_GLOBALS = [
  "eval",
  "Function",
  "Buffer",
  "process",
  "env",
  "Headers",
  "Request",
  "Response",
  "performance"
] as const;

/** Name the host parks the raw (never-rejecting) dispatcher bridge on. */
export const SANDBOX_WASM_BRIDGE_BINDING = "__wasmCall";

/** Name the host parks the raw (never-rejecting) host dispatcher bridge on. */
export const SANDBOX_HOST_BRIDGE_BINDING = "__hostCall";

/** Name the host parks the raw (never-rejecting) capability dispatcher on. */
export const SANDBOX_CAPABILITY_BRIDGE_BINDING = "__capabilityCall";

/**
 * Names the host parks the input bridges on, which the prelude captures and
 * then deletes — the guest reaches them only through `stream`.
 */
export const SANDBOX_INPUT_TAKE_BINDING = "__takeInput";
export const SANDBOX_STREAM_OPEN_BINDING = "__streamOpen";

// ---------------------------------------------------------------------------
// User code wrapping
// ---------------------------------------------------------------------------

/**
 * Timer globals the guest must not see. The documented contract has always
 * been "`sleep` is the only timer", but `@sebastianwessel/quickjs` installs
 * host-backed `setTimeout`/`setInterval`/`setImmediate` into the context on
 * every `evalCode` call — *after* the init prelude runs — so a prelude-time
 * `delete` does not stick. {@link wrapCode} deletes them inside the user-code
 * module itself, which evaluates after the library's re-install. They are
 * blocked deliberately: their callbacks fire through `ctx.callFunction` with
 * errors silently discarded, outside the never-reject and abort-guard
 * conventions every bridge follows. Concurrency does not need them —
 * bridge calls run in parallel under `Promise.all`/`parallelMap`.
 */
export const BLOCKED_TIMER_GLOBALS = [
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "setImmediate",
  "clearImmediate"
] as const;

/**
 * Wrap user code as the default export of an ES module with a top-level-awaited
 * async IIFE body, so `return <value>` inside the snippet becomes the module's
 * default export and `await` at the top level works. The module first drops
 * the timer globals the engine re-installs per evaluation (see
 * {@link BLOCKED_TIMER_GLOBALS}).
 */
export function wrapCode(
  code: string,
  prelude = "",
  encodeResult = false
): string {
  const [open, close] = resultEncoding(encodeResult);
  return `${dropTimersStatement()}${prelude}
export default ${open}await (async () => {
${code}
})()${close};`;
}

/**
 * Wrap the module's default export in the guest's JSON encoder, or leave it
 * alone. Both halves sit on the lines the IIFE already occupies, so
 * {@link entryBodyLineOffset} — and every stack trace mapped through it — is
 * unchanged either way.
 */
function resultEncoding(encodeResult: boolean): [string, string] {
  return encodeResult
    ? [`globalThis.${GUEST_MARSHAL_GLOBAL}(`, ")"]
    : ["", ""];
}

function dropTimersStatement(): string {
  return BLOCKED_TIMER_GLOBALS.map((n) => `delete globalThis.${n};`).join(" ");
}

/**
 * Build the entry module for user code, hoisting static `import` declarations
 * out of the async IIFE {@link wrapCode} wraps the body in.
 *
 * An `import` is only legal at module top level, so the IIFE body cannot hold
 * one. The imports are spliced out by source range and re-emitted on a single
 * line above the wrapper; the ranges they vacate are blanked with spaces (never
 * with fewer newlines), so every remaining line of user code keeps its content
 * and its offset from the body's start. The whole body shifts down by exactly
 * one line relative to {@link wrapCode}'s output.
 *
 * Import-free code takes the {@link wrapCode} path unchanged, and so does code
 * acorn cannot parse — a syntax error must reach the guest exactly as the user
 * wrote it, not as this transform's complaint about it.
 *
 * Dynamic `import()` expressions are left where they are. The module loader
 * denies them at runtime (see {@link createGuestModuleHost}); rewriting them
 * here would only move a runtime denial into a confusing compile-time one.
 */
export function buildEntryModule(
  code: string,
  prelude = "",
  encodeResult = false
): string {
  let program: acorn.Program;
  try {
    program = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true
    });
  } catch {
    return wrapCode(code, prelude, encodeResult);
  }

  const imports = program.body.filter(
    (node): node is acorn.ImportDeclaration => node.type === "ImportDeclaration"
  );
  if (imports.length === 0) return wrapCode(code, prelude, encodeResult);

  const hoisted: string[] = [];
  let body = "";
  let cursor = 0;
  for (const declaration of imports) {
    const text = code.slice(declaration.start, declaration.end);
    hoisted.push(text.endsWith(";") ? text : `${text};`);
    body += code.slice(cursor, declaration.start);
    body += text.replace(/[^\n]/g, " ");
    cursor = declaration.end;
  }
  body += code.slice(cursor);

  const [open, close] = resultEncoding(encodeResult);
  return `${hoisted.join(" ")}
${dropTimersStatement()}${prelude}
export default ${open}await (async () => {
${body}
})()${close};`;
}

/**
 * How many module lines {@link buildEntryModule} (or {@link wrapCode}) place
 * before the first line of the code it was given.
 *
 * QuickJS reports stack positions in the wrapped entry module, so an error on
 * the guest's line N sits at `N + offset` in the source the user wrote. The
 * hoisted-import path spends one extra leading line (the joined imports) over
 * the plain wrapper, and which path applied is decided by the same acorn parse
 * {@link buildEntryModule} runs — so the offset must come from here, not be
 * guessed by callers.
 */
export function entryBodyLineOffset(code: string): number {
  try {
    const program = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true
    });
    const hasImports = program.body.some(
      (node) => node.type === "ImportDeclaration"
    );
    return hasImports ? 3 : 2;
  } catch {
    // Unparsable code takes the wrapCode path — the same path its syntax
    // error will be reported against.
    return 2;
  }
}

// ---------------------------------------------------------------------------
// Guest module loading
// ---------------------------------------------------------------------------

/** Prefix of every module id this host resolves. Not a path — nothing mounts it. */
const GUEST_MODULE_PREFIX = "nodetool-sandbox:";

/**
 * The module id every denial normalizes to. QuickJS never caches a module whose
 * load failed, so one constant id serves every denial in a run: the normalizer
 * records the reason, the loader immediately turns it into a guest-side Error.
 */
const DENIED_MODULE_ID = `${GUEST_MODULE_PREFIX}denied`;

/** Separator between a pack name and a file id inside a module id. */
const GUEST_MODULE_SEPARATOR = "|";

/**
 * The private bridge module's guest id.
 *
 * Only a generated WASM facade may import it. The denial is decided by the
 * importing module, so neither user code nor a pack's authored JavaScript can
 * reach it by name — and a module that reaches the dispatcher some other way
 * gains nothing beyond the run's declared WASM surface, because the
 * dispatcher's own checks are the boundary.
 */
const WASM_BRIDGE_MODULE_ID = `${GUEST_MODULE_PREFIX}wasm-bridge`;

/**
 * The private host-bridge module's guest id.
 *
 * Only a generated host facade may import it, decided by the importing module —
 * so neither user code nor a pack's authored JavaScript can reach it by name.
 * A module that reaches the dispatcher some other way gains nothing beyond the
 * run's declared host surface, because the dispatcher's checks are the boundary.
 */
const HOST_BRIDGE_MODULE_ID = `${GUEST_MODULE_PREFIX}host-bridge`;

/**
 * The private capability-bridge module's guest id.
 *
 * Same rule as the host bridge: only a generated capability facade may import
 * it. What differs is who mounts a capability module — the host, per session,
 * never a pack's manifest and never the model's consent allowlist.
 */
const CAPABILITY_BRIDGE_MODULE_ID = `${GUEST_MODULE_PREFIX}capability-bridge`;

function guestModuleId(packName: string, fileId: string): string {
  return `${GUEST_MODULE_PREFIX}${packName}${GUEST_MODULE_SEPARATOR}${fileId}`;
}

/** Resolve a `./`-relative specifier against a pack-relative file id. */
function resolveRelativeFileId(fromFileId: string, specifier: string): string {
  const parts = fromFileId.split("/").slice(0, -1);
  for (const segment of specifier.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

export interface GuestModuleHost {
  /** Loader and normalizer to hand `runSandboxed`. */
  readonly options: Pick<
    SandboxRunOptions,
    "getModuleLoader" | "modulePathNormalizer"
  >;
  /** Stop delegating to the wrapper's own Node-compat resolution. */
  enterGuestPhase(): void;
  /** After the entry's static graph is linked, every further resolve is dynamic. */
  lockStaticGraph(): void;
}

/**
 * Install the run's declared sandbox modules as the *only* importable modules.
 *
 * The enforcement point is the **normalizer**, not the loader: QuickJS resolves
 * an already-loaded module straight out of its cache without consulting the
 * loader, but it normalizes every specifier first. A denial decided in the
 * normalizer therefore also holds for `node:buffer` and friends, which the
 * wrapper imports into the cache during its own bootstrap
 * (`prepareNodeCompatibility`) before guest code exists.
 *
 * Three phases, in order:
 *
 * 1. **bootstrap** — the wrapper's `import 'node:buffer'` and the rest of its
 *    compat preamble run before our sandboxed function is called. They resolve
 *    through the library's own normalizer, and through its loader for anything
 *    {@link BOOTSTRAP_MODULE_SOURCES} does not serve a cheaper source for, or
 *    the runtime never starts.
 * 2. **guest, linking** — only the run's declared specifiers and their
 *    intra-pack siblings resolve. Everything else — `node:*`, the compat
 *    modules the bootstrap warmed, absolute paths, `../` escapes, encoded
 *    traversals, another pack's internal files — is denied by name.
 * 3. **guest, locked** — the entry module's static graph is linked, so any
 *    further resolution is a dynamic `import()`, and every one of those is
 *    denied. A computed specifier is unknowable ahead of the call, and the
 *    declaration is the whole contract, so the stricter rule is the honest one.
 *
 * Loaded module sources are prefixed with the timer deletions
 * ({@link BLOCKED_TIMER_GLOBALS}) on the same line as their first statement:
 * dependencies evaluate *before* the entry body, so the entry's own deletions
 * come too late to harden them. `eval`/`Function` need no such treatment — the
 * init prelude deletes them for the whole context before any user `evalCode`.
 */
export function createGuestModuleHost(
  modules: SandboxModuleResolution | undefined,
  capabilityFacades?: ReadonlyMap<string, string>
): GuestModuleHost {
  const sources = new Map<string, string>();
  const specifiers = new Map<string, string>();
  const facades = new Set<string>();
  const hostFacades = new Set<string>();
  const platformFacades = new Set<string>();
  for (const [specifier, source] of capabilityFacades ?? []) {
    // A platform module has no pack behind it, so its guest id is derived from
    // the specifier rather than from a pack/file pair.
    const entryId = `${GUEST_MODULE_PREFIX}capability${GUEST_MODULE_SEPARATOR}${specifier}`;
    specifiers.set(specifier, entryId);
    sources.set(entryId, source);
    platformFacades.add(entryId);
  }
  for (const module of modules?.modules ?? []) {
    const entryId = guestModuleId(module.packName, module.moduleId);
    if (module.kind === "host") {
      // A host entry has no guest source of its own either: its specifier
      // resolves to a facade generated from the protocol registry, so the guest
      // surface of a host module is decided by NodeTool, never by the pack.
      const spec = sandboxHostModule(module.hostId);
      if (spec === undefined) {
        throw new Error(
          `${module.specifier}: "${module.hostId}" is not a host module NodeTool implements`
        );
      }
      specifiers.set(module.specifier, entryId);
      sources.set(entryId, generateSandboxHostFacade(module.specifier, spec));
      hostFacades.add(entryId);
      continue;
    }
    if (module.kind === "wasm") {
      // A WASM entry has no guest source of its own: its specifier resolves to
      // a generated facade over the per-run dispatcher. An authored sibling
      // importing "./thing.wasm" lands on the same id, so it gets the same
      // facade.
      specifiers.set(module.specifier, entryId);
      sources.set(
        entryId,
        generateSandboxWasmFacade(module.specifier, module.wasm)
      );
      facades.add(entryId);
      continue;
    }
    specifiers.set(module.specifier, entryId);
    sources.set(entryId, module.source);
    for (const file of module.graph) {
      if (file.kind !== "js") continue;
      sources.set(guestModuleId(module.packName, file.id), file.source);
    }
  }
  if (facades.size > 0)
    sources.set(WASM_BRIDGE_MODULE_ID, SANDBOX_WASM_BRIDGE_SOURCE);
  if (hostFacades.size > 0) {
    sources.set(HOST_BRIDGE_MODULE_ID, SANDBOX_HOST_BRIDGE_SOURCE);
  }
  if (platformFacades.size > 0) {
    sources.set(CAPABILITY_BRIDGE_MODULE_ID, SANDBOX_CAPABILITY_BRIDGE_SOURCE);
  }

  const hardening = dropTimersStatement();
  let phase: "bootstrap" | "guest" = "bootstrap";
  let locked = false;
  let denial = "";

  const deny = (message: string): string => {
    denial = message;
    return DENIED_MODULE_ID;
  };

  const resolve = (baseName: string, requested: string): string => {
    if (locked) {
      return deny(
        `dynamic import() is not allowed in the sandbox (requested "${requested}")`
      );
    }
    if (requested === SANDBOX_HOST_BRIDGE_SPECIFIER) {
      if (hostFacades.has(baseName)) return HOST_BRIDGE_MODULE_ID;
      return deny(
        `"${SANDBOX_HOST_BRIDGE_SPECIFIER}" is private to the sandbox's generated host facades and cannot be imported`
      );
    }
    if (requested === SANDBOX_CAPABILITY_BRIDGE_SPECIFIER) {
      if (platformFacades.has(baseName)) return CAPABILITY_BRIDGE_MODULE_ID;
      return deny(
        `"${SANDBOX_CAPABILITY_BRIDGE_SPECIFIER}" is private to the sandbox's generated capability facades and cannot be imported`
      );
    }
    if (requested === SANDBOX_WASM_BRIDGE_SPECIFIER) {
      if (facades.has(baseName)) return WASM_BRIDGE_MODULE_ID;
      return deny(
        `"${SANDBOX_WASM_BRIDGE_SPECIFIER}" is private to the sandbox's generated WASM facades and cannot be imported`
      );
    }
    const declared = specifiers.get(requested);
    if (declared !== undefined) return declared;
    if (requested.startsWith(".") && baseName.startsWith(GUEST_MODULE_PREFIX)) {
      const separator = baseName.indexOf(GUEST_MODULE_SEPARATOR);
      const pack = baseName.slice(GUEST_MODULE_PREFIX.length, separator);
      const fileId = baseName.slice(separator + 1);
      const target = resolveRelativeFileId(fileId, requested);
      for (const candidate of [target, `${target}.js`, `${target}/index.js`]) {
        const id = guestModuleId(pack, candidate);
        if (sources.has(id)) return id;
      }
      return deny(
        `"${requested}" is not a file of the ${pack} sandbox package`
      );
    }
    return deny(
      `"${requested}" is not a sandbox package this run serves — only an installed pack the code imports resolves`
    );
  };

  return {
    options: {
      modulePathNormalizer: (baseName, requestedName, context) =>
        phase === "bootstrap"
          ? defaultModulePathNormalizer(baseName, requestedName, context)
          : resolve(baseName, requestedName),
      getModuleLoader: (fs, runtimeOptions) => {
        const fallback = createDefaultModuleLoader(fs, runtimeOptions);
        return (moduleName, context) => {
          if (moduleName === DENIED_MODULE_ID) {
            return { error: new Error(denial) };
          }
          const source = sources.get(moduleName);
          if (source !== undefined) return { value: `${hardening}${source}` };
          if (phase === "bootstrap") {
            // The wrapper's own compat preamble. Most of what it compiles into
            // every fresh runtime, the init prelude deletes a moment later, so
            // it is served something cheaper — see BOOTSTRAP_MODULE_SOURCES.
            const stub = BOOTSTRAP_MODULE_SOURCES.get(
              normalizeBootstrapModuleId(moduleName)
            );
            if (stub !== undefined) return { value: stub };
            return fallback(moduleName, context);
          }
          return {
            error: new Error(`Module "${moduleName}" is not available`)
          };
        };
      }
    },
    enterGuestPhase() {
      phase = "guest";
    },
    lockStaticGraph() {
      locked = true;
    }
  };
}

// ---------------------------------------------------------------------------
// The interpreter run
// ---------------------------------------------------------------------------

/** One dispatcher call: WASM, host module, or platform capability. */
export type SandboxDispatchCall = (
  moduleKey: unknown,
  exportName: unknown,
  args: unknown
) => Promise<unknown>;

export interface InterpreterParams {
  /** The engine entry point. One process (or worker) keeps one. */
  runSandboxed: SandboxRunSandboxed;
  /** The user's code, unwrapped. */
  code: string;
  /**
   * The bridge record `buildSandbox` produced, including the two input
   * bindings. Only the names this module reaches for are read.
   */
  sandbox: Record<string, unknown>;
  /**
   * Caller-injected globals, already filtered against
   * `RESERVED_SANDBOX_NAMES` and the identifier rule.
   */
  globals: Record<string, unknown>;
  /**
   * Names in {@link globals} that hold objects, so their contents are read back
   * out of the guest and returned as {@link InterpreterOutcome.syncedGlobals}.
   */
  syncTargetNames: readonly string[];
  /** Exposed only when the run declares WASM modules. */
  wasmCall?: SandboxDispatchCall;
  /** Exposed only when the run declares host modules. */
  hostCall?: SandboxDispatchCall;
  /** Exposed only when the host mounted platform capability modules. */
  capabilityCall?: SandboxDispatchCall;
  /** Sandbox modules this run may import. */
  modules?: SandboxModuleResolution;
  /** Platform modules this run mounts: guest specifier → generated facade. */
  capabilityFacades?: ReadonlyMap<string, string>;
  /** Guest execution budget, enforced by the interrupt handler. */
  timeoutMs: number;
  limits: ResolvedSandboxLimits;
  /** Total suspension allowed before the engine's own backstop fires. */
  suspendAllowanceMs: number;
  /**
   * Whether a clock is metering this run. With one, the engine's wall-clock
   * abort moves out to cover {@link suspendAllowanceMs}; the interrupt handler
   * keeps the exact bound on guest execution either way.
   */
  hasClock: boolean;
  /**
   * Has the run been cancelled? Stands in for the caller's `AbortSignal`.
   * Absent when the caller passed none, which leaves every bridge unwrapped
   * exactly as before.
   */
  isAborted?: () => boolean;
  /** Milliseconds the run has spent suspended. Absent means none. */
  suspendedMs?: () => number;
  /** Internal slow-run diagnostics; never crosses the public sandbox API. */
  onTiming?: (timing: InterpreterTiming) => void;
}

export interface InterpreterTiming {
  readonly wrapperSetupMs: number;
  readonly initMs: number;
  readonly userCodeMs: number;
  readonly syncMs: number;
  readonly callbackRemainderMs: number;
  readonly wrapperCleanupMs: number;
  readonly totalMs: number;
}

/**
 * What one interpreter run produced: the guest's own eval response, plus the
 * object-globals read back out of the guest. The caller writes those back into
 * its host objects — the guest's heap is isolated, and a thread boundary makes
 * that separation literal.
 */
export type InterpreterOutcome =
  | { ok: true; data: unknown; syncedGlobals?: Record<string, unknown> }
  | {
      ok: false;
      error: { name: string; message: string; stack?: string };
      syncedGlobals?: Record<string, unknown>;
    };

/**
 * Run one piece of user code against a fresh guest context.
 *
 * Resolves with the guest's verdict — including a guest-side error, which is a
 * result and not a failure. It rejects only when the engine itself fails
 * (an Emscripten abort, a marshaling error, a module host that could not be
 * built), which the caller translates.
 */
export async function runInterpreter(
  params: InterpreterParams
): Promise<InterpreterOutcome> {
  const {
    runSandboxed,
    code,
    sandbox,
    globals,
    syncTargetNames,
    wasmCall,
    hostCall,
    capabilityCall,
    modules,
    capabilityFacades,
    timeoutMs,
    limits,
    suspendAllowanceMs,
    hasClock,
    isAborted,
    suspendedMs,
    onTiming
  } = params;

  const interpreterStartedAt = performance.now();
  let callbackEnteredAt = interpreterStartedAt;
  let callbackFinishedAt = interpreterStartedAt;
  let initMs = 0;
  let userCodeMs = 0;
  let syncMs = 0;

  // Built for every run, including one that resolved nothing. An empty host
  // serves no specifier and denies each by name; skipping it would leave the
  // wrapper's own Node-compat modules (`node:buffer` and friends) reachable
  // from guest code, which is the one thing the normalizer exists to stop.
  const moduleHost = createGuestModuleHost(modules, capabilityFacades);

  const outcome = await runSandboxed<InterpreterOutcome>(
    async ({ ctx, evalCode }) => {
      callbackEnteredAt = performance.now();
      // Past this point the wrapper's own Node-compat bootstrap has run, so
      // nothing else may resolve outside the run's declared modules.
      moduleHost.enterGuestPhase();
      // A CPU-bound guest never yields to the host event loop, so an abort
      // listener can't fire and Promise.race can't help. QuickJS polls this
      // interrupt handler from inside the interpreter, which is the only
      // mechanism that can stop a spinning loop. Compose cancellation with
      // the library's own wall-clock deadline (it installed one before
      // calling us; replacing it means re-implementing the deadline here).
      // Suspended time is added back, so a program parked on a permission
      // prompt resumes with the budget it had when it asked.
      const deadline = Date.now() + timeoutMs;
      ctx.runtime.setInterruptHandler(
        () =>
          isAborted?.() === true ||
          Date.now() > deadline + (suspendedMs?.() ?? 0)
      );

      const bridges: Record<string, unknown> = {};
      for (const name of EXPOSED_BRIDGE_NAMES) {
        bridges[name] = sandbox[name];
      }
      // Wrap every async bridge in a never-reject adapter (see
      // SANDBOX_ERROR_MARKER above). The guest prelude rewraps them back into
      // throwing functions before user code runs.
      // guardAbort short-circuits each bridge once the run is cancelled;
      // neverReject keeps the QuickJS handle-leak convention intact.
      const wrap = <A extends unknown[], R>(fn: (...a: A) => Promise<R>) =>
        guardAbort(neverReject(fn), isAborted);
      bridges.fetch = wrap(bridges.fetch as never);
      bridges.sleep = wrap(bridges.sleep as never);
      bridges.getSecret = wrap(bridges.getSecret as never);
      bridges.assetToSandbox = wrap(bridges.assetToSandbox as never);
      bridges.sandboxToAsset = wrap(bridges.sandboxToAsset as never);
      // The guest hands these an encoded payload (see the prelude): decode it
      // back into a value before the host sink ever sees it.
      const decodeValueArg =
        (fn: (name: unknown, value: unknown) => Promise<unknown>) =>
        async (name: unknown, payload: unknown) =>
          fn(name, decodeGuestPayload(payload));
      bridges.emit = wrap(decodeValueArg(bridges.emit as never));
      bridges.output = wrap(decodeValueArg(bridges.output as never));
      // The input bridges are not in EXPOSED_BRIDGE_NAMES — the prelude
      // captures them, builds `stream` on top, and deletes them. The take is
      // async like every other host call; the open probe is synchronous and
      // never throws, so it stays unwrapped (the `crypto.randomUUID` rule).
      bridges[SANDBOX_INPUT_TAKE_BINDING] = wrap(
        sandbox[SANDBOX_INPUT_TAKE_BINDING] as never
      );
      bridges[SANDBOX_STREAM_OPEN_BINDING] =
        sandbox[SANDBOX_STREAM_OPEN_BINDING];
      // Object bridges whose members are all async: wrap each member.
      const wrapAllMembers = (bridge: unknown) => {
        const out: Record<string, unknown> = {};
        const members = bridge as Record<
          string,
          (...a: never[]) => Promise<unknown>
        >;
        for (const [name, fn] of Object.entries(members)) {
          out[name] = wrap(fn as never);
        }
        return out;
      };
      bridges.workspace = wrapAllMembers(bridges.workspace);
      bridges.format = wrapAllMembers(bridges.format);
      bridges.image = wrapAllMembers(bridges.image);
      bridges.audio = wrapAllMembers(bridges.audio);
      bridges.video = wrapAllMembers(bridges.video);
      bridges.canvas = wrapAllMembers(bridges.canvas);
      bridges.media = wrapAllMembers(bridges.media);
      const hostCrypto = bridges.crypto as {
        randomUUID: () => string;
        getRandomValues: (n: number) => Record<string, string>;
        digest: (...a: never[]) => Promise<GuestBytes>;
        hmac: (...a: never[]) => Promise<GuestBytes>;
      };
      bridges.crypto = {
        // randomUUID/getRandomValues are synchronous and never throw, so they
        // stay unwrapped; the async pair follows the never-reject convention.
        randomUUID: hostCrypto.randomUUID,
        getRandomValues: hostCrypto.getRandomValues,
        digest: wrap(hostCrypto.digest),
        hmac: wrap(hostCrypto.hmac)
      };
      // The WASM dispatcher rides the same never-reject convention as every
      // other async bridge. It is exposed only when the run declares WASM
      // modules, so a run without them has no such binding at any point.
      if (wasmCall !== undefined) {
        const dispatch = wasmCall;
        bridges[SANDBOX_WASM_BRIDGE_BINDING] = wrap(
          async (moduleKey: unknown, exportName: unknown, args: unknown) =>
            dispatch(moduleKey, exportName, args)
        );
      }
      // Same treatment for host modules, exposed only when the run declares
      // one, so a run without them has no such binding at any point.
      if (hostCall !== undefined) {
        const dispatch = hostCall;
        bridges[SANDBOX_HOST_BRIDGE_BINDING] = wrap(
          async (moduleKey: unknown, exportName: unknown, args: unknown) =>
            dispatch(moduleKey, exportName, args)
        );
      }
      // And for the platform's own modules, exposed only when the host
      // mounted some — a session with no capability run has no such binding.
      if (capabilityCall !== undefined) {
        const dispatch = capabilityCall;
        bridges[SANDBOX_CAPABILITY_BRIDGE_BINDING] = wrap(
          async (moduleKey: unknown, exportName: unknown, args: unknown) =>
            dispatch(moduleKey, exportName, args)
        );
      }
      // Caller-injected globals are host functions too — guard the async
      // ones or a cancelled run keeps driving real work through them after
      // runInSandbox has returned. A caller-supplied global must follow the
      // byte-tagging contract itself (`toGuestBytesDeep`): a raw `Uint8Array`
      // returned to the guest is marshaled property-by-property, which OOMs
      // the guest and throws inside the library's detached marshaling
      // continuation. `guardHostProcess` on the caller's side keeps that from
      // killing the process, but the run still fails.
      // Data globals cross as one JSON string the prelude parses, because the
      // wrapper installs an object property-by-property — ~400 µs per object
      // node, which a Code node fed a few thousand rows pays before its first
      // statement. A value JSON plus the transport's markers cannot carry
      // (a function, a cycle, a class instance) keeps the wrapper's own path.
      const dataGlobals: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(globals)) {
        if (isFunction(value)) {
          bridges[name] = wrap(value as (...a: unknown[]) => Promise<unknown>);
        } else if (value === null || typeof value !== "object") {
          // A primitive crosses as a primitive: `newString` is one copy, while
          // JSON would escape the text only to parse it back again.
          bridges[name] = value;
        } else {
          dataGlobals[name] = value;
        }
      }
      if (Object.keys(dataGlobals).length > 0) {
        const encoded = encodeHostRecord(dataGlobals);
        if (encoded.cyclic.length > 0) {
          // The fallback cannot take these: the wrapper's marshaler follows a
          // cycle until the runtime aborts, which fails the run with an
          // assertion instead of saying what was wrong with the input.
          throw new Error(
            `Cannot pass ${encoded.cyclic
              .map((name) => `"${name}"`)
              .join(", ")} into the sandbox: the value refers back to itself`
          );
        }
        bridges[GUEST_GLOBALS_JSON_BINDING] = encoded.json;
        if (encoded.sidecar.length > 0) {
          bridges[GUEST_GLOBALS_SIDECAR_BINDING] = encoded.sidecar;
        }
        for (const name of encoded.skipped) {
          bridges[name] = dataGlobals[name];
        }
      }

      // `expose` manages its own internal Scope; the second arg is unused.
      const disposable = new Scope();
      try {
        expose(ctx, disposable, bridges);
      } finally {
        disposable.dispose();
      }

      // Block dynamic code generation and re-wrap the never-reject bridges as
      // throwing guest-side functions. Direct eval in QuickJS can't be neutered
      // by overwriting `globalThis.eval` (QuickJS still resolves the builtin),
      // but a plain `delete` removes the binding entirely so any reference
      // throws ReferenceError — same for `Function`.
      const initStartedAt = performance.now();
      await evalCode(
        `const __marker = "${SANDBOX_ERROR_MARKER}";
const __bytesMarker = "${SANDBOX_BYTES_MARKER}";
const __b64chars = "${BASE64_ALPHABET}";
const __asBytes = (input, where) => {
  if (typeof input === "string") return new TextEncoder().encode(input);
  // Anything without a byte length silently encoded to "" here, and the empty
  // string travelled on to whatever was going to save it. The call that
  // produces this most often is an un-awaited async one — every media op and
  // canvas.toBytes() is async — so say that rather than "invalid input".
  if (!input || typeof input.length !== "number") {
    const kind = input && typeof input.then === "function"
      ? "a Promise — await it first"
      : "a " + (input === null ? "null" : typeof input);
    throw new TypeError(where + ": expected a Uint8Array or string, got " + kind);
  }
  return input;
};
globalThis.toBase64 = (input) => {
  const b = __asBytes(input, "toBase64");
  let out = "";
  for (let i = 0; i < b.length; i += 3) {
    const c = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
    out += __b64chars[(c >> 18) & 63] + __b64chars[(c >> 12) & 63] +
      (i + 1 < b.length ? __b64chars[(c >> 6) & 63] : "=") +
      (i + 2 < b.length ? __b64chars[c & 63] : "=");
  }
  return out;
};
globalThis.fromBase64 = (s) => {
  const clean = String(s).replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array((clean.length * 6) >> 3);
  let acc = 0, bits = 0, o = 0;
  for (let i = 0; i < clean.length; i++) {
    acc = (acc << 6) | __b64chars.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 255; }
  }
  return out;
};
globalThis.toHex = (input) => {
  const b = __asBytes(input, "toHex");
  let s = "";
  for (let i = 0; i < b.length; i++) s += (b[i] < 16 ? "0" : "") + b[i].toString(16);
  return s;
};
globalThis.fromHex = (s) => {
  const t = String(s).replace(/[^0-9a-fA-F]/g, "");
  const out = new Uint8Array(t.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(t.substr(i * 2, 2), 16);
  return out;
};
globalThis.parallelMap = async (items, fn, concurrency) => {
  if (typeof fn !== "function") {
    throw new TypeError("parallelMap: fn must be a function");
  }
  const list = Array.from(items);
  const raw = Number(concurrency === undefined ? 5 : concurrency);
  const limit = Number.isFinite(raw)
    ? Math.min(Math.max(Math.floor(raw), 1), 32)
    : 5;
  const results = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      results[i] = await fn(list[i], i);
    }
  };
  const workers = [];
  for (let w = 0; w < Math.min(limit, list.length); w++) workers.push(worker());
  await Promise.all(workers);
  return results;
};
const __revive = (v) => (v && typeof v === "object" && typeof v[__bytesMarker] === "string")
  ? globalThis.fromBase64(v[__bytesMarker])
  : v;
const __wrap = (fn) => async (...args) => {
  const r = await fn(...args);
  if (r && r[__marker]) {
    const e = new Error(r.message);
    e.name = r.name;
    throw e;
  }
  return __revive(r);
};
const __rawFetch = __wrap(globalThis.fetch);
globalThis.fetch = async (...args) => {
  const r = await __rawFetch(...args);
  if (r && typeof r === "object") {
    const bb = r.bodyBytes;
    delete r.bodyBytes;
    r.text = async () => r.body;
    r.bytes = async () => __revive(bb);
    r.arrayBuffer = async () => __revive(bb).buffer;
  }
  return r;
};
// progress is fire-and-forget and returns undefined by contract. Behind a
// worker its bridge is an RPC proxy that answers with a promise, so the
// wrapper swallows the return value on both paths rather than leak the
// difference to the guest.
const __rawProgress = globalThis.progress;
globalThis.progress = (percent, message) => {
  void __rawProgress(percent, message);
};
globalThis.sleep = __wrap(globalThis.sleep);
globalThis.getSecret = __wrap(globalThis.getSecret);
globalThis.assetToSandbox = __wrap(globalThis.assetToSandbox);
globalThis.sandboxToAsset = __wrap(globalThis.sandboxToAsset);
// emit and output carry the run's data, so their argument takes the same
// JSON transport the result does — a single \`emit(rows)\` otherwise pays the
// wrapper's per-object marshal on the way out.
const __rawEmit = __wrap(globalThis.emit);
const __rawOutput = __wrap(globalThis.output);
globalThis.emit = (name, value) =>
  __rawEmit(name, globalThis.${GUEST_MARSHAL_GLOBAL}(value));
globalThis.output = (name, value) =>
  __rawOutput(name, globalThis.${GUEST_MARSHAL_GLOBAL}(value));
const __ws = globalThis.workspace;
globalThis.workspace = {
  read: __wrap(__ws.read),
  write: __wrap(__ws.write),
  list: __wrap(__ws.list),
  readBytes: __wrap(__ws.readBytes),
  writeBytes: __wrap(__ws.writeBytes),
  stat: __wrap(__ws.stat),
  root: __wrap(__ws.root),
  copy: __wrap(__ws.copy),
  move: __wrap(__ws.move),
  mkdir: __wrap(__ws.mkdir),
  remove: __wrap(__ws.remove)
};
const __fmt = globalThis.format;
globalThis.format = {
  number: __wrap(__fmt.number),
  date: __wrap(__fmt.date),
  relativeTime: __wrap(__fmt.relativeTime),
  list: __wrap(__fmt.list)
};
const __reviveDeep = (v) => {
  const r = __revive(v);
  if (r !== v) return r;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) v[i] = __reviveDeep(v[i]);
    return v;
  }
  if (v && typeof v === "object") {
    for (const k of Object.keys(v)) v[k] = __reviveDeep(v[k]);
    return v;
  }
  return v;
};
const __wrapDeep = (fn) => {
  const wrapped = __wrap(fn);
  return async (...args) => __reviveDeep(await wrapped(...args));
};
const __image = globalThis.image;
globalThis.image = {
  bytes: __wrapDeep(__image.bytes),
  toAsset: __wrapDeep(__image.toAsset),
  info: __wrapDeep(__image.info),
  decode: __wrapDeep(__image.decode),
  stats: __wrapDeep(__image.stats),
  blank: __wrapDeep(__image.blank),
  pad: __wrapDeep(__image.pad),
  grid: __wrapDeep(__image.grid),
  resize: __wrapDeep(__image.resize),
  crop: __wrapDeep(__image.crop),
  rotate: __wrapDeep(__image.rotate),
  flip: __wrapDeep(__image.flip),
  adjust: __wrapDeep(__image.adjust),
  composite: __wrapDeep(__image.composite),
  convert: __wrapDeep(__image.convert)
};
const __wrapMediaNamespace = (bridge) => {
  const out = {};
  for (const name of Object.keys(bridge)) out[name] = __wrapDeep(bridge[name]);
  return out;
};
globalThis.audio = __wrapMediaNamespace(globalThis.audio);
globalThis.video = __wrapMediaNamespace(globalThis.video);
const __canvasBridge = globalThis.canvas;
globalThis.canvas = {
  render: __wrapDeep(__canvasBridge.render),
  measureText: __wrapDeep(__canvasBridge.measureText)
};
const __mediaBridge = globalThis.media;
const __mediaOut = {};
for (const __m of ${JSON.stringify(MEDIA_REF_MEMBERS)}) {
  __mediaOut[__m] = __wrapDeep(__mediaBridge[__m]);
}
globalThis.media = __mediaOut;
// The input side of emit. An async iterable cannot cross the bridge, so the
// guest builds one over a take-one-value host call: the body pulls, and an item
// it has not asked for stays in the host's inbox. The raw bindings are captured
// and deleted, so \`stream\` is the only way to reach them.
const __takeInput = __wrapDeep(globalThis.${SANDBOX_INPUT_TAKE_BINDING});
const __streamOpen = globalThis.${SANDBOX_STREAM_OPEN_BINDING};
delete globalThis.${SANDBOX_INPUT_TAKE_BINDING};
delete globalThis.${SANDBOX_STREAM_OPEN_BINDING};
const __streamName = (fn, name) => {
  if (typeof name !== "string") {
    throw new TypeError(fn + ": name must be a string");
  }
  return name;
};
// \`handle\` is null for stream.any(), which yields [handle, value] pairs.
const __streamIterable = (handle) => ({
  [Symbol.asyncIterator]: () => ({
    next: async () => {
      const take = await __takeInput(handle);
      if (take.done) return { done: true, value: undefined };
      return {
        done: false,
        value: handle === null ? [take.handle, take.value] : take.value
      };
    }
  })
});
globalThis.stream = (name) => __streamIterable(__streamName("stream", name));
globalThis.stream.any = () => __streamIterable(null);
globalThis.stream.first = async (name) => {
  const take = await __takeInput(__streamName("stream.first", name));
  return take.done ? undefined : take.value;
};
globalThis.stream.open = (name) => {
  const open = __streamOpen(__streamName("stream.open", name));
  // null is the host saying this run has no input stream at all. Every other
  // stream verb reports that by throwing; this one has to do it here, because
  // a synchronous bridge cannot.
  if (open === null) {
    throw new Error(${JSON.stringify(NO_INPUT_STREAM_MESSAGE)});
  }
  return open;
};
const __canvasProps = ${JSON.stringify(CANVAS_PROPERTIES)};
const __canvasMethods = ${JSON.stringify(CANVAS_METHODS)};
const __canvasGradients = ${JSON.stringify(CANVAS_GRADIENT_FACTORIES)};
const __gradMarker = "${CANVAS_GRADIENT_MARKER}";
// A canvas context is a host object with methods, which the bridge contract
// cannot carry. So this records the ordinary Canvas 2D calls synchronously and
// ships the whole draw list in one canvas.render() when toBytes() is awaited.
globalThis.createCanvas = (width, height) => {
  const ops = [];
  const gradients = {};
  let gradientSeq = 0;
  const asStyle = (value) =>
    value && typeof value === "object" && typeof value[__gradMarker] === "string"
      ? { [__gradMarker]: value[__gradMarker] }
      : value;
  const ctx = {};
  for (const name of __canvasMethods) {
    ctx[name] = (...args) => {
      ops.push({ op: name, args });
      return ctx;
    };
  }
  ctx.drawImage = (source, ...rest) => {
    ops.push({ op: "drawImage", args: [source, ...rest] });
    return ctx;
  };
  const values = {};
  for (const prop of __canvasProps) {
    Object.defineProperty(ctx, prop, {
      enumerable: true,
      get: () => values[prop],
      set: (value) => {
        values[prop] = value;
        ops.push({ op: "set", args: [prop, asStyle(value)] });
      }
    });
  }
  for (const factory of Object.keys(__canvasGradients)) {
    ctx[factory] = (...coords) => {
      const id = "g" + gradientSeq++;
      const spec = { type: __canvasGradients[factory], coords, stops: [] };
      gradients[id] = spec;
      const handle = {
        [__gradMarker]: id,
        addColorStop: (offset, color) => {
          spec.stops.push([offset, color]);
          return handle;
        }
      };
      return handle;
    };
  }
  const surface = {
    width,
    height,
    getContext: (kind) => {
      if (kind !== undefined && kind !== "2d") {
        throw new Error('createCanvas: only the "2d" context exists');
      }
      return ctx;
    },
    toSpec: (options) => ({
      width,
      height,
      gradients,
      ops,
      ...(options || {})
    }),
    // render answers with a handle, like every other image producer, so a
    // drawing that goes straight into image.* never crosses the boundary.
    // toBytes keeps its name's promise and pays for the bytes explicitly.
    toImage: (options) => globalThis.canvas.render(surface.toSpec(options)),
    toBytes: async (options) =>
      globalThis.image.bytes(
        await globalThis.canvas.render(surface.toSpec(options))
      )
  };
  return surface;
};
const __crypto = globalThis.crypto;
globalThis.crypto = {
  randomUUID: () => __crypto.randomUUID(),
  getRandomValues: (n) => {
    const len = Number(n);
    if (!Number.isFinite(len) || len < 0) {
      throw new TypeError("crypto.getRandomValues: length must be a non-negative number");
    }
    return __revive(__crypto.getRandomValues(Math.floor(len)));
  },
  digest: __wrap(__crypto.digest),
  hmac: __wrap(__crypto.hmac)
};
${GUEST_JSON_TRANSPORT_SOURCE}
${DELETED_GUEST_GLOBALS.map((n) => `delete globalThis.${n};`).join("\n")}
${
  wasmCall === undefined
    ? ""
    : `globalThis.${SANDBOX_WASM_DISPATCH_GLOBAL} = __wrap(globalThis.${SANDBOX_WASM_BRIDGE_BINDING});
delete globalThis.${SANDBOX_WASM_BRIDGE_BINDING};`
}
${
  hostCall === undefined
    ? ""
    : `globalThis.${SANDBOX_HOST_DISPATCH_GLOBAL} = __wrapDeep(globalThis.${SANDBOX_HOST_BRIDGE_BINDING});
delete globalThis.${SANDBOX_HOST_BRIDGE_BINDING};`
}
${
  capabilityCall === undefined
    ? ""
    : `globalThis.${SANDBOX_CAPABILITY_DISPATCH_GLOBAL} = __wrapDeep(globalThis.${SANDBOX_CAPABILITY_BRIDGE_BINDING});
delete globalThis.${SANDBOX_CAPABILITY_BRIDGE_BINDING};`
}
export default true;`,
        "sandbox-init"
      );
      initMs = performance.now() - initStartedAt;

      // `evalCode` compiles and links the module — resolving its whole static
      // import graph — before its first await, so a resolution that arrives
      // after this call has returned can only come from a dynamic `import()`.
      // The dispatcher binding lives only long enough for the bridge module
      // to capture it while the entry's static graph links. This deletion is
      // the entry module's first statement, so it runs after every imported
      // module has evaluated and before the user IIFE starts.
      const userCodeStartedAt = performance.now();
      const pendingUserResult = evalCode(
        buildEntryModule(
          code,
          `${
            wasmCall === undefined
              ? ""
              : ` delete globalThis.${SANDBOX_WASM_DISPATCH_GLOBAL};`
          }${
            hostCall === undefined
              ? ""
              : ` delete globalThis.${SANDBOX_HOST_DISPATCH_GLOBAL};`
          }${
            capabilityCall === undefined
              ? ""
              : ` delete globalThis.${SANDBOX_CAPABILITY_DISPATCH_GLOBAL};`
          }`,
          true
        ),
        "user-code"
      );
      moduleHost.lockStaticGraph();
      const userResult = await pendingUserResult;
      userCodeMs = performance.now() - userCodeStartedAt;

      // Read mutable globals back out. node:vm shared the host heap, so
      // `state.counter++` in user code mutated the caller's object directly.
      // With QuickJS the guest heap is isolated, so after user code runs we
      // extract the current values of the object-typed user globals and hand
      // them to the caller, which replaces the contents of its own objects in
      // place. CodeNode relies on this to make its `state` object persist
      // across invocations.
      let syncedGlobals: Record<string, unknown> | undefined;
      if (syncTargetNames.length > 0) {
        const syncStartedAt = performance.now();
        const extractor = `export default globalThis.${GUEST_MARSHAL_GLOBAL}({${syncTargetNames
          .map(
            (n) =>
              `${n}: (typeof ${n} !== 'undefined' && ${n} !== null) ? ${n} : null`
          )
          .join(", ")}});`;
        const syncResp = await evalCode(extractor, "sandbox-sync");
        if (syncResp.ok) {
          const decoded = decodeGuestPayload(syncResp.data);
          if (isObjectLike(decoded)) {
            syncedGlobals = decoded;
          }
        }
        syncMs = performance.now() - syncStartedAt;
      }

      const result: InterpreterOutcome = userResult.ok
        ? {
            ok: true,
            data: decodeGuestPayload(userResult.data),
            syncedGlobals
          }
        : { ok: false, error: userResult.error, syncedGlobals };
      callbackFinishedAt = performance.now();
      return result;
    },
    {
      // The engine's own abort is a plain `setTimeout` armed when evaluation
      // starts — it cannot be paused. With a clock in play it becomes the
      // backstop for a run that stays suspended forever, while the interrupt
      // handler above keeps the exact bound on guest execution.
      executionTimeout: hasClock
        ? Math.min(
            timeoutMs + Math.max(0, suspendAllowanceMs),
            MAX_ENGINE_TIMEOUT_MS
          )
        : timeoutMs,
      memoryLimit: limits.memoryLimitBytes,
      maxStackSize: limits.stackLimitBytes,
      // The library defaults this to `{NODE_DEBUG: "true"}`, which reaches
      // the guest as `process.env` and can flip debug paths in its `node:util`
      // polyfill. Guest code has no business reading host-shaped environment
      // variables, so the stub carries nothing.
      env: {},
      ...moduleHost.options
    }
  );
  const interpreterFinishedAt = performance.now();
  const callbackMs = callbackFinishedAt - callbackEnteredAt;
  onTiming?.({
    wrapperSetupMs: callbackEnteredAt - interpreterStartedAt,
    initMs,
    userCodeMs,
    syncMs,
    callbackRemainderMs: Math.max(
      0,
      callbackMs - initMs - userCodeMs - syncMs
    ),
    wrapperCleanupMs: Math.max(
      0,
      interpreterFinishedAt - callbackFinishedAt
    ),
    totalMs: interpreterFinishedAt - interpreterStartedAt
  });
  return outcome;
}
