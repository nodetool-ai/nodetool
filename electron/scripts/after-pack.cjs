const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

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
// binding.gyp (i.e. need a node-gyp rebuild against Electron's ABI).
// @electron/rebuild's default discovery walks `dependencies` listed in
// buildPath/package.json, but the backend bundle's package.json only
// declares `{ "type": "module" }` with no deps, so without an explicit
// list the rebuild would silently skip everything and leave the workspace's
// system-Node ABI binaries in place.
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

async function rebuildNativeModulesForElectron(context) {
  const { rebuild } = require("@electron/rebuild");
  const resourcesDir = resolveResourcesDir(context);
  const backendDir = path.join(resourcesDir, "backend");
  const electronVersion = context.packager.config.electronVersion
    ?? context.packager.electronVersion
    ?? require("electron/package.json").version;
  const arch = typeof context.arch === "string" ? context.arch : ["ia32","x64","armv7l","arm64","universal"][context.arch] ?? "x64";

  const runtimeNodeModulesPath = path.join(backendDir, "node_modules");
  const onlyModules = findNativeModuleNames(runtimeNodeModulesPath);

  if (onlyModules.length === 0) {
    throw new Error(
      `No native modules found to rebuild in ${runtimeNodeModulesPath}. ` +
      `Expected at least better-sqlite3. Did bundle-backend.mjs stage modules correctly?`
    );
  }

  console.info(
    `Rebuilding ${onlyModules.length} native backend module(s) for Electron ${electronVersion} (${arch}): ${onlyModules.join(", ")}`
  );

  await rebuild({
    buildPath: backendDir,
    electronVersion,
    arch,
    force: true,
    onlyModules,
  });

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
