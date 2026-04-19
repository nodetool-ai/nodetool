#!/usr/bin/env node
/**
 * Pre-build registry verification.
 *
 * Ensures every Python package the Electron app pins to its own version is
 * actually published on the NodeTool registry BEFORE we build/ship installers.
 *
 * The Electron installer pins `nodetool-core==<app_version>` (and any other
 * required packages) at install time. If those wheels do not exist on the
 * registry, every fresh install ends up with a stale older Python package
 * that is incompatible with the bundled JS — leading to silent failures like
 * "Python bridge failed to start: unrecognized arguments: --stdio".
 *
 * This script is wired into the `build` npm script so a release build cannot
 * complete unless all matching wheels are published.
 *
 * Skip with `SKIP_PYTHON_REGISTRY_CHECK=1` when iterating locally.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELECTRON_DIR = join(__dirname, "..");

const REGISTRY_INDEX_URL =
  "https://nodetool-ai.github.io/nodetool-registry/simple/";

/**
 * Packages whose version must match the Electron app version exactly.
 * Keep in sync with REQUIRED_PYTHON_PACKAGES in electron/src/python.ts.
 */
const REQUIRED_PACKAGES = ["nodetool-core"];

/**
 * Mirrors convertToPep440Version() in electron/src/python.ts.
 *  "0.7.0-rc.8" -> "0.7.0rc8"
 */
function convertToPep440Version(npmVersion) {
  return npmVersion.replace(/-([a-zA-Z]+)\.?(\d*)/, "$1$2");
}

function readAppVersion() {
  const pkgPath = join(ELECTRON_DIR, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (typeof pkg.version !== "string" || pkg.version.length === 0) {
    throw new Error(`Cannot read version from ${pkgPath}`);
  }
  return pkg.version;
}

async function fetchRegistryIndex(packageName) {
  const url = `${REGISTRY_INDEX_URL}${packageName}/`;
  const response = await fetch(url, {
    headers: { Accept: "text/html, application/vnd.pypi.simple.v1+html" }
  });
  if (response.status === 404) {
    return { url, status: 404, body: "" };
  }
  if (!response.ok) {
    throw new Error(
      `Registry returned HTTP ${response.status} for ${url}`
    );
  }
  const body = await response.text();
  return { url, status: response.status, body };
}

function indexHasVersion(body, packageName, pep440Version) {
  const normalized = packageName.replaceAll("-", "_");
  const needle = `${normalized}-${pep440Version}-`;
  return body.includes(needle);
}

async function verifyPackage(packageName, pep440Version) {
  const { url, status, body } = await fetchRegistryIndex(packageName);
  if (status === 404) {
    return {
      ok: false,
      reason: `Package "${packageName}" not found on registry (${url}).`
    };
  }
  if (!indexHasVersion(body, packageName, pep440Version)) {
    return {
      ok: false,
      reason:
        `Wheel "${packageName}==${pep440Version}" is missing from ${url}. ` +
        `Publish the matching Python package release before building this app version.`
    };
  }
  return { ok: true };
}

async function main() {
  if (process.env.SKIP_PYTHON_REGISTRY_CHECK === "1") {
    console.log(
      "[verify-python-packages] SKIP_PYTHON_REGISTRY_CHECK=1 — skipping verification."
    );
    return;
  }

  const appVersion = readAppVersion();
  const pep440Version = convertToPep440Version(appVersion);
  console.log(
    `[verify-python-packages] App version: ${appVersion} (PEP 440: ${pep440Version})`
  );

  const failures = [];
  for (const packageName of REQUIRED_PACKAGES) {
    process.stdout.write(
      `[verify-python-packages] Checking ${packageName}==${pep440Version} ... `
    );
    try {
      const result = await verifyPackage(packageName, pep440Version);
      if (result.ok) {
        console.log("OK");
      } else {
        console.log("MISSING");
        failures.push(result.reason);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log("ERROR");
      failures.push(
        `Failed to query registry for "${packageName}": ${message}`
      );
    }
  }

  if (failures.length > 0) {
    console.error("");
    console.error(
      "[verify-python-packages] FAIL — required Python packages are not yet published:"
    );
    for (const reason of failures) {
      console.error(`  - ${reason}`);
    }
    console.error("");
    console.error(
      "Hint: publish the matching Python package release(s), or set " +
        "SKIP_PYTHON_REGISTRY_CHECK=1 for local non-release builds."
    );
    process.exit(1);
  }

  console.log("[verify-python-packages] All required Python packages present.");
}

main().catch((error) => {
  console.error("[verify-python-packages] Unexpected error:", error);
  process.exit(1);
});
