// Build-time half of the guest module contract (module-contract.mjs).
//
//   contractPlugin()      resolves every specifier the contract governs:
//                         a wrapped module to its provider, any other to a
//                         generated stub whose unavailable exports throw with
//                         the table's reason. Also serves
//                         `nodetool:node-requirements` (see below).
//   checkContract()       the drift check, after the build: fails when
//                         bundled code imports a name the table does not
//                         classify, or when the table classifies a name its
//                         provider lacks, or an unavailable name its real
//                         module lacks or its provider has.
//   nodeRequirements()    for each node type, the unavailable exports its
//                         code reaches (contract-analysis.mjs explains how).
//   finishBundle()        embeds the requirements in the bundle and writes
//                         them next to it as <bundle>.node-requirements.json.
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hostOperations, ModuleGraph } from "./contract-analysis.mjs";
import { MODULES, NODE_EXCEPTIONS, REASONS } from "./module-contract.mjs";

const guestDir = dirname(fileURLToPath(import.meta.url));
const repoDir = join(guestDir, "..", "..", "..");
const require = createRequire(import.meta.url);

const BUILTINS = new Set(builtinModules.filter((m) => !m.startsWith("_")));
const FAMILY = /^@nodetool-ai\/(runtime|storage|config|kernel)(\/.*)?$/;
const REQUIREMENTS_PLACEHOLDER = "__NODETOOL_NODE_REQUIREMENTS__";

const SUBPATH_KEYS = Object.keys(MODULES).filter((key) => MODULES[key].subpaths);

/** The table key that governs `spec`, or null. Builtins are keyed `node:<name>`. */
export function contractKey(spec) {
  const bare = spec.startsWith("node:") ? spec.slice(5) : spec;
  if (BUILTINS.has(bare)) return `node:${bare}`;
  if (MODULES[spec]) return spec;
  const pkg = SUBPATH_KEYS.find((key) => spec.startsWith(`${key}/`));
  if (pkg) return pkg;
  return FAMILY.test(spec) ? spec : null;
}

/**
 * The record for `key`. A specifier the table does not declare (the check
 * reports it) gets a stub; an undeclared runtime or storage subpath keeps
 * its package's provider.
 */
function recordFor(key) {
  if (MODULES[key]) return MODULES[key];
  const pkg = /^(@nodetool-ai\/[^/]+)\//.exec(key)?.[1];
  return pkg && MODULES[pkg]?.provider ? { provider: MODULES[pkg].provider, exports: {} } : { exports: {} };
}

const providerPath = (provider) =>
  typeof provider === "string" ? join(guestDir, provider) : require.resolve(provider.package);
const isCommonJs = (path) => path.endsWith(".cjs") || (path.endsWith(".js") && path.includes("node_modules"));
const suffixOf = (entry) => (entry ? ` (${entry.reason}: ${entry.note})` : "");
const unavailableEntries = (record) =>
  Object.entries(record.exports ?? {}).filter(([, e]) => e.kind === "unavailable");

/** Export names of the real module, split into functions and other values. */
const realCache = new Map();
async function realExports(spec) {
  const key = BUILTINS.has(spec.replace(/^node:/, "")) ? `node:${spec.replace(/^node:/, "")}` : spec;
  if (!realCache.has(key)) {
    realCache.set(key, (async () => {
      try {
        const mod = await import(key);
        return Object.entries(mod).map(([name, value]) => ({ name, fn: typeof value === "function" }));
      } catch {
        return [];
      }
    })());
  }
  return realCache.get(key);
}

const STUB_PRELUDE = `
function unavailableFunction(name) {
  const fail = function () { throw new Error(messageFor(name)); };
  return new Proxy(fail, { construct() { throw new Error(messageFor(name)); } });
}
function unavailableValue(target, name) {
  Object.defineProperty(target, name, { enumerable: true, get() { throw new Error(messageFor(name)); } });
}`;

function messageSource(spec, record) {
  const suffixes = Object.fromEntries(unavailableEntries(record).map(([name, e]) => [name, suffixOf(e)]));
  return `const spec = ${JSON.stringify(spec)};
const suffixes = ${JSON.stringify(suffixes)};
const otherSuffix = ${JSON.stringify(suffixOf(record.whole ?? record.rest))};
const messageFor = (name) => \`guest: \${spec}.\${name} is unavailable in the native runner\${Object.prototype.hasOwnProperty.call(suffixes, name) ? suffixes[name] : otherSuffix}\`;`;
}

/**
 * CommonJS source for the stub of `spec`: every export of the real module
 * and every name the table lists. A name the provider has comes from the
 * provider; any other throws when called or constructed (a function) or
 * read (a value). The provider's extra names pass through.
 */
function stubSource(spec, record, exportsList, provider) {
  return `${messageSource(spec, record)}
${STUB_PRELUDE}
const real = ${provider ? `require(${JSON.stringify(provider)})` : "{}"};
const exportsList = ${JSON.stringify(exportsList)};
// A callable default export is the module object itself, as for a CommonJS
// package whose module.exports is a function.
const out = exportsList.some((e) => e.name === "default" && e.fn) ? unavailableFunction("default") : {};
for (const { name, fn } of exportsList) {
  if (name === "default" && fn) { out.default = out; continue; }
  if (Object.prototype.hasOwnProperty.call(real, name)) out[name] = real[name];
  else if (fn) out[name] = unavailableFunction(name);
  else unavailableValue(out, name);
}
for (const name of Object.keys(real)) if (!(name in out)) out[name] = real[name];
module.exports = out;
`;
}

/** A wrapped module whose table lists unavailable names: the provider plus throwing stubs for them. */
function wrapperSource(spec, record, provider, flags, providerHasDefault) {
  const names = unavailableEntries(record).map(([name]) => name);
  const fnOf = (name) => flags.find((e) => e.name === name)?.fn ?? true;
  if (isCommonJs(provider)) {
    return `${messageSource(spec, record)}
${STUB_PRELUDE}
const out = { ...require(${JSON.stringify(provider)}) };
${names.map((n) => (fnOf(n) ? `out[${JSON.stringify(n)}] = unavailableFunction(${JSON.stringify(n)});` : `unavailableValue(out, ${JSON.stringify(n)});`)).join("\n")}
module.exports = out;
`;
  }
  return `${messageSource(spec, record)}
${STUB_PRELUDE}
export * from ${JSON.stringify(provider)};
${providerHasDefault ? `export { default } from ${JSON.stringify(provider)};` : ""}
${names.map((n) => `export const ${n} = unavailableFunction(${JSON.stringify(n)});`).join("\n")}
`;
}

/** CommonJS source for a module that cannot be bundled at all. */
export function missingSource(spec, reason) {
  // `module.exports` makes it CommonJS, so any named import of it still bundles.
  return `module.exports = {};\nthrow new Error(${JSON.stringify(`guest: ${spec} is unavailable in the native runner (${reason})`)});`;
}

/**
 * esbuild plugin for every governed specifier. `profile` "core" keeps the
 * core profile's pass-through resolution: a provider answers for its
 * module, through a CommonJS wrapper for a package so that a name it lacks
 * reads as undefined, and a builtin without one is empty.
 */
export function contractPlugin({ profile = "default" } = {}) {
  return {
    name: "guest-module-contract",
    setup(b) {
      b.onResolve({ filter: /^nodetool:node-requirements$/ }, () => ({ path: "requirements", namespace: "node-requirements" }));
      b.onLoad({ filter: /.*/, namespace: "node-requirements" }, () => ({
        // finishBundle() replaces the placeholder. A bundle built without it,
        // such as a unit test bundle, has no requirements.
        contents: `const requirements = ${JSON.stringify(REQUIREMENTS_PLACEHOLDER)};
export default requirements.startsWith("{") ? JSON.parse(requirements) : {};`,
        loader: "js"
      }));

      b.onResolve({ filter: /.*/ }, (args) => {
        if (args.namespace === "contract-stub" || args.namespace === "contract-core") return undefined;
        const key = contractKey(args.path);
        if (!key) return undefined;
        const record = recordFor(key);
        const isBuiltin = key.startsWith("node:");
        if (profile === "core") {
          if (record.provider && typeof record.provider === "string") {
            const path = providerPath(record.provider);
            if (record.wrap || isBuiltin || isCommonJs(path)) return { path };
            return { path: key, namespace: "contract-core", pluginData: { path } };
          }
          return isBuiltin ? { path: join(guestDir, "shims", "empty.cjs") } : undefined;
        }
        if (record.wrap && record.provider && unavailableEntries(record).length === 0) {
          return typeof record.provider === "string"
            ? { path: providerPath(record.provider) }
            : { path: require.resolve(record.provider.package) };
        }
        return { path: args.path, namespace: "contract-stub", pluginData: { key } };
      });

      b.onLoad({ filter: /.*/, namespace: "contract-core" }, (args) => ({
        contents: `module.exports = require(${JSON.stringify(args.pluginData.path)});`,
        loader: "js",
        resolveDir: guestDir
      }));

      b.onLoad({ filter: /.*/, namespace: "contract-stub" }, async (args) => {
        const key = args.pluginData.key;
        const record = recordFor(key);
        const flags = await realExports(key.startsWith("node:") ? key : args.path);
        if (record.wrap) {
          const provider = providerPath(record.provider);
          const providerHasDefault = !isCommonJs(provider) && (await providerExports(provider)).has("default");
          return { contents: wrapperSource(args.path, record, provider, flags, providerHasDefault), loader: "js", resolveDir: guestDir };
        }
        if (record.whole && flags.length === 0 && !key.startsWith("node:")) {
          return { contents: missingSource(args.path, `${record.whole.reason}: ${record.whole.note}`), loader: "js" };
        }
        const listed = Object.keys(record.exports ?? {}).filter((n) => !flags.some((e) => e.name === n));
        const exportsList = [...flags, ...listed.map((name) => ({ name, fn: true }))];
        const provider = record.provider ? providerPath(record.provider) : null;
        return { contents: stubSource(args.path, record, exportsList, provider), loader: "js", resolveDir: guestDir };
      });
    }
  };
}

// ------------------------------------------------------------ providers

const exportCache = new Map();

/** Export names of a provider: esbuild's view of an ES module, require() keys of a CommonJS one. */
async function providerExports(path) {
  if (exportCache.has(path)) return exportCache.get(path);
  let names;
  if (isCommonJs(path)) {
    names = new Set(["default", ...Object.keys(require(path))]);
  } else {
    const local = (p) => p.startsWith(guestDir);
    const result = await build({
      entryPoints: [path],
      bundle: true,
      format: "esm",
      platform: "neutral",
      write: false,
      metafile: true,
      outdir: "/contract-exports",
      logLevel: "silent",
      plugins: [{
        name: "contract-exports-external",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (a) => {
            if (a.kind === "entry-point") return undefined;
            const abs = a.path.startsWith(".") ? join(a.resolveDir, a.path) : null;
            return abs && local(abs) ? undefined : { path: a.path, external: true };
          });
        }
      }]
    });
    const out = Object.values(result.metafile.outputs).find((o) => o.entryPoint);
    names = new Set(out?.exports ?? []);
    // esbuild cannot list what `export * from "<package>"` re-exports.
    for (const [, spec] of readFileSync(path, "utf8").matchAll(/^export \* from ["']([^./"'][^"']*)["']/gm)) {
      for (const name of Object.keys(await import(spec))) if (name !== "default") names.add(name);
    }
  }
  exportCache.set(path, names);
  return names;
}

/** Export names of the module a `guest(from)` entry names. */
async function guestSourceExports(from) {
  if (/^packages\//.test(from)) return providerExports(join(repoDir, from));
  const { resolveReal } = await import("./host-modules.mjs");
  const path = from.startsWith("@nodetool-ai/runtime/") ? resolveReal(from) : null;
  try {
    const mod = await import(path ? pathToFileURL(path).href : from);
    return new Set([...Object.keys(mod), ...Object.keys(mod.default ?? {})]);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- check

const label = (spec, name) => `${spec}.${name}`;
const shortPath = (p) => (isAbsolute(p) ? relative(repoDir, p) : relative(repoDir, join(process.cwd(), p)));

/**
 * The drift check. `imported` is ModuleGraph.importedNames(). `complete`
 * means the build bundled every node module, so an entry nothing imports is
 * stale. Returns the list of problems; empty when the table holds.
 */
export async function checkContract(imported, { complete }) {
  const problems = [];
  const used = new Map();

  for (const [importer, specs] of Object.entries(imported)) {
    for (const [spec, names] of Object.entries(specs)) {
      const key = contractKey(spec);
      const record = MODULES[key];
      if (!record) {
        problems.push(`${shortPath(importer)} imports ${spec}, which guest/module-contract.mjs does not declare`);
        continue;
      }
      if (!used.has(key)) used.set(key, new Set());
      for (const name of names) {
        used.get(key).add(name);
        if (record.whole) continue;
        if (name === "*") {
          if (!record.wrap && !record.rest) {
            problems.push(`${shortPath(importer)} uses ${spec} as a whole; declare \`rest\` for ${key} in guest/module-contract.mjs`);
          }
          continue;
        }
        if (!record.exports?.[name]) {
          problems.push(`${shortPath(importer)} imports ${label(spec, name)}, which guest/module-contract.mjs does not classify`);
        }
      }
    }
  }

  const media = hostOperations(join(guestDir, "host", "media-native.mjs"));
  for (const [key, record] of Object.entries(MODULES)) {
    if (record.whole) {
      if (!REASONS[record.whole.reason]) problems.push(`${key}: unknown reason "${record.whole.reason}"`);
      continue;
    }
    const provider = record.provider ? providerPath(record.provider) : null;
    const provided = provider ? await providerExports(provider) : new Set();
    const real = unavailableEntries(record).length ? new Set((await realExports(key)).map((e) => e.name)) : new Set();
    for (const [name, entry] of Object.entries(record.exports ?? {})) {
      const where = label(key, name);
      if (complete && !used.get(key)?.has(name)) problems.push(`${where} is classified, but no bundled code imports it; remove it`);
      if (entry.kind === "unavailable") {
        if (!REASONS[entry.reason]) problems.push(`${where}: unknown reason "${entry.reason}"`);
        if (!entry.note) problems.push(`${where}: an unavailable entry needs a note`);
        if (provided.has(name)) problems.push(`${where} is classified unavailable, but ${record.provider.package ?? record.provider} provides it`);
        if (real.size > 0 && !real.has(name)) problems.push(`${where} is classified unavailable, but the real ${key} does not export it`);
        continue;
      }
      if (provider && !provided.has(name)) problems.push(`${where} is classified ${entry.kind}, but ${record.provider.package ?? record.provider} does not export it`);
      if (entry.kind === "guest") {
        const names = await guestSourceExports(entry.from);
        if (names === null) problems.push(`${where}: cannot load ${entry.from}`);
        else if (!names.has(name)) problems.push(`${where} is classified guest from ${entry.from}, which does not export it`);
      } else if (entry.kind === "guest-impl") {
        const names = await providerExports(join(guestDir, entry.file));
        if (!names.has(entry.as ?? name)) problems.push(`${where} is classified guest-impl in ${entry.file}, which does not export ${entry.as ?? name}`);
      } else if (entry.kind === "host") {
        const ops = (media.get(name) ?? []).map((op) => `media.${op}`);
        if (!media.has(name)) problems.push(`${where} is classified host, but ${entry.file} does not define it`);
        else if (ops.join() !== [...entry.ops].sort().join()) {
          problems.push(`${where} is classified host with ${entry.ops.join(", ")}, but ${entry.file} calls ${ops.join(", ") || "no host operation"}`);
        }
      } else {
        problems.push(`${where}: unknown kind "${entry.kind}"`);
      }
    }
  }
  return problems;
}

// --------------------------------------------------------- requirements

/** Node types the C++ kernel runs without the TypeScript body are listed in NODE_EXCEPTIONS. */
function classify(spec, name) {
  const key = contractKey(spec);
  const record = key && MODULES[key];
  if (!record) return null;
  if (record.whole) return { spec: key, name, reason: record.whole.reason, note: record.whole.note };
  const entry = record.exports?.[name];
  return entry?.kind === "unavailable" ? { spec: key, name, reason: entry.reason, note: entry.note } : null;
}

/**
 * `{ nodeType: [{ spec, name, reason, note }] }` for every node type whose
 * code reaches an unavailable export, minus NODE_EXCEPTIONS. A whole-module
 * use of a module with a `rest` entry is not counted: the analysis cannot
 * tell which of its exports the code reads. Also returns the exception
 * problems for the drift check.
 */
export function nodeRequirements(graph, { complete }) {
  const requirements = {};
  const problems = [];
  const classes = graph.nodeClasses();
  for (const [type, defs] of [...classes].sort(([a], [b]) => a.localeCompare(b))) {
    const found = new Map();
    for (const def of defs) {
      for (const { spec, name } of graph.reach(def.path, def.unit)) {
        const c = classify(spec, name);
        if (c) found.set(label(c.spec, c.name), c);
      }
    }
    const exception = NODE_EXCEPTIONS[type];
    if (exception) {
      for (const e of exception.exports) if (complete && !found.has(e)) problems.push(`NODE_EXCEPTIONS: ${type} no longer reaches ${e}; remove it`);
      for (const e of exception.exports) found.delete(e);
    }
    if (found.size) requirements[type] = [...found.values()].sort((a, b) => label(a.spec, a.name).localeCompare(label(b.spec, b.name)));
  }
  if (complete) for (const type of Object.keys(NODE_EXCEPTIONS)) if (!classes.has(type)) problems.push(`NODE_EXCEPTIONS: no bundled class has node type ${type}`);
  return { requirements, problems, classes: classes.size };
}

// ------------------------------------------------------------- finishing

/**
 * Runs the check and the requirements analysis over a finished build
 * (`write: false`, `metafile: true`), embeds the requirements, and writes
 * the bundle and `<bundle>.node-requirements.json`. Throws on drift.
 */
export async function finishBundle(result, outfile, { complete }) {
  const graph = new ModuleGraph(result.metafile, (spec) => contractKey(spec) !== null);
  const problems = await checkContract(graph.importedNames(), { complete });
  const { requirements, problems: exceptionProblems, classes } = nodeRequirements(graph, { complete });
  problems.push(...exceptionProblems);
  if (problems.length) {
    throw new Error(`guest module contract (guest/module-contract.mjs) does not match the bundle:\n  - ${problems.join("\n  - ")}`);
  }
  const output = result.outputFiles.find((f) => f.path.endsWith(".js"));
  const quoted = JSON.stringify(REQUIREMENTS_PLACEHOLDER);
  const parts = output.text.split(quoted);
  if (parts.length > 2) throw new Error("guest bundle: the node requirements placeholder appears more than once");
  const text = parts.length === 2 ? parts.join(JSON.stringify(JSON.stringify(requirements))) : output.text;
  writeFileSync(outfile, text);
  for (const f of result.outputFiles) if (f !== output) writeFileSync(f.path, f.contents);
  const manifest = join(dirname(outfile), `${basename(outfile).replace(/\.m?js$/, "")}.node-requirements.json`);
  writeFileSync(manifest, `${JSON.stringify(requirements, null, 2)}\n`);
  return { manifest, classes, types: Object.keys(requirements).length };
}

