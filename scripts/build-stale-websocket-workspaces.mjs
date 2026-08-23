#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { websocketWorkspaces } from "./websocket-workspaces.mjs";
import { buildStampPath } from "./build-typescript-workspace.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      rejectRun(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });
  });
}

function getWorkspaceDir(workspaceName) {
  return resolve(rootDir, "packages", workspaceName.replace("@nodetool-ai/", ""));
}

function getWorkspaceDependencies(workspaceName) {
  const packageJsonPath = resolve(getWorkspaceDir(workspaceName), "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const dependencies = packageJson.dependencies ?? {};

  return Object.keys(dependencies).filter((dependencyName) => websocketWorkspaces.includes(dependencyName));
}

function getNewestMtimeMs(pathname) {
  if (!existsSync(pathname)) {
    return 0;
  }

  const stats = statSync(pathname);
  let newest = stats.mtimeMs;

  if (!stats.isDirectory()) {
    return newest;
  }

  for (const entry of readdirSync(pathname, { withFileTypes: true })) {
    if (entry.name === "dist" || entry.name === "node_modules") {
      continue;
    }

    const childPath = resolve(pathname, entry.name);
    newest = Math.max(newest, getNewestMtimeMs(childPath));
  }

  return newest;
}

function emittedPathForSource(relativeSourcePath) {
  if (
    relativeSourcePath.endsWith(".d.ts") ||
    relativeSourcePath.endsWith(".d.mts") ||
    relativeSourcePath.endsWith(".d.cts")
  ) {
    // Ambient/source declarations participate in type checking but TypeScript
    // does not copy them to outDir.
    return null;
  }
  if (relativeSourcePath.endsWith(".mts")) {
    return `${relativeSourcePath.slice(0, -4)}.mjs`;
  }
  if (relativeSourcePath.endsWith(".cts")) {
    return `${relativeSourcePath.slice(0, -4)}.cjs`;
  }
  if (relativeSourcePath.endsWith(".tsx")) {
    return `${relativeSourcePath.slice(0, -4)}.js`;
  }
  if (relativeSourcePath.endsWith(".ts")) {
    return `${relativeSourcePath.slice(0, -3)}.js`;
  }
  return null;
}

function hasMissingSourceOutput(srcDir, distDir, currentDir = srcDir) {
  if (!existsSync(currentDir)) {
    return false;
  }

  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const sourcePath = resolve(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (hasMissingSourceOutput(srcDir, distDir, sourcePath)) {
        return true;
      }
      continue;
    }

    const relativeSourcePath = sourcePath.slice(srcDir.length + 1);
    const relativeOutputPath = emittedPathForSource(relativeSourcePath);
    if (relativeOutputPath === null) {
      continue;
    }

    if (!existsSync(resolve(distDir, relativeOutputPath))) {
      return true;
    }
  }

  return false;
}

function isWorkspaceStale(workspaceName) {
  const workspaceDir = getWorkspaceDir(workspaceName);
  const srcDir = resolve(workspaceDir, "src");
  const distDir = resolve(workspaceDir, "dist");
  const stampPath = buildStampPath(workspaceDir);

  if (!existsSync(distDir) || !existsSync(stampPath)) {
    return true;
  }

  // A renamed or deleted export leaves consumers importing a compiled file
  // that is no longer emitted, which no timestamp reveals.
  if (hasMissingSourceOutput(srcDir, distDir)) {
    return true;
  }

  // Compare against the build stamp, never against the emitted files:
  // `tsc --build` decides by content, so a source whose mtime moved without
  // its bytes changing is never re-emitted and would look stale forever.
  const sourceMtime = Math.max(
    getNewestMtimeMs(srcDir),
    getNewestMtimeMs(resolve(workspaceDir, "package.json")),
    getNewestMtimeMs(resolve(workspaceDir, "tsconfig.json"))
  );

  return sourceMtime > statSync(stampPath).mtimeMs;
}

const directStaleWorkspaces = websocketWorkspaces.filter(isWorkspaceStale);

const dependentsByWorkspace = new Map(
  websocketWorkspaces.map((workspace) => [workspace, []])
);

for (const workspace of websocketWorkspaces) {
  for (const dependency of getWorkspaceDependencies(workspace)) {
    dependentsByWorkspace.get(dependency)?.push(workspace);
  }
}

const affectedWorkspaces = new Set(directStaleWorkspaces);
const workspacesToVisit = [...directStaleWorkspaces];

while (workspacesToVisit.length > 0) {
  const workspace = workspacesToVisit.shift();

  for (const dependent of dependentsByWorkspace.get(workspace) ?? []) {
    if (affectedWorkspaces.has(dependent)) {
      continue;
    }

    affectedWorkspaces.add(dependent);
    workspacesToVisit.push(dependent);
  }
}

const staleWorkspaces = websocketWorkspaces.filter((workspace) => affectedWorkspaces.has(workspace));

if (staleWorkspaces.length === 0) {
  console.log("All websocket workspaces are up to date.");
  process.exit(0);
}

if (directStaleWorkspaces.length > 0 && staleWorkspaces.length > directStaleWorkspaces.length) {
  const downstreamDependents = staleWorkspaces.filter((workspace) => !directStaleWorkspaces.includes(workspace));
  console.log(`Including downstream dependents: ${downstreamDependents.join(", ")}`);
}

console.log(`Building stale workspaces: ${staleWorkspaces.join(", ")}`);

for (const workspace of staleWorkspaces) {
  await run(npmCommand, ["run", "build", "--workspace", workspace]);
}
