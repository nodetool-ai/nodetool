const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { spawnSync } = require("child_process");

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
        const pkgPath = path.join(scopeDir, sub.name);
        if (hasBindingGyp(pkgPath)) {
          names.push(`${entry.name}/${sub.name}`);
        }
      }
      continue;
    }
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

function resolveElectronVersion(context) {
  return (
    context.packager.config.electronVersion ??
    context.packager.electronVersion ??
    require("electron/package.json").version
  );
}

// Invoke `node-gyp rebuild` directly against Electron's headers. This matches
// what scripts/electron-dev.mjs does for the dev workflow and avoids
// @electron/rebuild's prebuild-install path, which has a tendency to
// silently leave the wrong-ABI binary in place when it can't resolve a
// matching prebuilt asset (observed for better-sqlite3 v12 + Electron 39:
// rebuild reports success but leaves the node-vNNN prebuild from npm install).
//
// We resolve node-gyp's bin script via require.resolve and run it through the
// current Node interpreter, which sidesteps PATH/npx surprises when the
// module being rebuilt lives deep inside the packaged app's resources tree.
function nodeGypRebuild(modulePath, electronVersion, arch) {
  const nodeGypBin = require.resolve("node-gyp/bin/node-gyp.js");
  const result = spawnSync(
    process.execPath,
    [
      nodeGypBin,
      "rebuild",
      `--target=${electronVersion}`,
      `--arch=${arch}`,
      "--dist-url=https://electronjs.org/headers",
    ],
    { cwd: modulePath, stdio: "inherit" }
  );
  if (result.status !== 0) {
    throw new Error(
      `node-gyp rebuild failed for ${modulePath} (exit ${result.status})`
    );
  }
}

async function rebuildNativeModulesForElectron(context) {
  const resourcesDir = resolveResourcesDir(context);
  const backendDir = path.join(resourcesDir, "backend");
  const electronVersion = resolveElectronVersion(context);
  const arch = resolveArch(context);

  const runtimeNodeModulesPath = path.join(backendDir, "node_modules");
  const moduleNames = findNativeModuleNames(runtimeNodeModulesPath);

  if (moduleNames.length === 0) {
    throw new Error(
      `No native modules found to rebuild in ${runtimeNodeModulesPath}. ` +
      `Expected at least better-sqlite3. Did bundle-backend.mjs stage modules correctly?`
    );
  }

  console.info(
    `Rebuilding ${moduleNames.length} native backend module(s) for Electron ${electronVersion} (${arch}): ${moduleNames.join(", ")}`
  );

  for (const name of moduleNames) {
    const modulePath = path.join(runtimeNodeModulesPath, name);
    console.info(`  -> ${name}`);
    nodeGypRebuild(modulePath, electronVersion, arch);
  }

  console.info("Native backend module rebuild complete.");
}

module.exports = async function afterPack(context) {
  try {
    await promoteBackendNodeModules(context);
    await rebuildNativeModulesForElectron(context);
  } catch (error) {
    console.error("afterPack failed", error);
    throw error;
  }
};

module.exports.promoteBackendNodeModules = promoteBackendNodeModules;
module.exports.resolveResourcesDir = resolveResourcesDir;
module.exports.findNativeModuleNames = findNativeModuleNames;
