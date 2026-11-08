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
import { mkdirSync } from "node:fs";
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
  plugins: [providerCapabilitiesPlugin(), imageNodePlugin(), ...capabilityPlugins(), hostModulesPlugin(), contractPlugin({ profile: "core" })],
  logLevel: "warning",
};

let result;
if (profile === "core") {
  result = await build(options);
} else {
  const { parityPlugins } = await import("./parity/profile.mjs");
  const { baseNodeModules } = await import("../parity/modules.mjs");
  const modules = moduleList ? moduleList.split(",").filter(Boolean) : baseNodeModules();
  const admit = profile === "default" ? (await import("./local-nodes.mjs")).localAdmission() : null;
  result = await build({ ...options, logLevel: "silent", plugins: [providerCapabilitiesPlugin(), imageNodePlugin(), ...capabilityPlugins(), ...await parityPlugins({ modules, admit })] });
}
// The drift check, the node requirements manifest and the write
// (module-contract-build.mjs). Only a build of every node module can tell
// that a table entry is no longer imported.
const finished = await finishBundle(result, outfile, { complete: profile !== "core" && !moduleList });
console.log(outfile);
console.error(`node requirements: ${finished.manifest} (${finished.types} of ${finished.classes} node types)`);
