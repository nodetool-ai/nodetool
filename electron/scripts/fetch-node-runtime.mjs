// electron/scripts/fetch-node-runtime.mjs
// Download + checksum-verify per-arch Node binaries for bundling into the
// packaged backend. Idempotent: skips a target whose cached binary already
// exists. Extraction uses platform tools available on each CI runner (tar for
// .tar.gz, PowerShell Expand-Archive for .zip on Windows).
//
//   node scripts/fetch-node-runtime.mjs                 # host platform target(s)
//   node scripts/fetch-node-runtime.mjs darwin-arm64     # one target
//   NODETOOL_FETCH_ALL_NODE_RUNTIMES=1 node scripts/fetch-node-runtime.mjs
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  NODE_RUNTIME_VERSION,
  resolveNodeRuntimeTargets,
  nodeArchive,
  nodeBinaryName,
  npmDirInArchive,
  NPM_RUNTIME_DIR,
} = require("./node-runtime.constants.cjs");

const ELECTRON_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE_ROOT = path.join(ELECTRON_DIR, ".node-runtime", NODE_RUNTIME_VERSION);
const BASE_URL = `https://nodejs.org/dist/v${NODE_RUNTIME_VERSION}`;

function targetsFromArgs() {
  return resolveNodeRuntimeTargets({
    argv: process.argv.slice(2),
    env: process.env,
    platform: process.platform,
    arch: process.arch,
  });
}

/**
 * Extract only the node binary and npm tree from a .tar.gz archive. Skipping
 * bin/npm/npx/corepack symlinks keeps cross-platform prefetch working on Windows.
 */
function extractTarGz(archivePath, info, platform, destDir) {
  const resolvedArchive = path.resolve(archivePath);
  const resolvedDest = path.resolve(destDir);
  const members = [info.binaryInArchive, npmDirInArchive(platform, info.dir)];
  const tarArgs =
    process.platform === "win32"
      ? [
          "-xzf",
          path.basename(resolvedArchive),
          "-C",
          resolvedDest.replace(/\\/g, "/"),
          ...members,
        ]
      : ["-xzf", resolvedArchive, "-C", resolvedDest, ...members];
  const tarOpts =
    process.platform === "win32"
      ? { cwd: path.dirname(resolvedArchive), stdio: "inherit" }
      : { stdio: "inherit" };
  const r = spawnSync("tar", tarArgs, tarOpts);
  if (r.status !== 0) throw new Error("tar extraction failed");
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function expectedChecksum(shasumsText, archiveName) {
  for (const line of shasumsText.split("\n")) {
    const [hash, name] = line.trim().split(/\s+/);
    if (name === archiveName) return hash;
  }
  throw new Error(`No SHASUMS entry for ${archiveName}`);
}

function extractRuntime(archivePath, info, platform, destDir) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "node-rt-"));
  try {
    if (info.ext === "zip") {
      // Windows runner: PowerShell is available; Expand-Archive is built in.
      const r = spawnSync(
        "powershell",
        ["-NoProfile", "-Command", `Expand-Archive -Force -Path '${archivePath}' -DestinationPath '${tmp}'`],
        { stdio: "inherit" }
      );
      if (r.status !== 0) throw new Error("Expand-Archive failed");
    } else {
      extractTarGz(archivePath, info, platform, tmp);
    }
    fs.mkdirSync(destDir, { recursive: true });

    // node binary
    const destBinary = path.join(destDir, nodeBinaryName(platform));
    fs.copyFileSync(path.join(tmp, info.binaryInArchive), destBinary);
    if (info.ext !== "zip") fs.chmodSync(destBinary, 0o755);

    // npm package — bundled so JS installs never depend on a system npm.
    const destNpm = path.join(destDir, NPM_RUNTIME_DIR);
    fs.rmSync(destNpm, { recursive: true, force: true });
    fs.cpSync(path.join(tmp, npmDirInArchive(platform, info.dir)), destNpm, {
      recursive: true,
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function fetchTarget({ platform, arch }) {
  const info = nodeArchive(platform, arch);
  const destDir = path.join(CACHE_ROOT, `${platform}-${arch}`);
  const destBinary = path.join(destDir, nodeBinaryName(platform));
  const destNpm = path.join(destDir, NPM_RUNTIME_DIR);
  if (fs.existsSync(destBinary) && fs.existsSync(destNpm)) {
    console.log(`  cached: ${platform}-${arch}`);
    return;
  }
  console.log(`  fetching: ${info.archive}`);
  const [archiveBuf, shasums] = await Promise.all([
    download(`${BASE_URL}/${info.archive}`),
    download(`${BASE_URL}/SHASUMS256.txt`).then((b) => b.toString("utf8")),
  ]);
  const want = expectedChecksum(shasums, info.archive);
  const got = sha256(archiveBuf);
  if (got !== want) {
    throw new Error(`checksum mismatch for ${info.archive}: got ${got}, want ${want}`);
  }
  const archivePath = path.join(os.tmpdir(), info.archive);
  await fsp.writeFile(archivePath, archiveBuf);
  try {
    extractRuntime(archivePath, info, platform, destDir);
  } finally {
    await fsp.rm(archivePath, { force: true });
  }
  console.log(`  -> ${destBinary} (+ npm)`);
}

async function main() {
  console.log(`Fetching Node ${NODE_RUNTIME_VERSION} runtime binaries...`);
  for (const t of targetsFromArgs()) {
    await fetchTarget(t);
  }
  console.log("Node runtime fetch complete.");
}

main().catch((err) => {
  console.error("fetch-node-runtime failed:", err);
  process.exit(1);
});
