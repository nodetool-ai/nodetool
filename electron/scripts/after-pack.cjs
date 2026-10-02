const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const yaml = require("js-yaml");

const {
  NODE_RUNTIME_VERSION,
  nodeBinaryName,
  NPM_RUNTIME_DIR,
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

function firstPublishConfig(context) {
  const publish = context?.packager?.config?.publish;
  const configs = Array.isArray(publish) ? publish : publish ? [publish] : [];
  return configs.find((entry) => entry && typeof entry === "object") ?? null;
}

async function ensureAppUpdateConfig(context) {
  const publishConfig = firstPublishConfig(context);
  if (!publishConfig) {
    throw new Error("Cannot write app-update.yml: electron-builder publish config is missing");
  }

  const resourcesDir = resolveResourcesDir(context);
  const appUpdateConfigPath = path.join(resourcesDir, "app-update.yml");
  // Must match the runtime updater's cache dir (electron/src/updater.ts) so
  // electron-updater reads and writes the same directory. Do NOT derive this
  // from appInfo.updaterCacheDirName: electron-builder defaults it to
  // "<package name>-updater" → "nodetool-electron-updater", which diverges from
  // the runtime value and fails the release verify gate.
  const config = {
    ...publishConfig,
    updaterCacheDirName: "nodetool-updater",
  };

  await fsp.mkdir(resourcesDir, { recursive: true });
  await fsp.writeFile(appUpdateConfigPath, yaml.dump(config), "utf8");
  console.info(`Wrote app update config to ${appUpdateConfigPath}`);
}

/** Copy the build target's bundled Node binary + npm into backend/runtime/. */
async function placeNodeRuntime(context, cacheRoot) {
  const platform = context.electronPlatformName;
  const arch = resolveArch(context);
  const binName = nodeBinaryName(platform);
  const srcDir = path.join(cacheRoot, `${platform}-${arch}`);
  const src = path.join(srcDir, binName);
  const srcNpm = path.join(srcDir, NPM_RUNTIME_DIR);
  if (!fs.existsSync(src) || !fs.existsSync(srcNpm)) {
    // Self-heal: the release pipeline invokes electron-builder directly (not
    // `npm run build`), so the fetch step may not have run. Fetch this exact
    // target now — fetch-node-runtime is idempotent and caches by arch.
    console.info(`Bundled Node/npm missing; fetching ${platform}-${arch}...`);
    const fetchScript = path.join(ELECTRON_DIR, "scripts", "fetch-node-runtime.mjs");
    const r = spawnSync(process.execPath, [fetchScript, `${platform}-${arch}`], {
      stdio: "inherit",
    });
    if (r.status !== 0 || !fs.existsSync(src) || !fs.existsSync(srcNpm)) {
      throw new Error(
        `Bundled Node runtime not found and fetch failed: ${srcDir} (fetch exit ${r.status})`
      );
    }
  }
  const runtimeDir = path.join(resolveResourcesDir(context), "backend", "runtime");
  await fsp.mkdir(runtimeDir, { recursive: true });

  const dest = path.join(runtimeDir, binName);
  await fsp.copyFile(src, dest);
  if (platform !== "win32") await fsp.chmod(dest, 0o755);

  const destNpm = path.join(runtimeDir, NPM_RUNTIME_DIR);
  await fsp.rm(destNpm, { recursive: true, force: true });
  await fsp.cp(srcNpm, destNpm, { recursive: true });

  console.info(`Placed bundled Node + npm (${platform}-${arch}) at ${runtimeDir}`);
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

/**
 * Delete node-web-audio-api prebuilds for other darwin arches. The macOS
 * backend bundle is staged once and packed into both the arm64 and x64 apps,
 * so bundle-backend.mjs keeps every darwin prebuild for this step to trim.
 */
function pruneWebAudioPrebuilds(backendDir, platform, arch) {
  if (platform !== "darwin") return;
  const pkgDir = path.join(backendDir, "node_modules", "node-web-audio-api");
  if (!fs.existsSync(pkgDir)) return;
  const binRe = /^node-web-audio-api\.darwin-([^-.]+)/;
  for (const file of fs.readdirSync(pkgDir)) {
    const match = file.match(binRe);
    if (match && match[1] !== arch) {
      fs.rmSync(path.join(pkgDir, file), { force: true });
    }
  }
}

/** Read a staged package.json, or null when the directory has none. */
function readPackageJson(pkgDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

/** Every top-level and scoped package directory under node_modules. */
function listStagedPackages(nodeModulesPath) {
  const packages = [];
  if (!fs.existsSync(nodeModulesPath)) return packages;
  for (const entry of fs.readdirSync(nodeModulesPath, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("@")) {
      const scopeDir = path.join(nodeModulesPath, entry.name);
      for (const sub of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        if (!sub.isDirectory()) continue;
        packages.push({ name: `${entry.name}/${sub.name}`, dir: path.join(scopeDir, sub.name) });
      }
      continue;
    }
    packages.push({ name: entry.name, dir: path.join(nodeModulesPath, entry.name) });
  }
  return packages;
}

/** Download `<name>@<version>` from the registry and unpack it into destDir. */
function fetchRegistryPackage(name, version, destDir) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-retarget-"));
  try {
    const pack = spawnSync(
      "npm",
      ["pack", `${name}@${version}`, "--pack-destination", tmpDir, "--json"],
      { encoding: "utf8", shell: process.platform === "win32" }
    );
    if (pack.status !== 0) {
      throw new Error(`npm pack ${name}@${version} failed: ${pack.stderr}`);
    }
    const [{ filename }] = JSON.parse(pack.stdout);
    const extract = spawnSync("tar", ["-xzf", path.join(tmpDir, filename), "-C", tmpDir], {
      stdio: "inherit",
    });
    if (extract.status !== 0) {
      throw new Error(`Extracting ${filename} failed (exit ${extract.status})`);
    }
    fs.mkdirSync(path.dirname(destDir), { recursive: true });
    fs.cpSync(path.join(tmpDir, "package"), destDir, { recursive: true });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** npm `os`/`cpu` semantics: positive entries allow-list, `!x` entries deny. */
function npmFieldAdmits(list, value) {
  if (!Array.isArray(list) || list.length === 0) return true;
  if (list.includes(`!${value}`)) return false;
  const allowed = list.filter((entry) => !entry.startsWith("!"));
  return allowed.length === 0 || allowed.includes(value);
}

/**
 * Swap per-arch prebuilt packages staged for another CPU with the build
 * target's counterpart. npm installs only the host's optionalDependencies, and
 * the macOS release job stages one backend on an arm64 runner for both the
 * arm64 and x64 apps, so @napi-rs/canvas-darwin-arm64, @img/sharp-darwin-arm64
 * and the like would otherwise ship in the x64 app.
 *
 * A package is foreign when its `os` admits the target platform and its `cpu`
 * excludes the target arch. Its counterpart is the same name with the arch
 * token replaced, which must be an optionalDependency of a staged package.
 * The counterpart is fetched at the foreign package's version because these
 * per-arch packages are published in lockstep.
 */
function retargetPlatformPackages(
  nodeModulesPath,
  platform,
  arch,
  fetchPackage = fetchRegistryPackage
) {
  const staged = listStagedPackages(nodeModulesPath).map((pkg) => ({
    ...pkg,
    json: readPackageJson(pkg.dir),
  }));
  const optionalNames = new Set();
  for (const pkg of staged) {
    for (const dep of Object.keys(pkg.json?.optionalDependencies ?? {})) {
      optionalNames.add(dep);
    }
  }

  const swapped = [];
  for (const pkg of staged) {
    const cpu = pkg.json?.cpu;
    if (!Array.isArray(cpu) || npmFieldAdmits(cpu, arch)) continue;
    if (!npmFieldAdmits(pkg.json.os, platform)) continue;

    const counterpart = cpu
      .map((fromArch) => pkg.name.replace(`-${platform}-${fromArch}`, `-${platform}-${arch}`))
      .find((name) => name !== pkg.name && optionalNames.has(name));
    if (!counterpart) {
      throw new Error(
        `${pkg.name} is built for ${cpu.join("/")}, not ${arch}, and no ` +
          `${platform}-${arch} counterpart is declared by a staged package`
      );
    }

    const destDir = path.join(nodeModulesPath, ...counterpart.split("/"));
    if (!fs.existsSync(destDir)) {
      console.info(`Fetching ${counterpart}@${pkg.json.version} for ${platform}-${arch}`);
      fetchPackage(counterpart, pkg.json.version, destDir);
    }
    const fetched = readPackageJson(destDir);
    if (!Array.isArray(fetched?.cpu) || !npmFieldAdmits(fetched.cpu, arch)) {
      throw new Error(`${counterpart} does not declare cpu ${arch}`);
    }
    fs.rmSync(pkg.dir, { recursive: true, force: true });
    swapped.push({ from: pkg.name, to: counterpart });
  }
  return swapped;
}

// Mach-O CPU types for the arches the macOS app ships.
const MACH_O_CPU_TYPES = { x64: 0x01000007, arm64: 0x0100000c };
const MACH_O_MAGIC_64 = 0xfeedfacf;

/**
 * CPU arch of a thin 64-bit Mach-O file, or null for anything else (fat
 * binaries, ELF, PE). Used to spot node-gyp builds compiled for the host.
 */
function machOArch(filePath) {
  const header = Buffer.alloc(8);
  const fd = fs.openSync(filePath, "r");
  try {
    if (fs.readSync(fd, header, 0, 8, 0) < 8) return null;
  } finally {
    fs.closeSync(fd);
  }
  if (header.readUInt32LE(0) !== MACH_O_MAGIC_64) return null;
  const cpuType = header.readUInt32LE(4);
  return (
    Object.keys(MACH_O_CPU_TYPES).find((a) => MACH_O_CPU_TYPES[a] === cpuType) ?? null
  );
}

/**
 * Names of native modules whose build/Release/*.node is a Mach-O for another
 * arch, e.g. keytar and cpu-features compiled on the arm64 release runner.
 */
function findForeignArchModules(nodeModulesPath, arch) {
  return findNativeModuleNames(nodeModulesPath).filter((name) => {
    const releaseDir = path.join(nodeModulesPath, ...name.split("/"), "build", "Release");
    if (!fs.existsSync(releaseDir)) return false;
    return fs.readdirSync(releaseDir).some((file) => {
      if (!file.endsWith(".node")) return false;
      const found = machOArch(path.join(releaseDir, file));
      return found !== null && found !== arch;
    });
  });
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
  const toRebuild = [
    ...found.filter((n) => V8_LOCKED_MODULES.has(n)),
    ...findForeignArchModules(runtimeNodeModulesPath, arch).filter(
      (n) => !V8_LOCKED_MODULES.has(n)
    ),
  ];

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
    await ensureAppUpdateConfig(context);
    await promoteBackendNodeModules(context);
    await placeNodeRuntime(
      context,
      path.join(ELECTRON_DIR, ".node-runtime", NODE_RUNTIME_VERSION)
    );
    const backendDir = path.join(resolveResourcesDir(context), "backend");
    const platform = context.electronPlatformName;
    const arch = resolveArch(context);
    pruneDawnBinaries(backendDir, platform, arch);
    pruneWebAudioPrebuilds(backendDir, platform, arch);
    const swapped = retargetPlatformPackages(
      path.join(backendDir, "node_modules"),
      platform,
      arch
    );
    for (const { from, to } of swapped) {
      console.info(`Replaced ${from} with ${to}`);
    }
    await rebuildNativeModulesForBackend(context);
  } catch (error) {
    console.error("afterPack failed", error);
    throw error;
  }
};

module.exports.promoteBackendNodeModules = promoteBackendNodeModules;
module.exports.resolveResourcesDir = resolveResourcesDir;
module.exports.findNativeModuleNames = findNativeModuleNames;
module.exports.ensureAppUpdateConfig = ensureAppUpdateConfig;
module.exports.placeNodeRuntime = placeNodeRuntime;
module.exports.pruneDawnBinaries = pruneDawnBinaries;
module.exports.pruneWebAudioPrebuilds = pruneWebAudioPrebuilds;
module.exports.retargetPlatformPackages = retargetPlatformPackages;
module.exports.machOArch = machOArch;
module.exports.findForeignArchModules = findForeignArchModules;
