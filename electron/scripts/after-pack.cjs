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

async function rebuildNativeModulesForElectron(context) {
  const { rebuild } = require("@electron/rebuild");
  const resourcesDir = resolveResourcesDir(context);
  const backendDir = path.join(resourcesDir, "backend");
  const electronVersion = context.packager.config.electronVersion
    ?? context.packager.electronVersion
    ?? require("electron/package.json").version;
  const arch = typeof context.arch === "string" ? context.arch : ["ia32","x64","armv7l","arm64","universal"][context.arch] ?? "x64";

  console.info(`Rebuilding native backend modules for Electron ${electronVersion} (${arch})...`);

  await rebuild({
    buildPath: backendDir,
    electronVersion,
    arch,
    force: true,
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
