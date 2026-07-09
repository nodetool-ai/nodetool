#!/usr/bin/env node
/**
 * Layout check on the staged backend bundle (backend-bundle/).
 *
 * The packaged backend resolves files relative to server.mjs via
 * import.meta.url: provider manifests (*-manifest.json), example workflows,
 * and package assets. In dev these resolve through normal package resolution,
 * so a staging gap only surfaces in the packaged app — and silently, because
 * loadManifest() logs a warning and falls back to an empty model list.
 *
 * This script closes the loop: it extracts every `*-manifest.json` string the
 * bundled server.mjs references and asserts the file is staged at the bundle
 * root, then checks the example workflows, package assets, and the webgpu
 * dawn.node binaries. bundle-backend.mjs runs it automatically after staging,
 * so any pipeline that builds the bundle gets the check.
 *
 * Standalone usage: node scripts/verify-backend-bundle.mjs [bundleDir]
 *                   Exits 1 with diagnostics if any check fails.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Manifest basenames referenced by the bundled server source. Matches quoted
 * string literals like "kie-manifest.json", "./aki-manifest.json", or
 * "providers/aki-manifest.json" and extracts the basename — the packaged
 * layout is flat, so the basename is where the file must be staged. The
 * PACKAGE_RUNTIME_ASSETS registry is itself bundled into server.mjs, so every
 * registered asset shows up here without importing the registry.
 */
export function extractManifestReferences(serverSource) {
  const re = /["'`][A-Za-z0-9_./-]*?([A-Za-z0-9_.-]+-manifest\.json)["'`]/g;
  const names = new Set();
  for (const match of serverSource.matchAll(re)) {
    names.add(match[1]);
  }
  return [...names].sort();
}

function listFiles(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return null;
  }
}

/**
 * Verify the staged bundle layout. Returns human-readable summary lines on
 * success; throws an Error listing every failed check otherwise.
 */
export function verifyBackendBundle(bundleDir) {
  const errors = [];
  const summary = [];

  const serverPath = path.join(bundleDir, "server.mjs");
  let serverSource = "";
  try {
    serverSource = readFileSync(serverPath, "utf8");
  } catch (e) {
    throw new Error(`could not read ${serverPath}: ${e.message}`);
  }

  // 1. Every manifest the server references must be staged at the bundle root.
  const referenced = extractManifestReferences(serverSource);
  const missing = referenced.filter(
    (name) => !existsSync(path.join(bundleDir, name))
  );
  if (referenced.length === 0) {
    errors.push(
      "server.mjs references no *-manifest.json files — either the provider " +
        "manifest convention changed (update extractManifestReferences) or the " +
        "bundle is broken."
    );
  } else if (missing.length > 0) {
    errors.push(
      `server.mjs references manifest(s) not staged at the bundle root: ` +
        `${missing.join(", ")}. The packaged app would silently load empty ` +
        `model lists. Check that the owning package copies the manifest into ` +
        `its dist/ (bundle-backend.mjs stages *-manifest.json from there).`
    );
  } else {
    summary.push(`${referenced.length} referenced manifest(s) staged: ${referenced.join(", ")}`);
  }

  // 2. Example workflows and package assets (server.ts resolves them relative
  //    to server.mjs; bundle-backend only warns when the sources are absent).
  const examples = listFiles(path.join(bundleDir, "examples", "nodetool-base"));
  const exampleJsons = (examples ?? []).filter((f) =>
    f.toLowerCase().endsWith(".json")
  );
  if (exampleJsons.length === 0) {
    errors.push(
      "examples/nodetool-base/ is missing or has no workflow JSONs — the " +
        "packaged app would show an empty examples gallery."
    );
  } else {
    summary.push(`${exampleJsons.length} example workflow(s) staged`);
  }

  const assets = listFiles(path.join(bundleDir, "assets", "nodetool-base"));
  if (!assets || assets.length === 0) {
    errors.push(
      "assets/nodetool-base/ is missing or empty — example thumbnails and " +
        "package:// assets would 404 in the packaged app."
    );
  } else {
    summary.push(`${assets.length} package asset(s) staged`);
  }

  // 3. webgpu dawn binaries. The GPU compositor loads `webgpu` through a
  //    variable-specifier dynamic import esbuild can't see, so nothing else
  //    fails the build when it's missing from _modules/.
  const dawnFiles = (
    listFiles(path.join(bundleDir, "_modules", "webgpu", "dist")) ?? []
  ).filter((f) => f.endsWith(".dawn.node"));
  if (dawnFiles.length === 0) {
    errors.push(
      "no *.dawn.node binary under _modules/webgpu/dist — the packaged GPU " +
        'compositor would fail with "requires the optional \'webgpu\' package". ' +
        "Keep webgpu in EXTERNAL_PACKAGES in bundle-backend.mjs."
    );
  } else {
    summary.push(`webgpu staged with ${dawnFiles.length} dawn.node binary(ies)`);
  }

  if (errors.length > 0) {
    throw new Error(
      `backend bundle layout check failed:\n` +
        errors.map((e) => `  - ${e}`).join("\n")
    );
  }
  return summary;
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const bundleDir = path.resolve(
    process.argv[2] ??
      path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "backend-bundle")
  );
  try {
    for (const line of verifyBackendBundle(bundleDir)) {
      console.log(`verify-backend-bundle: ${line}`);
    }
    console.log(`verify-backend-bundle: ${bundleDir} OK`);
  } catch (e) {
    console.error(`verify-backend-bundle: ${e.message}`);
    process.exit(1);
  }
}
