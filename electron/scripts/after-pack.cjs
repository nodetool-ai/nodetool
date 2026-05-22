const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { spawnSync } = require("child_process");

const {
  NODE_RUNTIME_VERSION,
  nodeBinaryName,
  ALL_DAWN_FILES,
  dawnKeepFiles,
} = require("./node-runtime.constants.cjs");

function resolveResourcesDir(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName === "darwin") {
    const appName = `${packager.appInfo.productFilename}.app`;
    return path.join(appOutDir, appName, "Contents", "Resources");
  }

  return path.join(appOutDir, "resources");
}

async function promoteBackendNodeModules(context) {
  const resourcesDir = resolveResourcesDir(context);
  const backendDir = path.join(resourcesDir, "backend");
  const stagedModulesPath = path.join(backendDir, "_modules");
  const runtimeNodeModulesPath = path.join(backendDir, "node_modules");

  try {
    await fsp.access(stagedModulesPath);
  } catch {
    console.warn(`No staged backend modules found at ${stagedModulesPath}`);
    return;
  }

  try {
    await fsp.access(runtimeNodeModulesPath);
    console.info(`backend/node_modules already present at ${runtimeNodeModulesPath}`);
    return;
  } catch {
    // Continue to promote the staged modules directory.
  }

  // Retry the rename — Windows may hold a handle briefly after signtool signs
  // executables inside _modules (e.g. ssh2/util/pagent.exe).
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fsp.rename(stagedModulesPath, runtimeNodeModulesPath);
      console.info(`Promoted backend modules to ${runtimeNodeModulesPath}`);
      return;
    } catch (err) {
      if (err.code !== "EPERM" || attempt === maxAttempts) throw err;
      console.warn(`Rename attempt ${attempt} failed (EPERM), retrying in ${attempt * 500}ms...`);
      await new Promise((r) => setTimeout(r, attempt * 500));
    }
  }
}

// Packages that must never be rebuilt even if they leak into the staged tree.
// These are loaded optionally at runtime with a try/catch fallback; rebuilding
// them couples our packaging to system libs (e.g. Cairo for `canvas`) we don't
// actually need.
const REBUILD_BLOCKLIST = new Set(["canvas"]);

// Walk the staged node_modules and collect names of packages that contain a
// binding.gyp (i.e. need a node-gyp rebuild against Electron's ABI). We
// discover from the staged tree directly — the backend bundle's package.json
// only declares { "type": "module" } with no deps, so any dependency-walking
// rebuilder would otherwise miss everything.
function findNativeModuleNames(nodeModulesPath) {
  const names = [];
  if (!fs.existsSync(nodeModulesPath)) return names;

  const hasBindingGyp = (pkgPath) =>
    fs.existsSync(path.join(pkgPath, "binding.gyp"));

  for (const entry of fs.readdirSync(nodeModulesPath, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("@")) {
      const scopeDir = path.join(nodeModulesPath, entry.name);
      for (const sub of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        if (!sub.isDirectory()) continue;
        const fullName = `${entry.name}/${sub.name}`;
        if (REBUILD_BLOCKLIST.has(fullName)) continue;
        const pkgPath = path.join(scopeDir, sub.name);
        if (hasBindingGyp(pkgPath)) {
          names.push(fullName);
        }
      }
      continue;
    }
    if (REBUILD_BLOCKLIST.has(entry.name)) continue;
    const pkgPath = path.join(nodeModulesPath, entry.name);
    if (hasBindingGyp(pkgPath)) {
      names.push(entry.name);
    }
  }
  return names;
}

function resolveArch(context) {
  if (typeof context.arch === "string") return context.arch;
  return ["ia32", "x64", "armv7l", "arm64", "universal"][context.arch] ?? "x64";
}

const ELECTRON_DIR = path.dirname(__dirname);

/** Copy the build target's bundled Node binary into backend/runtime/. */
async function placeNodeRuntime(context, cacheRoot) {
  const platform = context.electronPlatformName;
  const arch = resolveArch(context);
  const binName = nodeBinaryName(platform);
  const src = path.join(cacheRoot, `${platform}-${arch}`, binName);
  if (!fs.existsSync(src)) {
    // Self-heal: the release pipeline invokes electron-builder directly (not
    // `npm run build`), so the fetch step may not have run. Fetch this exact
    // target now — fetch-node-runtime is idempotent and caches by arch.
    console.info(`Bundled Node missing; fetching ${platform}-${arch}...`);
    const fetchScript = path.join(ELECTRON_DIR, "scripts", "fetch-node-runtime.mjs");
    const r = spawnSync(process.execPath, [fetchScript, `${platform}-${arch}`], {
      stdio: "inherit",
    });
    if (r.status !== 0 || !fs.existsSync(src)) {
      throw new Error(
        `Bundled Node binary not found and fetch failed: ${src} (fetch exit ${r.status})`
      );
    }
  }
  const runtimeDir = path.join(resolveResourcesDir(context), "backend", "runtime");
  await fsp.mkdir(runtimeDir, { recursive: true });
  const dest = path.join(runtimeDir, binName);
  await fsp.copyFile(src, dest);
  if (platform !== "win32") await fsp.chmod(dest, 0o755);
  console.info(`Placed bundled Node (${platform}-${arch}) at ${dest}`);
}

/** Delete dawn.node binaries that don't belong to this build's platform. */
function pruneDawnBinaries(backendDir, platform, arch) {
  const dist = path.join(backendDir, "node_modules", "webgpu", "dist");
  if (!fs.existsSync(dist)) return;
  const keep = new Set(dawnKeepFiles(platform, arch));
  for (const f of ALL_DAWN_FILES) {
    if (keep.has(f)) continue;
    const p = path.join(dist, f);
    if (fs.existsSync(p)) fs.rmSync(p, { force: true });
  }
}

// Invoke `node-gyp rebuild` directly against the bundled Node's headers.
// We resolve node-gyp's bin script via require.resolve and run it through the
// current Node interpreter, which sidesteps PATH/npx surprises when the
// module being rebuilt lives deep inside the packaged app's resources tree.
function nodeGypRebuild(modulePath, nodeVersion, arch) {
  const nodeGypBin = require.resolve("node-gyp/bin/node-gyp.js");
  const result = spawnSync(
    process.execPath,
    [
      nodeGypBin,
      "rebuild",
      "--release",
      `--target=${nodeVersion}`,
      `--arch=${arch}`,
    ],
    { cwd: modulePath, stdio: "inherit" }
  );
  if (result.status !== 0) {
    throw new Error(
      `node-gyp rebuild failed for ${modulePath} (exit ${result.status})`
    );
  }
}

// Only V8/NAN-locked modules need a rebuild to match the bundled Node's ABI.
// N-API modules (sharp, dawn.node, bufferutil, keytar, msgpackr-extract,
// onnxruntime-node) are ABI-stable across Node versions and must NOT be rebuilt.
const V8_LOCKED_MODULES = new Set(["better-sqlite3"]);

async function rebuildNativeModulesForBackend(context) {
  const backendDir = path.join(resolveResourcesDir(context), "backend");
  const arch = resolveArch(context);
  const runtimeNodeModulesPath = path.join(backendDir, "node_modules");
  const found = findNativeModuleNames(runtimeNodeModulesPath);
  const toRebuild = found.filter((n) => V8_LOCKED_MODULES.has(n));

  if (!toRebuild.includes("better-sqlite3")) {
    throw new Error(
      `better-sqlite3 not found in ${runtimeNodeModulesPath}. ` +
      `Did bundle-backend.mjs stage modules correctly?`
    );
  }

  console.info(
    `Rebuilding ${toRebuild.join(", ")} for Node ${NODE_RUNTIME_VERSION} (${arch})`
  );
  for (const name of toRebuild) {
    nodeGypRebuild(path.join(runtimeNodeModulesPath, name), NODE_RUNTIME_VERSION, arch);
  }
  console.info("Native backend module rebuild complete.");
}

module.exports = async function afterPack(context) {
  try {
    await promoteBackendNodeModules(context);
    await placeNodeRuntime(
      context,
      path.join(ELECTRON_DIR, ".node-runtime", NODE_RUNTIME_VERSION)
    );
    pruneDawnBinaries(
      path.join(resolveResourcesDir(context), "backend"),
      context.electronPlatformName,
      resolveArch(context)
    );
    await rebuildNativeModulesForBackend(context);
  } catch (error) {
    console.error("afterPack failed", error);
    throw error;
  }
};

module.exports.promoteBackendNodeModules = promoteBackendNodeModules;
module.exports.resolveResourcesDir = resolveResourcesDir;
module.exports.findNativeModuleNames = findNativeModuleNames;
module.exports.placeNodeRuntime = placeNodeRuntime;
module.exports.pruneDawnBinaries = pruneDawnBinaries;
