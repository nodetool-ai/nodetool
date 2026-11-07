// The `parity` guest profile: bundles every module the base node library
// (ALL_BASE_NODES) is built from, so the parity suite can run each node in
// QuickJS. The default profile is untouched by anything in this file.
//
// entry.mjs stays as it is. Its three node imports, when made from entry.mjs,
// resolve to one generated module (`nodes.mjs`, below) that imports every
// node module with a dynamic import() inside its own try/catch and exports
// the classes that loaded. A module that throws at load time, or whose
// top-level await rejects, therefore removes only its own nodes, and the
// probe node reports the error.
//
// Code a node imports but the guest cannot provide becomes a named stub: each
// export of the real module is replaced by a function that throws
// "guest: <module>.<name> is unavailable" when called or constructed, or by a
// getter that throws the same error when read. Nothing is faked, so a node
// that reaches a stub fails with the capability it lacks in the message.
import { readFileSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOST_MODULES as HOST_WRAPPERS } from "../host/modules.mjs";
import { hostModuleFor, hostModulesPlugin } from "../host-modules.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const guestDir = dirname(here);
const entryPath = join(guestDir, "entry.mjs");

/** Modules the native host must provide. Every specifier under these is stubbed. */
const HOST_MODULES = /^@nodetool-ai\/(runtime|storage|config|kernel)(\/.*)?$/;

/**
 * Real implementations that replace stubbed exports: the config and kernel
 * shims, and the guest's host modules (guest/host/) for the runtime and
 * storage packages and the Node builtins it provides.
 */
const OVERRIDES = {
  "@nodetool-ai/config": join(guestDir, "shims", "config.cjs"),
  "@nodetool-ai/kernel": join(guestDir, "shims", "kernel.cjs")
};
const overrideFor = (spec) => OVERRIDES[spec] ?? hostModuleFor(spec);

const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

// Third-party packages that are native addons, WebAssembly or launchers for
// host processes. QuickJS cannot run them, so they become stubs instead of
// being bundled. Named here so a failure says which one a node needs.
const NATIVE_PACKAGES = [
  "sharp",
  "webgpu",
  "playwright",
  "playwright-core",
  "@hyzyla/pdfium",
  "onnxruntime-node",
  "onnxruntime-web",
  "@huggingface/transformers",
  "node-llama-cpp",
  "canvas",
  "@napi-rs/canvas",
  "fsevents"
];
const nativePackage = (spec) =>
  NATIVE_PACKAGES.find((p) => spec === p || spec.startsWith(`${p}/`));

/** Export names of the real module, split into functions and other values. */
async function realExports(spec) {
  try {
    const mod = await import(spec);
    return Object.entries(mod).map(([name, value]) => ({ name, fn: typeof value === "function" }));
  } catch {
    return [];
  }
}

/**
 * CommonJS source for a stub of `spec`. A function export becomes a function
 * that throws when called or constructed. Any other export throws when read.
 */
function stubSource(spec, exports, override) {
  return `
const spec = ${JSON.stringify(spec)};
const messageFor = (name) => \`guest: \${spec}.\${name} is unavailable in the native runner\`;
function unavailableFunction(name) {
  const fail = function () { throw new Error(messageFor(name)); };
  return new Proxy(fail, { construct() { throw new Error(messageFor(name)); } });
}
const real = ${override ? `require(${JSON.stringify(override)})` : "{}"};
const exportsList = ${JSON.stringify(exports)};
// A callable default export is the module object itself, as for a CommonJS
// package whose module.exports is a function.
const out = exportsList.some((e) => e.name === "default" && e.fn) ? unavailableFunction("default") : {};
for (const { name, fn } of exportsList) {
  if (name === "default" && fn) { out.default = out; continue; }
  if (Object.prototype.hasOwnProperty.call(real, name)) out[name] = real[name];
  else if (fn) out[name] = unavailableFunction(name);
  else Object.defineProperty(out, name, { enumerable: true, get() { throw new Error(messageFor(name)); } });
}
for (const name of Object.keys(real)) if (!(name in out)) out[name] = real[name];
module.exports = out;
`;
}

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
 * is unavailable": a method when called, a value when read. Names the real
 * context lacks read as undefined, as they would there.
 */
function contextSource({ methods, values }) {
  return `const contextMethods = new Set(${JSON.stringify(methods)});
const contextValues = new Set(${JSON.stringify(values)});
const contextUnavailable = (name) => new Error(\`guest: ProcessingContext.\${name} is unavailable in the native runner\`);
const newContext = (jobId, workflowId) => new Proxy(createContext(jobId, workflowId), {
  get(target, key) {
    if (typeof key !== "string" || key in target) return target[key];
    if (contextMethods.has(key)) return () => { throw contextUnavailable(key); };
    if (contextValues.has(key)) throw contextUnavailable(key);
    return undefined;
  }
});`;
}

/** CommonJS source for a module that cannot be bundled at all. */
function missingSource(spec, reason) {
  // `module.exports` makes it CommonJS, so any named import of it still bundles.
  return `module.exports = {};\nthrow new Error(${JSON.stringify(`guest: ${spec} is unavailable in the native runner (${reason})`)});`;
}

/**
 * The generated node module. `modules` are the specifiers base-nodes builds
 * ALL_BASE_NODES from. Each is a dynamic import(), so a module with
 * top-level await bundles, and modules load one after another in this order.
 */
function nodesSource(modules, polyfillBuffer) {
  const loads = modules
    .map((spec) => `await load(${JSON.stringify(spec)}, () => import(${JSON.stringify(spec)}));`)
    .join("\n");
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
  for (const cls of found) classes[cls.nodeType] ??= cls;
  report.push({ module: spec, ok: true, classes: new Set(found).size });
}
${loads}
const probe = buildProbe(report, classes);
export const parityClasses = { ...probe.admitted, [probe.Probe.nodeType]: probe.Probe };
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
 * `builtinShims` maps Node builtins the guest implements (without the
 * `node:` prefix) to their guest modules. Their stubs take every export the
 * guest module has, and the rest throw as for any other builtin.
 */
export async function parityPlugins({ modules, builtinShims = {} }) {
  const polyfillBuffer = hasBufferPackage();
  const emptyEsm = join(here, "empty.mjs");
  return [
    hostModulesPlugin(),
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
          contents: nodesSource(modules, polyfillBuffer),
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
          if (args.namespace === "parity-stub") return undefined;
          const spec = args.path;
          // Packages a host capability provides (guest/host/modules.mjs).
          if (HOST_WRAPPERS[spec]) return { path: HOST_WRAPPERS[spec] };
          if (polyfillBuffer && (spec === "buffer" || spec === "node:buffer")) {
            return { path: createRequire(import.meta.url).resolve("buffer/") };
          }
          if (HOST_MODULES.test(spec) || BUILTINS.has(spec)) {
            return { path: spec, namespace: "parity-stub", pluginData: { kind: "host" } };
          }
          const native = nativePackage(spec);
          if (native) return { path: spec, namespace: "parity-stub", pluginData: { kind: "native", pkg: native } };
          if (args.pluginData?.probing) return undefined;
          const relative = /^[./]/.test(spec);
          if (relative) return undefined;
          const r = await b.resolve(spec, {
            kind: args.kind,
            resolveDir: args.resolveDir,
            importer: args.importer,
            pluginData: { probing: true }
          });
          // Anything esbuild cannot resolve becomes a module that throws on load.
          if (r.errors.length > 0) {
            return { path: spec, namespace: "parity-stub", pluginData: { kind: "missing" } };
          }
          return undefined;
        });

        b.onLoad({ filter: /.*/, namespace: "parity-stub" }, async (args) => {
          const { kind } = args.pluginData ?? {};
          if (kind === "missing") {
            return { contents: missingSource(args.path, "not resolvable from the bundle"), loader: "js" };
          }
          const real = BUILTINS.has(args.path) && !args.path.startsWith("node:") ? `node:${args.path}` : args.path;
          const exports = await realExports(real);
          if (kind === "native" && exports.length === 0) {
            return { contents: missingSource(args.path, "native addon or host process"), loader: "js" };
          }
          const override = overrideFor(args.path) ?? (BUILTINS.has(args.path) ? builtinShims[args.path.replace(/^node:/, "")] : undefined);
          return { contents: stubSource(args.path, exports, override), loader: "js", resolveDir: guestDir };
        });

        // Binary assets a bundled package imports directly.
        b.onLoad({ filter: /\.(node|wasm)$/ }, (args) => ({
          contents: missingSource(args.path, "native addon or WebAssembly binary"),
          loader: "js"
        }));
      }
    }
  ];
}
