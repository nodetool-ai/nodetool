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
 *                   [--profile desktop|server]
 *                   Defaults: electron/backend-bundle, desktop profile.
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

function readPackageJson(pkgDir) {
  try {
    return JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

function readPackageVersion(pkgDir) {
  return readPackageJson(pkgDir)?.version ?? null;
}

function listFiles(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return null;
  }
}

/**
 * Pack names staged under `_sandbox/`, with scoped packs read one level deeper.
 * An absent directory is the normal case: no builtin ships sandbox modules.
 */
function listStagedSandboxPacks(bundleDir) {
  const root = path.join(bundleDir, "_sandbox");
  const packs = [];
  for (const entry of listFiles(root) ?? []) {
    if (entry.startsWith("@")) {
      for (const name of listFiles(path.join(root, entry)) ?? []) {
        packs.push(`${entry}/${name}`);
      }
    } else {
      packs.push(entry);
    }
  }
  return packs;
}

/**
 * Package names of the sandbox packs this repo ships, or null when the source
 * directory is absent — the artifact can be verified outside a checkout.
 *
 * The path repeats SHIPPED_SANDBOX_PACKS_SOURCE_DIR
 * (`packages/config/src/package-asset-registry.ts`) rather than importing it,
 * so this check keeps working against a bundle with no build tree beside it.
 */
function listShippedSandboxPackNames() {
  const sourceDir = path.join(
    path.dirname(path.dirname(fileURLToPath(import.meta.url))),
    "packages",
    "sandbox-packs"
  );
  const entries = listFiles(sourceDir);
  if (entries === null) return null;
  const names = [];
  for (const entry of entries) {
    const pkgJson = readPackageJson(path.join(sourceDir, entry));
    if (Array.isArray(pkgJson?.nodetool?.sandboxModules) && pkgJson.name) {
      names.push(pkgJson.name);
    }
  }
  return names;
}

/**
 * Verify the staged bundle layout. Returns human-readable summary lines on
 * success; throws an Error listing every failed check otherwise.
 * `requireWebgpu` is true for the desktop profile; the server profile does no
 * local GPU compute and deliberately ships without webgpu.
 */
export function verifyBackendBundle(bundleDir, { requireWebgpu = true } = {}) {
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

  const exampleApps = (listFiles(path.join(bundleDir, "examples", "apps")) ?? [])
    .filter((f) => f.toLowerCase().endsWith(".app.json"));
  if (exampleApps.length === 0) {
    errors.push(
      "examples/apps/ is missing or has no app bundles — the packaged app " +
        "would offer no example apps to install."
    );
  } else {
    summary.push(`${exampleApps.length} example app bundle(s) staged`);
  }

  // Every shot of a shipped storyboard points at a `package://` still and
  // clip. Those live under assets/nodetool-base/storyboards/<slug>/, one
  // directory deeper than anything else staged here — so check the files the
  // bundles actually name rather than that the directory exists.
  const storyboardDir = path.join(bundleDir, "examples", "storyboards");
  const storyboards = (listFiles(storyboardDir) ?? []).filter((f) =>
    f.toLowerCase().endsWith(".storyboard.json")
  );
  if (storyboards.length === 0) {
    errors.push(
      "examples/storyboards/ is missing or has no storyboard bundles — the " +
        "packaged app would offer no example storyboards to install."
    );
  } else {
    const missingMedia = [];
    for (const file of storyboards) {
      let bundle;
      try {
        bundle = JSON.parse(readFileSync(path.join(storyboardDir, file), "utf8"));
      } catch (err) {
        errors.push(`examples/storyboards/${file} is not readable: ${err.message}`);
        continue;
      }
      for (const shot of bundle?.document?.shots ?? []) {
        for (const uri of [shot?.keyframe?.uri, shot?.clip?.uri]) {
          const match = /^package:\/\/([^/]+)\/(.+)$/.exec(uri ?? "");
          if (!match) {
            missingMedia.push(`${file}: shot ${shot?.id} has no package:// media`);
            continue;
          }
          const staged = path.join(bundleDir, "assets", match[1], ...match[2].split("/"));
          if (!existsSync(staged)) {
            missingMedia.push(`${file}: ${uri}`);
          }
        }
      }
    }
    if (missingMedia.length > 0) {
      errors.push(
        "example storyboard media not staged — the boards would install with " +
          `broken stills and clips:\n  ${missingMedia.join("\n  ")}`
      );
    } else {
      summary.push(`${storyboards.length} example storyboard(s) staged with their media`);
    }
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

  // 2b. The sandbox worker entry. A worker needs a real file URL, so it cannot
  //     live inside server.mjs, and host.ts resolves this exact path relative
  //     to server.mjs. Missing, the sandbox silently falls back to running the
  //     interpreter in-process, where a CPU-bound guest blocks the event loop
  //     for its whole timeout.
  const sandboxWorker = path.join(
    bundleDir,
    "js-sandbox-worker",
    "worker-entry.js"
  );
  if (!existsSync(sandboxWorker)) {
    errors.push(
      "js-sandbox-worker/worker-entry.js is not staged — the packaged backend " +
        "would run every sandboxed program on the main thread. Check " +
        "buildSandboxWorkerBundle in bundle-backend.mjs."
    );
  } else {
    summary.push("sandbox worker entry staged");
  }

  // 3. webgpu dawn binaries (desktop profile only). The GPU compositor loads
  //    `webgpu` through a variable-specifier dynamic import esbuild can't see,
  //    so nothing else fails the build when it's missing from _modules/.
  if (requireWebgpu) {
    const dawnFiles = (
      listFiles(path.join(bundleDir, "_modules", "webgpu", "dist")) ?? []
    ).filter((f) => f.endsWith(".dawn.node"));
    if (dawnFiles.length === 0) {
      errors.push(
        "no *.dawn.node binary under _modules/webgpu/dist — the packaged GPU " +
          'compositor would fail with "requires the optional \'webgpu\' package". ' +
          "Keep webgpu in DESKTOP_ONLY_EXTERNAL_PACKAGES in bundle-backend.mjs."
      );
    } else {
      summary.push(
        `webgpu staged with ${dawnFiles.length} dawn.node binary(ies)`
      );
    }
  }

  // 3b. Sandbox packs staged under _sandbox/ must be complete: the pack
  //     manifest that travels with them is what discovery reads, so every file
  //     it declares has to be there. A pack whose sources are half-staged
  //     resolves in dev and fails at import time in the packaged app.
  //     The set must also match the packs the repo ships — a bundle missing one
  //     offers a library the product documents and the Code node cannot import.
  const stagedPacks = listStagedSandboxPacks(bundleDir);
  const shippedPacks = listShippedSandboxPackNames();
  if (shippedPacks !== null) {
    const absentPacks = shippedPacks.filter((name) => !stagedPacks.includes(name));
    if (absentPacks.length > 0) {
      errors.push(
        `Sandbox pack(s) not staged under _sandbox/: ${absentPacks.join(", ")}. ` +
          "Check stageShippedSandboxPacks in bundle-backend.mjs."
      );
    }
  } else if (stagedPacks.length === 0) {
    errors.push(
      "No sandbox pack is staged under _sandbox/, so the packaged backend ships " +
        "no sandbox library at all."
    );
  }
  for (const pack of stagedPacks) {
    const packDir = path.join(bundleDir, "_sandbox", ...pack.split("/"));
    const pkgJson = readPackageJson(packDir);
    const declared = pkgJson?.nodetool?.sandboxModules;
    if (!Array.isArray(declared) || declared.length === 0) {
      errors.push(
        `_sandbox/${pack} has no package.json declaring nodetool.sandboxModules — ` +
          "staged sandbox packs carry their manifest, which is what discovery reads."
      );
      continue;
    }
    const files = [
      ...declared.map((module) => module?.file).filter(Boolean),
      ...(Array.isArray(pkgJson.nodetool.internal) ? pkgJson.nodetool.internal : []),
    ];
    const absent = [...new Set(files)].filter(
      (file) => !existsSync(path.join(packDir, ...file.split("/")))
    );
    if (absent.length > 0) {
      errors.push(
        `_sandbox/${pack} declares file(s) that are not staged: ${absent.join(", ")}.`
      );
    } else {
      summary.push(
        `sandbox pack ${pack} staged: ${declared.length} module(s), ` +
          `${new Set(files).size} declared file(s)`
      );
    }
  }

  // 4. sharp and its native prebuilds must be the same release. _modules/ is
  //    flat, so a hoisted @img/sharp-<platform> from an older sharp major can
  //    take the slot sharp's own prebuild needs. The mismatch is silent until
  //    the packaged app starts, where sharp's JS reads a format table the older
  //    binary doesn't expose and the backend dies on import.
  const modulesDir = path.join(bundleDir, "_modules");
  const mediabunnyVersion = readPackageVersion(
    path.join(modulesDir, "mediabunny")
  );
  const mediabunnyServerVersion = readPackageVersion(
    path.join(modulesDir, "@mediabunny", "server")
  );
  const nodeAvVersion = readPackageVersion(path.join(modulesDir, "node-av"));
  const targetPlatform = process.env.NODETOOL_BUNDLE_PLATFORM || process.platform;
  const targetArch = process.env.NODETOOL_BUNDLE_ARCH || process.arch;
  const nodeAvTarget =
    targetPlatform === "win32"
      ? `node-av-win32-${targetArch}-msvc`
      : `node-av-${targetPlatform}-${targetArch}`;
  const nodeAvBinary = path.join(
    modulesDir,
    "@seydx",
    nodeAvTarget,
    "node-av.node"
  );
  if (!mediabunnyVersion || !mediabunnyServerVersion || !nodeAvVersion) {
    errors.push(
      "Mediabunny, @mediabunny/server, and node-av must all be staged for " +
        "sandbox audio/video operations in the packaged backend."
    );
  } else if (!existsSync(nodeAvBinary)) {
    errors.push(
      `@seydx/${nodeAvTarget}/node-av.node is not staged; Mediabunny cannot ` +
        `decode or encode media for ${targetPlatform}/${targetArch}.`
    );
  } else {
    summary.push(
      `Mediabunny ${mediabunnyVersion} server codecs staged with ` +
        nodeAvTarget
    );
  }

  const sharpVersion = readPackageVersion(path.join(modulesDir, "sharp"));
  if (!sharpVersion) {
    errors.push("_modules/sharp is missing or has no readable package.json");
  } else {
    const imgDir = path.join(modulesDir, "@img");
    const imgPackages = (listFiles(imgDir) ?? []).filter((n) =>
      n.startsWith("sharp-")
    );
    const prebuilts = imgPackages.filter((n) => !n.startsWith("sharp-libvips-"));
    if (prebuilts.length === 0) {
      errors.push(
        "no @img/sharp-<platform> prebuild staged under _modules/@img — sharp " +
          "would fail to load its native binary in the packaged app."
      );
    }
    for (const name of prebuilts) {
      const version = readPackageVersion(path.join(imgDir, name));
      if (version !== sharpVersion) {
        errors.push(
          `_modules/@img/${name} is ${version}, but _modules/sharp is ` +
            `${sharpVersion}. Stage the prebuild that sharp itself resolves ` +
            `(sharp/node_modules/@img/…), not a hoisted copy from another ` +
            `sharp major.`
        );
      }
      // The prebuild pins its libvips exactly; a skewed libvips fails to load.
      const deps = readPackageJson(path.join(imgDir, name))?.optionalDependencies ?? {};
      for (const [libvipsName, wanted] of Object.entries(deps)) {
        const staged = readPackageVersion(
          path.join(modulesDir, ...libvipsName.split("/"))
        );
        if (staged && staged !== wanted) {
          errors.push(
            `_modules/${libvipsName} is ${staged}, but @img/${name} pins ` +
              `${wanted}. sharp would load a mismatched libvips.`
          );
        }
      }
    }
    if (errors.length === 0) {
      summary.push(
        `sharp ${sharpVersion} staged with matching prebuild(s): ${prebuilts.join(", ")}`
      );
    }
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
  const args = process.argv.slice(2);
  let profile = "desktop";
  const profileIdx = args.indexOf("--profile");
  if (profileIdx !== -1) {
    profile = args[profileIdx + 1];
    args.splice(profileIdx, 2);
    if (profile !== "desktop" && profile !== "server") {
      console.error(
        `--profile must be "desktop" or "server", got: ${profile}`
      );
      process.exit(1);
    }
  }
  const bundleDir = path.resolve(
    args[0] ??
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
        "electron",
        "backend-bundle"
      )
  );
  try {
    for (const line of verifyBackendBundle(bundleDir, {
      requireWebgpu: profile === "desktop",
    })) {
      console.log(`verify-backend-bundle: ${line}`);
    }
    console.log(`verify-backend-bundle: ${bundleDir} OK`);
  } catch (e) {
    console.error(`verify-backend-bundle: ${e.message}`);
    process.exit(1);
  }
}
