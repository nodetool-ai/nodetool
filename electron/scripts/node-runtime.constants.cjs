// electron/scripts/node-runtime.constants.cjs
// Single source of truth for the Node runtime bundled into the packaged
// backend. Pure, dependency-free helpers so the fetch script, after-pack, and
// tests all agree on versions, archive names, and which dawn.node binaries to
// keep per target.

const path = require("path");

// Pinned to .nvmrc. The backend runs on this exact Node; better-sqlite3 is
// rebuilt against its ABI, so bumping this requires re-fetching binaries and
// rebuilding native modules.
const NODE_RUNTIME_VERSION = "22.22.1";

/** All platforms electron-builder can target; used when prefetching every arch. */
const ALL_NODE_RUNTIME_TARGETS = [
  { platform: "darwin", arch: "arm64" },
  { platform: "darwin", arch: "x64" },
  { platform: "win32", arch: "x64" },
  { platform: "linux", arch: "x64" },
];

/**
 * Default fetch targets for the host OS. Matches what `npm run build` in electron
 * needs locally; release CI calls electron-builder per runner and after-pack
 * self-heals any missing target via an explicit `platform-arch` arg.
 */
function hostNodeRuntimeTargets(platform, arch) {
  if (platform === "darwin") {
    return [
      { platform: "darwin", arch: "arm64" },
      { platform: "darwin", arch: "x64" },
    ];
  }
  const normalizedArch = arch === "arm64" ? "arm64" : "x64";
  return [{ platform, arch: normalizedArch }];
}

/**
 * Resolve which Node runtime archives to download.
 * argv: CLI args after node/script (e.g. ["darwin-arm64"]).
 */
function resolveNodeRuntimeTargets({ argv = [], env = {}, platform, arch } = {}) {
  if (argv.length > 0) {
    return argv.map((a) => {
      const [targetPlatform, targetArch] = a.split("-");
      return { platform: targetPlatform, arch: targetArch };
    });
  }
  if (env.NODETOOL_FETCH_ALL_NODE_RUNTIMES === "1") {
    return ALL_NODE_RUNTIME_TARGETS;
  }
  return hostNodeRuntimeTargets(platform, arch);
}

/** Node executable filename for a platform. */
function nodeBinaryName(platform) {
  return platform === "win32" ? "node.exe" : "node";
}

/**
 * nodejs.org distribution archive for a build target.
 * platform: "darwin" | "win32" | "linux"; arch: "arm64" | "x64".
 */
function nodeArchive(platform, arch) {
  const plat = platform === "win32" ? "win" : platform; // darwin | linux | win
  const ext = platform === "win32" ? "zip" : "tar.gz";
  const dir = `node-v${NODE_RUNTIME_VERSION}-${plat}-${arch}`;
  const binaryInArchive =
    platform === "win32" ? `${dir}/node.exe` : `${dir}/bin/node`;
  return { dir, archive: `${dir}.${ext}`, ext, binaryInArchive, plat };
}

/**
 * Path (within an extracted node archive `dir`) to the npm package directory.
 * The official Node distributions ship npm under lib/node_modules on POSIX and
 * node_modules at the root on Windows.
 */
function npmDirInArchive(platform, dir) {
  return platform === "win32"
    ? `${dir}/node_modules/npm`
    : `${dir}/lib/node_modules/npm`;
}

// Directory name (under backend/runtime/) where the bundled npm package lives,
// and the relative path to its CLI entry. npm is invoked as
// `node <runtime>/npm/bin/npm-cli.js` so it never depends on a system npm or
// on shims/symlinks that don't survive zip extraction on Windows.
const NPM_RUNTIME_DIR = "npm";
const NPM_CLI_RUNTIME_PATH = path.join(NPM_RUNTIME_DIR, "bin", "npm-cli.js");

// Every binary the `webgpu` package ships in dist/. After staging we keep only
// the ones for the build's platform (see dawnKeepFiles) and delete the rest.
const ALL_DAWN_FILES = [
  "darwin-universal.dawn.node",
  "linux-x64.dawn.node",
  "linux-arm64.dawn.node",
  "win32-x64.dawn.node",
  "d3dcompiler_47.dll",
];

/** dawn.node (and sidecar) files to KEEP for a target; others are pruned. */
function dawnKeepFiles(platform, arch) {
  if (platform === "darwin") return ["darwin-universal.dawn.node"];
  if (platform === "win32") return ["win32-x64.dawn.node", "d3dcompiler_47.dll"];
  if (platform === "linux") return [`linux-${arch}.dawn.node`];
  return [];
}

module.exports = {
  NODE_RUNTIME_VERSION,
  ALL_NODE_RUNTIME_TARGETS,
  hostNodeRuntimeTargets,
  resolveNodeRuntimeTargets,
  nodeBinaryName,
  nodeArchive,
  npmDirInArchive,
  NPM_RUNTIME_DIR,
  NPM_CLI_RUNTIME_PATH,
  ALL_DAWN_FILES,
  dawnKeepFiles,
};
