#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { websocketWorkspaces } from "./websocket-workspaces.mjs";

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

function isWorkspaceStale(workspaceName) {
  const workspaceDir = getWorkspaceDir(workspaceName);
  const distDir = resolve(workspaceDir, "dist");

  if (!existsSync(distDir)) {
    return true;
  }

  const sourceMtime = Math.max(
    getNewestMtimeMs(resolve(workspaceDir, "src")),
    getNewestMtimeMs(resolve(workspaceDir, "package.json")),
    getNewestMtimeMs(resolve(workspaceDir, "tsconfig.json"))
  );
  const distMtime = getNewestMtimeMs(distDir);

  return sourceMtime > distMtime;
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
