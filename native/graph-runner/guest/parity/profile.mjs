// The `parity` guest profile: bundles every module the base node library
// (ALL_BASE_NODES) is built from, so the parity suite can run each node in
// QuickJS. The default profile bundles the same modules and admits only the
// node types guest/local-nodes.mjs lists, without the probe node.
//
// entry.mjs stays as it is. Its three node imports, when made from entry.mjs,
// resolve to one generated module (`nodes.mjs`, below) that imports every
// node module with a dynamic import() inside its own try/catch and exports
// the classes that loaded. A module that throws at load time, or whose
// top-level await rejects, therefore removes only its own nodes, and the
// probe node reports the error.
//
// Host packages, Node builtins and native packages resolve through the module
// contract (guest/module-contract.mjs): an export the guest cannot provide is
// a stub that throws "guest: <module>.<name> is unavailable in the native
// runner (<reason>: <note>)" when called, constructed or read. Nothing is
// faked, so a node that reaches a stub fails with what it lacks in the
// message. A package esbuild cannot resolve at all becomes a module that
// throws on load.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hostModulesPlugin } from "../host-modules.mjs";
import { contractPlugin, missingSource } from "../module-contract-build.mjs";
import { contextUnavailable as declaredUnavailable } from "../context-unavailable.mjs";
import { REASONS } from "../module-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const guestDir = dirname(here);
const entryPath = join(guestDir, "entry.mjs");

const CONTEXT_LINE = "const newContext = (jobId, workflowId) => createContext(jobId, workflowId);";

/** Members of the real ProcessingContext: methods and other values. */
async function contextMembers() {
  const { ProcessingContext } = await import("@nodetool-ai/runtime/context");
  const methods = new Set();
  const values = new Set(Object.keys(new ProcessingContext({ jobId: "job" })));
  for (let p = ProcessingContext.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    for (const name of Object.getOwnPropertyNames(p)) {
      if (name === "constructor") continue;
      const d = Object.getOwnPropertyDescriptor(p, name);
      if (typeof d.value === "function") methods.add(name);
      else values.add(name);
    }
  }
  return { methods: [...methods].sort(), values: [...values].filter((v) => !methods.has(v)).sort() };
}

/**
 * The guest context (guest/host/context.mjs) keeps its members. Any other
 * member of the real ProcessingContext throws "guest: ProcessingContext.<name>
 * is unavailable in the native runner (<reason>: <note>)": a method when
 * called, a value when read. The reason is the one guest/context-unavailable.mjs
 * declares, and a member outside NodeContext says so. Names the real context
 * lacks read as undefined, as they would there.
 */
function contextSource({ methods, values }) {
  const reasons = Object.fromEntries(
    Object.entries(declaredUnavailable).map(([name, reason]) => [name, `${reason}: ${REASONS[reason]}`])
  );
  return `const contextMethods = new Set(${JSON.stringify(methods)});
const contextValues = new Set(${JSON.stringify(values)});
const contextReasons = ${JSON.stringify(reasons)};
const contextUnavailable = (name) => new Error(\`guest: ProcessingContext.\${name} is unavailable in the native runner (\${contextReasons[name] ?? "not a NodeContext member"})\`);
const newContext = (jobId, workflowId) => new Proxy(createContext(jobId, workflowId), {
  get(target, key) {
    if (typeof key !== "string" || key in target) return target[key];
    if (contextMethods.has(key)) return () => { throw contextUnavailable(key); };
    if (contextValues.has(key)) throw contextUnavailable(key);
    return undefined;
  }
});`;
}

/**
 * The generated node module. `modules` are the specifiers base-nodes builds
 * ALL_BASE_NODES from. Each is a dynamic import(), so a module with
 * top-level await bundles, and modules load one after another in this order.
 */
function nodesSource(modules, polyfillBuffer, admit, lazy) {
  const thunk = (spec) => `() => import(${JSON.stringify(spec)})`;
  const eager = lazy ? modules.filter((spec) => lazy.eager(spec)) : modules;
  const deferred = lazy ? modules.filter((spec) => !lazy.eager(spec)) : [];
  const loads = eager
    .map((spec) => `await load(${JSON.stringify(spec)}, ${thunk(spec)});`)
    .join("\n");
  // Lazy evaluation (PT7): with a type snapshot that matches this build in
  // the bundle assets, a deferred module is evaluated when one of its types
  // is first needed (entry.mjs, lazyNodes). Without one, every module loads.
  const lazySource = lazy
    ? `const deferredModules = { ${deferred.map((spec) => `${JSON.stringify(spec)}: ${thunk(spec)}`).join(", ")} };
const moduleOfType = ${JSON.stringify(lazy.moduleOfType)};
const BUILD_ID = ${JSON.stringify(lazy.buildId)};
function readSnapshot() {
  const assets = globalThis.__host?.bundleAssets;
  if (!assets?.available?.()) return null;
  let snapshot;
  try {
    snapshot = JSON.parse(assets.readText("types.json"));
  } catch {
    return null;
  }
  return snapshot?.buildId === BUILD_ID ? snapshot : null;
}
const snapshot = readSnapshot();
const loading = new Map();
globalThis.__nodetoolLazyNodes = {
  buildId: BUILD_ID,
  snapshot,
  // The deferred module that defines a type not yet loaded, or undefined.
  pendingModule(type) {
    const spec = moduleOfType[type];
    return snapshot && spec in deferredModules && !loading.has(spec + ":done") && type in snapshot.types ? spec : undefined;
  },
  // Evaluates the module of a type; resolves to the classes it admits.
  ensure(type) {
    const spec = moduleOfType[type];
    if (!loading.has(spec)) {
      loading.set(spec, deferredModules[spec]().then((mod) => {
        loading.set(spec + ":done", true);
        const found = {};
        for (const value of Object.values(mod)) {
          for (const cls of Array.isArray(value) ? value : [value]) {
            if (typeof cls === "function" && typeof cls.nodeType === "string" && cls.nodeType in snapshot.types) found[cls.nodeType] ??= cls;
          }
        }
        return found;
      }));
    }
    return loading.get(spec);
  }
};
if (!snapshot) {
${deferred.map((spec) => `  await load(${JSON.stringify(spec)}, ${thunk(spec)});`).join("\n")}
}`
    : "";
  // Node's Buffer, from the "buffer" package (the implementation browser
  // bundlers use), installed before any node module loads.
  const buffer = polyfillBuffer
    ? 'import { Buffer as BufferPolyfill } from "buffer/";\nif (globalThis.Buffer === undefined) globalThis.Buffer = BufferPolyfill;'
    : "";
  return `
${buffer}
import { buildProbe } from ${JSON.stringify(join(here, "probe.mjs"))};
const report = [];
const classes = {};
function errorText(err) {
  return err instanceof Error ? \`\${err.name}: \${err.message}\` : String(err);
}
function frames(err) {
  return err instanceof Error && typeof err.stack === "string"
    ? err.stack.split("\\n").map((l) => l.trim()).filter(Boolean).slice(0, 4)
    : [];
}
async function load(spec, thunk) {
  let mod;
  try {
    mod = await thunk();
  } catch (err) {
    report.push({ module: spec, ok: false, error: errorText(err), stack: frames(err) });
    return;
  }
  const found = [];
  for (const value of Object.values(mod)) {
    for (const cls of Array.isArray(value) ? value : [value]) {
      if (typeof cls === "function" && typeof cls.nodeType === "string" && cls.nodeType) {
        found.push(cls);
      }
    }
  }
  for (const cls of found) {
    if (admitted(spec, cls.nodeType)) classes[cls.nodeType] ??= cls;
  }
  report.push({ module: spec, ok: true, classes: new Set(found).size });
}
${admit
    ? `const admitModules = new Set(${JSON.stringify(admit.modules)});
const admitTypes = new Set(${JSON.stringify(admit.types)});
const admitted = (spec, type) => admitModules.has(spec) || admitTypes.has(type);`
    : "const admitted = () => true;"}
${loads}
${lazySource}
const probe = buildProbe(report, classes);
export const parityClasses = ${admit ? "probe.admitted" : "{ ...probe.admitted, [probe.Probe.nodeType]: probe.Probe }"};
`;
}

function hasBufferPackage() {
  try {
    createRequire(import.meta.url).resolve("buffer/");
    return true;
  } catch {
    return false;
  }
}

const CONSTANT_IMPORT = 'import * as constant from "@nodetool-ai/core-nodes/nodes/constant";';

/**
 * `admit`, {modules, types}, keeps every class of the listed modules and the
 * listed node types, and leaves out the probe node. Without it every class
 * loads.
 */
export async function parityPlugins({ modules, admit = null, lazy = null }) {
  const polyfillBuffer = hasBufferPackage();
  const emptyEsm = join(here, "empty.mjs");
  return [
    hostModulesPlugin(),
    contractPlugin(),
    {
      name: "parity-profile",
      setup(b) {
        // entry.mjs's node imports: the first carries every class, the other two are empty.
        b.onResolve({ filter: /^@nodetool-ai\/core-nodes\/nodes\/(constant|control|input)$/ }, (args) => {
          if (args.importer !== entryPath) return undefined;
          if (args.path.endsWith("/constant")) return { path: "nodes.mjs", namespace: "parity-nodes" };
          return { path: emptyEsm };
        });
        b.onLoad({ filter: /.*/, namespace: "parity-nodes" }, () => ({
          contents: nodesSource(modules, polyfillBuffer, admit, lazy),
          loader: "js",
          resolveDir: here
        }));

        // entry.mjs's stand-in context, made to name what a node asks of it,
        // and its first node import, which becomes nodes.mjs's class map.
        b.onLoad({ filter: /[\\/]entry\.mjs$/ }, async (args) => {
          if (args.path !== entryPath) return undefined;
          const source = readFileSync(entryPath, "utf8");
          for (const line of [CONTEXT_LINE, CONSTANT_IMPORT]) {
            if (!source.includes(line)) {
              throw new Error(`parity profile: entry.mjs no longer contains "${line}"`);
            }
          }
          const members = await contextMembers();
          return {
            contents: source
              .replace(CONTEXT_LINE, contextSource(members))
              .replace(CONSTANT_IMPORT, CONSTANT_IMPORT.replace("* as constant", "{ parityClasses as constant }")),
            loader: "js",
            resolveDir: guestDir
          };
        });

        b.onResolve({ filter: /.*/ }, async (args) => {
          if (args.namespace === "parity-missing" || args.pluginData?.probing || /^[./]/.test(args.path)) return undefined;
          const r = await b.resolve(args.path, {
            kind: args.kind,
            resolveDir: args.resolveDir,
            importer: args.importer,
            pluginData: { probing: true }
          });
          // Anything esbuild cannot resolve becomes a module that throws on load.
          return r.errors.length > 0 ? { path: args.path, namespace: "parity-missing" } : undefined;
        });
        b.onLoad({ filter: /.*/, namespace: "parity-missing" }, (args) => ({
          contents: missingSource(args.path, "not resolvable from the bundle"),
          loader: "js"
        }));

        // Binary assets a bundled package imports directly.
        b.onLoad({ filter: /\.(node|wasm)$/ }, (args) => ({
          contents: missingSource(args.path, "native addon or WebAssembly binary"),
          loader: "js"
        }));
      }
    }
  ];
}
