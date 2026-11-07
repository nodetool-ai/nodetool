// Bundle the guest: the core node classes plus the host protocol in
// entry.mjs, as one self-contained ES module for QuickJS. A module, because
// node code may use top-level await; the runner awaits its evaluation.
//
//   node guest/build.mjs [outfile] [--profile default|parity] [--modules a,b,...]
//
// The default profile (build/guest.js) bundles the core workflow modules and
// delivered-trigger nodes that entry.mjs imports. The parity profile
// (build/guest-parity.js) bundles every module of the base node library, or
// the --modules list, as described in parity/profile.mjs. In both, the
// capability plugins of guest/host/plugins.mjs point node code at the guest
// halves of host capabilities.
import { build } from "esbuild";
import { providerCapabilitiesPlugin } from "./provider-capabilities-plugin.mjs";
import { textEncodingBanner } from "./text-encoding-banner.mjs";
import { builtinModules } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOST_MODULES } from "./host/modules.mjs";
import { hostModuleFor, hostModulesPlugin } from "./host-modules.mjs";
import { imageNodePlugin } from "./host/image-node-plugin.mjs";
import { capabilityPlugins } from "./host/plugins.mjs";

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
if (!["default", "parity"].includes(profile)) {
  console.error(`unknown profile ${profile} (have: default, parity)`);
  process.exit(2);
}
if (moduleList && profile !== "parity") {
  console.error("--modules needs --profile parity");
  process.exit(2);
}
const outfile = args[0] ?? join(here, "..", "build", profile === "default" ? "guest.js" : "guest-parity.js");
mkdirSync(dirname(outfile), { recursive: true });

const shims = {
  "@nodetool-ai/config": join(here, "shims", "config.cjs"),
  "@nodetool-ai/kernel": join(here, "shims", "kernel.cjs")
};
const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`)
]);
// Node builtins the guest implements (guest/host/). Every other builtin
// resolves to an empty module.
const builtinShims = {
  process: join(here, "host", "process.mjs"),
  timers: join(here, "host", "timers.mjs")
};
const builtinShim = (spec) => builtinShims[spec.replace(/^node:/, "")];

// Host packages and the builtins the guest provides map onto guest/host/
// through CommonJS shims, so a name the guest lacks reads as undefined
// instead of failing the build. Other builtins are empty.
const shimPlugin = {
  name: "guest-shims",
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => {
      if (HOST_MODULES[args.path]) return { path: HOST_MODULES[args.path] };
      if (shims[args.path]) return { path: shims[args.path] };
      if (builtinShim(args.path)) return { path: builtinShim(args.path) };
      if (/^@nodetool-ai\/runtime(\/.*)?$/.test(args.path)) return { path: join(here, "shims", "runtime.cjs") };
      if (/^@nodetool-ai\/storage(\/.*)?$/.test(args.path)) return { path: join(here, "shims", "storage.cjs") };
      if (builtins.has(args.path)) return { path: hostModuleFor(args.path) ?? join(here, "shims", "empty.cjs") };
      return undefined;
    });
  }
};

const options = {
  entryPoints: [join(here, "entry.mjs")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile,
  banner: { js: textEncodingBanner },
  plugins: [providerCapabilitiesPlugin(), imageNodePlugin(), ...capabilityPlugins(), hostModulesPlugin(), shimPlugin],
  logLevel: "warning",
};

if (profile === "parity") {
  const { parityPlugins } = await import("./parity/profile.mjs");
  const { baseNodeModules } = await import("../parity/modules.mjs");
  const modules = moduleList ? moduleList.split(",").filter(Boolean) : baseNodeModules();
  await build({ ...options, logLevel: "silent", plugins: [providerCapabilitiesPlugin(), imageNodePlugin(), ...capabilityPlugins(), ...await parityPlugins({ modules, builtinShims })] });
} else {
  await build(options);
}
console.log(outfile);
