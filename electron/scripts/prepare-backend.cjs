/**
 * Prepares a self-contained backend bundle for the Electron app.
 *
 * This script:
 * 1. Aggregates third-party production dependencies from all workspace packages.
 * 2. Runs `npm install --omit=dev` to fetch them.
 * 3. Copies all workspace packages (dist/ + package.json) into the bundle.
 * 4. Renames node_modules to "modules" to avoid electron-builder filtering.
 *
 * At runtime, NODE_PATH is set to the "modules" directory so that
 * Node.js module resolution works as normal.
 */

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { execSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const ELECTRON_DIR = path.resolve(__dirname, "..");
const BUNDLE_DIR = path.join(ELECTRON_DIR, "backend-bundle");
const PACKAGES_DIR = path.join(ROOT_DIR, "packages");

async function copyDir(src, dest) {
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fsp.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Scans all workspace packages and returns:
 * - packageInfos: array of { scopedName, shortName, pkgPath, pkgJson }
 * - allDeps: aggregated third-party dependencies
 */
async function scanWorkspacePackages() {
  const packageDirs = (await fsp.readdir(PACKAGES_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const allDeps = {};
  const packageInfos = [];

  for (const pkgDir of packageDirs) {
    const pkgPath = path.join(PACKAGES_DIR, pkgDir);
    const pkgJsonPath = path.join(pkgPath, "package.json");

    if (!fs.existsSync(pkgJsonPath)) continue;

    const pkgJson = JSON.parse(await fsp.readFile(pkgJsonPath, "utf8"));
    const scopedName = pkgJson.name;

    if (!scopedName || !scopedName.startsWith("@nodetool/")) continue;

    const shortName = scopedName.replace("@nodetool/", "");
    packageInfos.push({ scopedName, shortName, pkgPath, pkgJson });

    // Collect third-party dependencies
    if (pkgJson.dependencies) {
      for (const [dep, version] of Object.entries(pkgJson.dependencies)) {
        if (dep.startsWith("@nodetool/")) continue;
        if (version === "*") continue;
        if (!allDeps[dep] || allDeps[dep] === "*") {
          allDeps[dep] = version;
        }
      }
    }
  }

  return { packageInfos, allDeps };
}

async function main() {
  console.log("Preparing backend bundle for Electron...\n");

  // Clean previous bundle
  if (fs.existsSync(BUNDLE_DIR)) {
    console.log("Cleaning previous bundle...");
    await fsp.rm(BUNDLE_DIR, { recursive: true });
  }
  await fsp.mkdir(BUNDLE_DIR, { recursive: true });

  // Step 1: Scan packages and collect deps
  const { packageInfos, allDeps } = await scanWorkspacePackages();

  // Step 2: Install third-party dependencies
  const bundlePackageJson = {
    name: "nodetool-backend-bundle",
    version: "1.0.0",
    private: true,
    dependencies: allDeps,
  };

  const bundlePkgPath = path.join(BUNDLE_DIR, "package.json");
  await fsp.writeFile(
    bundlePkgPath,
    JSON.stringify(bundlePackageJson, null, 2)
  );

  console.log(
    `Installing ${Object.keys(allDeps).length} third-party dependencies...`
  );
  execSync("npm install --omit=dev", {
    cwd: BUNDLE_DIR,
    stdio: "inherit",
  });

  // Step 3: Copy workspace packages into node_modules/@nodetool/
  const nodetoolDir = path.join(BUNDLE_DIR, "node_modules", "@nodetool");
  await fsp.mkdir(nodetoolDir, { recursive: true });

  let copiedCount = 0;
  for (const { scopedName, shortName, pkgPath } of packageInfos) {
    const destDir = path.join(nodetoolDir, shortName);
    await fsp.mkdir(destDir, { recursive: true });

    // Copy dist/
    const distPath = path.join(pkgPath, "dist");
    if (fs.existsSync(distPath)) {
      await copyDir(distPath, path.join(destDir, "dist"));
      console.log(`  Copied ${scopedName}`);
      copiedCount++;
    } else {
      console.warn(`  Warning: ${scopedName} has no dist/ directory`);
    }

    // Copy package.json (needed for ESM "type" field and "exports")
    await fsp.copyFile(
      path.join(pkgPath, "package.json"),
      path.join(destDir, "package.json")
    );
  }

  console.log(`\nCopied ${copiedCount} workspace packages.`);

  // Step 4: Rename node_modules → modules
  // electron-builder filters out "node_modules" from extraResources
  const nodeModulesPath = path.join(BUNDLE_DIR, "node_modules");
  const modulesPath = path.join(BUNDLE_DIR, "modules");
  await fsp.rename(nodeModulesPath, modulesPath);

  // Clean up build artifacts
  for (const f of ["package.json", "package-lock.json"]) {
    try {
      await fsp.unlink(path.join(BUNDLE_DIR, f));
    } catch {
      // ignore
    }
  }

  console.log("\nBackend bundle prepared successfully!");
  console.log(`  Location: ${BUNDLE_DIR}`);
  console.log(`  Entry:    modules/@nodetool/websocket/dist/server.js`);
}

main().catch((err) => {
  console.error("Failed to prepare backend bundle:", err);
  process.exit(1);
});
