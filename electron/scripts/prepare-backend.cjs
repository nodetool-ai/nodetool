/**
 * Prepares a self-contained backend bundle for the Electron app.
 *
 * The bundle lives under backend/modules/node_modules so electron-builder will
 * keep the directory tree and Node can use its normal module resolution in the
 * packaged app.
 */

const fs = require("fs");
const fsp = fs.promises;
const Module = require("module");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const ROOT_NODE_MODULES_DIR = path.join(ROOT_DIR, "node_modules");
const ELECTRON_DIR = path.resolve(__dirname, "..");
const BUNDLE_DIR = path.join(ELECTRON_DIR, "backend-bundle");
const BUNDLE_MODULES_DIR = path.join(BUNDLE_DIR, "modules");
const BUNDLE_NODE_MODULES_DIR = path.join(BUNDLE_MODULES_DIR, "node_modules");
const PACKAGES_DIR = path.join(ROOT_DIR, "packages");
const WORKSPACE_SCOPE = "@nodetool/";
const ENTRY_PACKAGE = "@nodetool/websocket";

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, "utf8"));
}

async function copyDir(src, dest, { excludeNodeModules = false } = {}) {
  await fsp.cp(src, dest, {
    recursive: true,
    force: true,
    preserveTimestamps: true,
    filter: (source) => {
      if (!excludeNodeModules) {
        return true;
      }
      return path.basename(source) !== "node_modules";
    },
  });
}

async function loadWorkspacePackages() {
  const packageDirs = (await fsp.readdir(PACKAGES_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const packageMap = new Map();

  for (const packageDir of packageDirs) {
    const pkgPath = path.join(PACKAGES_DIR, packageDir);
    const pkgJsonPath = path.join(pkgPath, "package.json");

    if (!fs.existsSync(pkgJsonPath)) {
      continue;
    }

    const pkgJson = await readJson(pkgJsonPath);
    const scopedName = pkgJson.name;
    if (!scopedName || !scopedName.startsWith(WORKSPACE_SCOPE)) {
      continue;
    }

    packageMap.set(scopedName, {
      scopedName,
      shortName: scopedName.slice(WORKSPACE_SCOPE.length),
      pkgPath,
      pkgJson,
    });
  }

  return packageMap;
}

function getRuntimeDependencies(pkgJson) {
  return {
    ...(pkgJson.dependencies ?? {}),
    ...(pkgJson.optionalDependencies ?? {}),
  };
}

function collectReachableWorkspacePackages(packageMap, entryPackageName) {
  const reachable = [];
  const seen = new Set();
  const stack = [entryPackageName];

  while (stack.length > 0) {
    const packageName = stack.pop();
    if (!packageName || seen.has(packageName)) {
      continue;
    }

    const packageInfo = packageMap.get(packageName);
    if (!packageInfo) {
      throw new Error(`Missing workspace package ${packageName}`);
    }

    seen.add(packageName);
    reachable.push(packageInfo);

    for (const dependencyName of Object.keys(getRuntimeDependencies(packageInfo.pkgJson))) {
      if (dependencyName.startsWith(WORKSPACE_SCOPE)) {
        stack.push(dependencyName);
      }
    }
  }

  return reachable;
}

function resolveInstalledDependency(fromDir, bundleDir, dependencyName) {
  const sourceSearchPaths = Module._nodeModulePaths(fromDir);
  const bundleSearchPaths = Module._nodeModulePaths(bundleDir);

  for (let index = 0; index < sourceSearchPaths.length; index += 1) {
    const candidate = path.join(
      sourceSearchPaths[index],
      dependencyName,
      "package.json"
    );
    if (fs.existsSync(candidate)) {
      const bundleNodeModulesPath = bundleSearchPaths[index];
      if (!bundleNodeModulesPath) {
        throw new Error(
          `No bundle node_modules path available for ${dependencyName} from ${bundleDir}`
        );
      }

      return {
        packageRoot: path.dirname(candidate),
        bundleRoot: path.join(bundleNodeModulesPath, dependencyName),
      };
    }
  }

  return null;
}

async function copyWorkspacePackage(packageInfo) {
  const destDir = path.join(BUNDLE_NODE_MODULES_DIR, packageInfo.scopedName);
  const distPath = path.join(packageInfo.pkgPath, "dist");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Workspace package ${packageInfo.scopedName} has no dist directory. Run npm run build:packages first.`
    );
  }

  await fsp.mkdir(destDir, { recursive: true });
  await copyDir(distPath, path.join(destDir, "dist"));
  await fsp.copyFile(
    path.join(packageInfo.pkgPath, "package.json"),
    path.join(destDir, "package.json")
  );

  return destDir;
}

async function collectThirdPartyPackages(workspacePackages) {
  const packagesToCopy = new Map();
  const processed = new Set();
  const queue = [];

  function enqueueDependencies(packageRoot, bundleRoot, pkgJson) {
    for (const [dependencyName] of Object.entries(getRuntimeDependencies(pkgJson))) {
      if (dependencyName.startsWith(WORKSPACE_SCOPE)) {
        continue;
      }

      const dependency = resolveInstalledDependency(
        packageRoot,
        bundleRoot,
        dependencyName
      );
      const isOptional = Boolean(pkgJson.optionalDependencies?.[dependencyName]);

      if (!dependency) {
        if (isOptional) {
          console.warn(`  Warning: optional dependency ${dependencyName} was not installed`);
          continue;
        }
        throw new Error(
          `Could not resolve dependency ${dependencyName} from ${packageRoot}`
        );
      }

      const bundleKey = path.relative(BUNDLE_DIR, dependency.bundleRoot);
      if (processed.has(bundleKey)) {
        continue;
      }

      processed.add(bundleKey);
      packagesToCopy.set(bundleKey, dependency);
      queue.push(dependency);
    }
  }

  for (const workspacePackage of workspacePackages) {
    enqueueDependencies(
      workspacePackage.pkgPath,
      workspacePackage.bundleRoot,
      workspacePackage.pkgJson
    );
  }

  while (queue.length > 0) {
    const current = queue.shift();
    const pkgJsonPath = path.join(current.packageRoot, "package.json");
    const pkgJson = await readJson(pkgJsonPath);
    enqueueDependencies(current.packageRoot, current.bundleRoot, pkgJson);
  }

  return packagesToCopy;
}

async function main() {
  console.log("Preparing backend bundle for Electron...\n");

  if (!fs.existsSync(ROOT_NODE_MODULES_DIR)) {
    throw new Error("Root node_modules directory not found. Run npm ci first.");
  }

  if (fs.existsSync(BUNDLE_DIR)) {
    console.log("Cleaning previous bundle...");
    await fsp.rm(BUNDLE_DIR, { recursive: true, force: true });
  }
  await fsp.mkdir(BUNDLE_NODE_MODULES_DIR, { recursive: true });

  const workspacePackages = await loadWorkspacePackages();
  const reachableWorkspacePackages = collectReachableWorkspacePackages(
    workspacePackages,
    ENTRY_PACKAGE
  );

  console.log(`Copying ${reachableWorkspacePackages.length} workspace packages...`);
  for (const packageInfo of reachableWorkspacePackages) {
    packageInfo.bundleRoot = await copyWorkspacePackage(packageInfo);
    console.log(`  Copied ${packageInfo.scopedName}`);
  }

  const thirdPartyPackages = await collectThirdPartyPackages(
    reachableWorkspacePackages
  );

  console.log(`\nCopying ${thirdPartyPackages.size} third-party packages...`);
  for (const dependency of thirdPartyPackages.values()) {
    await copyDir(
      dependency.packageRoot,
      dependency.bundleRoot,
      { excludeNodeModules: true }
    );
  }

  console.log("\nBackend bundle prepared successfully!");
  console.log(`  Location: ${BUNDLE_DIR}`);
  console.log(
    "  Entry:    modules/node_modules/@nodetool/websocket/dist/server.js"
  );
}

main().catch((err) => {
  console.error("Failed to prepare backend bundle:", err);
  process.exit(1);
});
