// Bundle the guest: the core node classes plus the host protocol in
// entry.mjs, as one self-contained ES module for QuickJS. A module, because
// node code may use top-level await; the runner awaits its evaluation.
//
//   node guest/build.mjs [outfile] [--profile default|parity|core] [--modules a,b,...]
//
// The default profile (build/guest.js) bundles every module of the base node
// library and runs the node types guest/local-nodes.mjs admits: the core
// workflow nodes and the nodes at parity. The parity profile
// (build/guest-parity.js) bundles the same modules, or the --modules list,
// admits every class and adds the probe node, as described in
// parity/profile.mjs. The core profile (build/guest-core.js) bundles only the
// core workflow modules and delivered-trigger nodes that entry.mjs imports.
// In all three, the capability plugins of guest/host/plugins.mjs point node
// code at the guest halves of host capabilities, and the module contract
// (module-contract.mjs) resolves host packages, Node builtins and native
// packages. After bundling, the build checks the contract against the
// bundle and writes <bundle>.node-requirements.json next to it.
import { build } from "esbuild";
import { providerCapabilitiesPlugin } from "./provider-capabilities-plugin.mjs";
import { textEncodingBanner } from "./text-encoding-banner.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hostModulesPlugin } from "./host-modules.mjs";
import { imageNodePlugin } from "./host/image-node-plugin.mjs";
import { capabilityPlugins } from "./host/plugins.mjs";
import { contractPlugin, finishBundle } from "./module-contract-build.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const profile = option("--profile") ?? "default";
const moduleList = option("--modules");
if (!["default", "parity", "core"].includes(profile)) {
  console.error(`unknown profile ${profile} (have: default, parity, core)`);
  process.exit(2);
}
if (moduleList && profile !== "parity") {
  console.error("--modules needs --profile parity");
  process.exit(2);
}
const outfile = args[0] ?? join(here, "..", "build", { default: "guest.js", parity: "guest-parity.js", core: "guest-core.js" }[profile]);
mkdirSync(dirname(outfile), { recursive: true });

const options = {
  entryPoints: [join(here, "entry.mjs")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile,
  banner: { js: textEncodingBanner },
  write: false,
  metafile: true,
  // Smaller source to parse and keep. Names stay: node code and stack traces read them.
  minifySyntax: true,
  minifyWhitespace: true,
  legalComments: "none",
  plugins: [providerCapabilitiesPlugin(), imageNodePlugin(), ...capabilityPlugins(), hostModulesPlugin(), contractPlugin({ profile: "core" })],
  logLevel: "warning",
};

let result;
if (profile === "core") {
  result = await build(options);
} else {
  const { parityPlugins } = await import("./parity/profile.mjs");
  const { baseNodeModules } = await import("../parity/modules.mjs");
  let modules = moduleList ? moduleList.split(",").filter(Boolean) : baseNodeModules();
  const admit = profile === "default" ? (await import("./local-nodes.mjs")).localAdmission() : null;
  if (admit && !moduleList) {
    // The default profile runs only the admitted types, so a module that
    // defines none of them stays out of the bundle. The inventory maps each
    // type to its module. An admitted type it lacks fails the build, because
    // dropping its module would drop the node.
    const inventory = JSON.parse(readFileSync(join(here, "..", "parity", "inventory.json"), "utf8"));
    const moduleOf = new Map(inventory.map((entry) => [entry.type, entry.module]));
    const needed = new Set(admit.modules);
    for (const type of admit.types) {
      const module = moduleOf.get(type);
      if (!module) throw new Error(`admitted node type ${type} is not in parity/inventory.json`);
      needed.add(module);
    }
    modules = modules.filter((spec) => needed.has(spec));
    for (const spec of needed) {
      if (!modules.includes(spec)) throw new Error(`admitted module ${spec} is not a base node module`);
    }
  }
  result = await build({ ...options, logLevel: "silent", plugins: [providerCapabilitiesPlugin(), imageNodePlugin(), ...capabilityPlugins(), ...await parityPlugins({ modules, admit })] });
}
// The drift check, the node requirements manifest and the write
// (module-contract-build.mjs). Only a build of every node module can tell
// that a table entry is no longer imported. The default profile bundles
// only the modules of admitted types, so it leaves that check to the parity
// profile.
const finished = await finishBundle(result, outfile, { complete: profile === "parity" && !moduleList });
// The esbuild metafile, for the size accounting of the bundle.
if (result.metafile) writeFileSync(`${outfile}.meta.json`, JSON.stringify(result.metafile));
console.log(outfile);
console.error(`node requirements: ${finished.manifest} (${finished.types} of ${finished.classes} node types)`);
