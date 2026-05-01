#!/usr/bin/env node
/**
 * Pre-build registry verification.
 *
 * Ensures the NodeTool registry has at least one published `nodetool-core`
 * wheel that satisfies `nodetool-core >= MIN_NODETOOL_CORE_VERSION` (read
 * from packages/protocol/src/bridge-protocol.ts). Without this, the Electron
 * installer would pin to a constraint that resolves to nothing, leaving
 * users with a stale, incompatible Python environment.
 *
 * Skip with `SKIP_PYTHON_REGISTRY_CHECK=1` when iterating locally.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELECTRON_DIR = join(__dirname, "..");
const REPO_ROOT = join(ELECTRON_DIR, "..");
const BRIDGE_PROTOCOL_TS = join(
  REPO_ROOT,
  "packages",
  "protocol",
  "src",
  "bridge-protocol.ts"
);

const REGISTRY_INDEX_URL =
  "https://nodetool-ai.github.io/nodetool-registry/simple/";

/**
 * Packages whose minimum published version must satisfy a constraint.
 * `min` is a PEP 440 string read from a single source of truth.
 */
function getRequiredPackages() {
  return [
    {
      name: "nodetool-core",
      min: readMinNodetoolCoreVersion()
    }
  ];
}

function readMinNodetoolCoreVersion() {
  const source = readFileSync(BRIDGE_PROTOCOL_TS, "utf8");
  const match = source.match(
    /MIN_NODETOOL_CORE_VERSION\s*=\s*"([^"]+)"/
  );
  if (!match) {
    throw new Error(
      `Cannot find MIN_NODETOOL_CORE_VERSION in ${BRIDGE_PROTOCOL_TS}`
    );
  }
  return match[1];
}

// ── PEP 440 lite comparator ─────────────────────────────────────────────
//
// Handles the version shapes nodetool-core actually publishes:
//   1.2.3
//   1.2.3rc4   1.2.3a4   1.2.3b4
//   1.2.3.post1
//   1.2.3.dev1
// Pre-releases sort before the matching final release. Post sorts after.
//
// This is intentionally minimal — full PEP 440 has many edge cases we
// do not need.

const PRE_RANK = { dev: 0, a: 1, b: 2, rc: 3, "": 4, post: 5 };

function parsePep440(version) {
  const m = version
    .toLowerCase()
    .match(
      /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:(a|b|rc)\.?(\d+))?(?:\.(post|dev)(\d+))?$/
    );
  if (!m) {
    throw new Error(`Unsupported version string for comparison: ${version}`);
  }
  const [, major, minor, patch, preTag, preNum, postOrDev, postOrDevNum] = m;
  let preKey = "";
  let preValue = 0;
  if (preTag) {
    preKey = preTag;
    preValue = Number(preNum);
  } else if (postOrDev === "dev") {
    preKey = "dev";
    preValue = Number(postOrDevNum);
  }
  let postKey = "";
  let postValue = 0;
  if (postOrDev === "post") {
    postKey = "post";
    postValue = Number(postOrDevNum);
  }
  return {
    release: [Number(major), Number(minor ?? 0), Number(patch ?? 0)],
    preKey,
    preValue,
    postKey,
    postValue
  };
}

function comparePep440(a, b) {
  const av = parsePep440(a);
  const bv = parsePep440(b);
  for (let i = 0; i < 3; i += 1) {
    if (av.release[i] !== bv.release[i]) {
      return av.release[i] - bv.release[i];
    }
  }
  // Same release segment — pre-release info breaks the tie.
  // Treat "no pre tag" as PRE_RANK[""] = 4 so it sorts after rc/a/b/dev
  // and before post.
  const aRank = PRE_RANK[av.preKey] ?? 4;
  const bRank = PRE_RANK[bv.preKey] ?? 4;
  if (aRank !== bRank) return aRank - bRank;
  if (av.preValue !== bv.preValue) return av.preValue - bv.preValue;
  // Post segment last.
  const aPost = av.postKey === "post" ? av.postValue + 1 : 0;
  const bPost = bv.postKey === "post" ? bv.postValue + 1 : 0;
  return aPost - bPost;
}

// ── Registry I/O ─────────────────────────────────────────────────────────

async function fetchRegistryIndex(packageName) {
  const url = `${REGISTRY_INDEX_URL}${packageName}/`;
  const response = await fetch(url, {
    headers: { Accept: "text/html, application/vnd.pypi.simple.v1+html" }
  });
  if (response.status === 404) {
    return { url, status: 404, body: "" };
  }
  if (!response.ok) {
    throw new Error(`Registry returned HTTP ${response.status} for ${url}`);
  }
  const body = await response.text();
  return { url, status: response.status, body };
}

function extractWheelVersions(body, packageName) {
  // Filenames look like: nodetool_core-0.6.3rc47-py3-none-any.whl
  const normalized = packageName.replaceAll("-", "_");
  const re = new RegExp(`${normalized}-([^-]+)-`, "g");
  const versions = new Set();
  let match;
  while ((match = re.exec(body)) !== null) {
    versions.add(match[1]);
  }
  return [...versions];
}

async function verifyPackage(pkg) {
  const { name, min } = pkg;
  const { url, status, body } = await fetchRegistryIndex(name);
  if (status === 404) {
    return {
      ok: false,
      reason: `Package "${name}" not found on registry (${url}).`
    };
  }
  const versions = extractWheelVersions(body, name);
  if (versions.length === 0) {
    return {
      ok: false,
      reason: `No wheels for "${name}" listed at ${url}.`
    };
  }
  const satisfying = versions.filter((v) => {
    try {
      return comparePep440(v, min) >= 0;
    } catch {
      return false;
    }
  });
  if (satisfying.length === 0) {
    const latest = versions
      .slice()
      .sort((a, b) => {
        try {
          return comparePep440(b, a);
        } catch {
          return 0;
        }
      })[0];
    return {
      ok: false,
      reason:
        `No wheel for "${name}>=${min}" on ${url} (latest published: ${latest}). ` +
        `Publish a matching nodetool-core release before building this app version.`
    };
  }
  const best = satisfying.sort((a, b) => comparePep440(b, a))[0];
  return { ok: true, satisfying: best };
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  if (process.env.SKIP_PYTHON_REGISTRY_CHECK === "1") {
    console.log(
      "[verify-python-packages] SKIP_PYTHON_REGISTRY_CHECK=1 — skipping verification."
    );
    return;
  }

  const required = getRequiredPackages();
  console.log(
    `[verify-python-packages] Checking required Python package constraints:`
  );
  for (const pkg of required) {
    console.log(`  - ${pkg.name} >= ${pkg.min}`);
  }

  const failures = [];
  for (const pkg of required) {
    process.stdout.write(`[verify-python-packages] ${pkg.name} >= ${pkg.min} ... `);
    try {
      const result = await verifyPackage(pkg);
      if (result.ok) {
        console.log(`OK (best match: ${result.satisfying})`);
      } else {
        console.log("MISSING");
        failures.push(result.reason);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log("ERROR");
      failures.push(`Failed to check "${pkg.name}": ${message}`);
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
      "Hint: publish a matching nodetool-core release that bumps " +
        "BRIDGE_PROTOCOL_VERSION (or update MIN_NODETOOL_CORE_VERSION in " +
        "packages/protocol/src/bridge-protocol.ts to a published version). " +
        "Set SKIP_PYTHON_REGISTRY_CHECK=1 for local non-release builds."
    );
    process.exit(1);
  }

  console.log("[verify-python-packages] All required Python packages present.");
}

main().catch((error) => {
  console.error("[verify-python-packages] Unexpected error:", error);
  process.exit(1);
});

// Tests use the comparator directly; export when imported as a module.
export { parsePep440, comparePep440 };
