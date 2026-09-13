#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const TYPESCRIPT_API_SPEC = "npm:@typescript/typescript6@6.0.2";
export const TYPESCRIPT_NATIVE_SPEC = "npm:typescript@7.0.2";
export const TYPESCRIPT_6_FALLBACK_BUILD_SCRIPT =
  "node scripts/run-with-tsc-version.mjs 6 npm run build:packages:clean";
export const TYPESCRIPT_6_FALLBACK_WATCH_SCRIPT =
  "node ../../scripts/run-with-tsc-version.mjs 6 node ../../scripts/run-tsc.mjs --watch";
const TYPESCRIPT_API_VERSION = "6.0.2";
const TYPESCRIPT_NATIVE_VERSION = "7.0.2";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const standaloneProjects = ["mobile", "marketing", "chrome-extension"];
const sourceRoots = [
  "scripts",
  "packages",
  "reliability",
  "web",
  "electron",
  "mobile",
  "marketing",
  "chrome-extension",
  "demo",
  "examples"
];
const ignoredDirectoryNames = new Set([
  ".git",
  ".next",
  ".turbo",
  "backend-bundle",
  "build",
  "coverage",
  "dist",
  "node_modules"
]);
const sourceExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);

function dependencyEntries(manifest) {
  return [
    ...Object.entries(manifest.dependencies ?? {}),
    ...Object.entries(manifest.devDependencies ?? {}),
    ...Object.entries(manifest.optionalDependencies ?? {}),
    ...Object.entries(manifest.peerDependencies ?? {})
  ];
}

export function auditManifests(entries) {
  const errors = [];
  for (const { path, manifest } of entries) {
    for (const [name, spec] of dependencyEntries(manifest)) {
      if (name === "typescript" && spec !== TYPESCRIPT_API_SPEC) {
        errors.push(`${path}: typescript must be ${TYPESCRIPT_API_SPEC}, found ${spec}`);
      }
      if (name === "@typescript/native" && spec !== TYPESCRIPT_NATIVE_SPEC) {
        errors.push(`${path}: @typescript/native must be ${TYPESCRIPT_NATIVE_SPEC}, found ${spec}`);
      }
    }
    for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
      if (/(?:^|[;&|])\s*(?:npx\s+)?tsc(?:\s|$)/.test(command)) {
        errors.push(`${path} script ${name}: invoke scripts/run-tsc.mjs instead of bare tsc`);
      }
      if (/typescript[\\/](?:bin|lib)[\\/]/.test(command)) {
        errors.push(`${path} script ${name}: direct TypeScript compiler paths are forbidden`);
      }
    }
    if (
      path === "package.json" &&
      manifest.scripts?.["build:tsc6"] !== TYPESCRIPT_6_FALLBACK_BUILD_SCRIPT
    ) {
      errors.push(
        `${path} script build:tsc6 must use the forced dependency-ordered package build`
      );
    }
    if (
      path === "packages/cli/package.json" &&
      manifest.scripts?.dev !== TYPESCRIPT_6_FALLBACK_WATCH_SCRIPT
    ) {
      errors.push(`${path} script dev must use the TypeScript 6 watch fallback`);
    }
  }
  return errors;
}

export function auditSourceText(path, text) {
  const errors = [];
  if (/\b(?:from\s+|import\s*\(|require\s*\()\s*["']@typescript\/native(?:\/[^"']*)?["']/.test(text)) {
    errors.push(`${path}: compiler-API consumers must import typescript, not @typescript/native`);
  }
  if (/typescript[\\/](?:bin|lib)[\\/]/.test(text)) {
    errors.push(`${path}: direct TypeScript compiler paths are forbidden`);
  }
  return errors;
}

export function auditLockfile(path, lockfile, { apiRequired }) {
  const errors = [];
  const rootPackage = lockfile.packages?.[""];
  const nativePackage = lockfile.packages?.["node_modules/@typescript/native"];
  const apiPackage = lockfile.packages?.["node_modules/typescript"];
  if (!rootPackage || !nativePackage) {
    return [`${path}: missing root or @typescript/native lockfile package`];
  }
  if (rootPackage.devDependencies?.["@typescript/native"] !== TYPESCRIPT_NATIVE_SPEC) {
    errors.push(`${path}: root native compiler spec is not ${TYPESCRIPT_NATIVE_SPEC}`);
  }
  if (nativePackage.version !== TYPESCRIPT_NATIVE_VERSION) {
    errors.push(`${path}: native compiler lock entry is not ${TYPESCRIPT_NATIVE_VERSION}`);
  }
  const platformPackages = Object.entries(nativePackage.optionalDependencies ?? {});
  if (platformPackages.length === 0) {
    errors.push(`${path}: native compiler declares no platform packages`);
  }
  for (const [name, version] of platformPackages) {
    if (version !== TYPESCRIPT_NATIVE_VERSION || !lockfile.packages[`node_modules/${name}`]) {
      errors.push(`${path}: missing exact native platform package ${name}@${TYPESCRIPT_NATIVE_VERSION}`);
    }
  }
  if (apiRequired) {
    if (rootPackage.devDependencies?.typescript !== TYPESCRIPT_API_SPEC) {
      errors.push(`${path}: root TypeScript API spec is not ${TYPESCRIPT_API_SPEC}`);
    }
    if (apiPackage?.name !== "@typescript/typescript6" || apiPackage.version !== TYPESCRIPT_API_VERSION) {
      errors.push(`${path}: TypeScript API lock entry is not @typescript/typescript6@${TYPESCRIPT_API_VERSION}`);
    }
  } else if (rootPackage.devDependencies?.typescript || apiPackage) {
    errors.push(`${path}: native-only project unexpectedly installs the TypeScript API package`);
  }
  return errors;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function collectFiles(dir, predicate, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (ignoredDirectoryNames.has(entry.name)) {
      continue;
    }
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(path, predicate, files);
    } else if (entry.isFile() && predicate(path)) {
      files.push(path);
    }
  }
  return files;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.env }
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

export function verifyCompilerRoles() {
  const apiVersion = run(process.execPath, [
    "--input-type=module",
    "--eval",
    "import ts from 'typescript'; ts.createSourceFile('role.ts', 'export {};', ts.ScriptTarget.Latest); process.stdout.write(ts.version);"
  ]);
  const tsc6Version = run(process.execPath, ["scripts/run-tsc.mjs", "--version"], {
    env: { NODETOOL_TSC_VERSION: "6" }
  });
  const tsc7Version = run(process.execPath, ["scripts/run-tsc.mjs", "--version"], {
    env: { NODETOOL_TSC_VERSION: "7" }
  });
  if (!apiVersion.startsWith("6.")) {
    throw new Error(`typescript API role reported ${apiVersion}; expected major 6`);
  }
  if (!/Version 6\./.test(tsc6Version)) {
    throw new Error(`TypeScript 6 CLI role reported ${tsc6Version}`);
  }
  if (!/Version 7\./.test(tsc7Version)) {
    throw new Error(`TypeScript 7 CLI role reported ${tsc7Version}`);
  }
  return { apiVersion, tsc6Version, tsc7Version };
}

export async function checkTypeScriptPolicy() {
  const rootManifest = await readJson(resolve(repoRoot, "package.json"));
  const manifestPaths = [
    "package.json",
    ...rootManifest.workspaces.map((workspace) => `${workspace}/package.json`),
    ...standaloneProjects.map((project) => `${project}/package.json`)
  ];
  const manifestEntries = await Promise.all(
    manifestPaths.map(async (path) => ({ path, manifest: await readJson(resolve(repoRoot, path)) }))
  );
  const errors = auditManifests(manifestEntries);

  const requiredDualProjects = new Set(["package.json", "mobile/package.json", "marketing/package.json"]);
  for (const entry of manifestEntries) {
    if (requiredDualProjects.has(entry.path)) {
      const dependencies = new Map(dependencyEntries(entry.manifest));
      if (dependencies.get("typescript") !== TYPESCRIPT_API_SPEC || dependencies.get("@typescript/native") !== TYPESCRIPT_NATIVE_SPEC) {
        errors.push(`${entry.path}: expected exact TypeScript 6 API and TypeScript 7 CLI roles`);
      }
    }
  }

  const sourceFiles = [];
  for (const root of sourceRoots) {
    await collectFiles(resolve(repoRoot, root), (path) => sourceExtensions.has(path.slice(path.lastIndexOf("."))), sourceFiles);
  }
  for (const path of sourceFiles) {
    if (path === scriptPath || path.endsWith("scripts/__tests__/check-typescript-policy.test.mjs")) {
      continue;
    }
    errors.push(...auditSourceText(path, await readFile(path, "utf8")));
  }

  const lockfiles = [
    ["package-lock.json", true],
    ["mobile/package-lock.json", true],
    ["marketing/package-lock.json", true],
    ["chrome-extension/package-lock.json", false]
  ];
  for (const [path, apiRequired] of lockfiles) {
    errors.push(...auditLockfile(path, await readJson(resolve(repoRoot, path)), { apiRequired }));
  }

  if (manifestEntries.length === 0 || sourceFiles.length === 0) {
    throw new Error("TypeScript policy audit inspected no manifests or source files");
  }
  if (errors.length > 0) {
    throw new Error(`TypeScript policy violations:\n- ${errors.join("\n- ")}`);
  }

  const roles = verifyCompilerRoles();
  console.log(
    `TypeScript policy passed for ${manifestEntries.length} manifests and ${sourceFiles.length} source files. ` +
      `CLI roles: ${roles.tsc7Version} / ${roles.tsc6Version}; API: ${roles.apiVersion}.`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    await checkTypeScriptPolicy();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
