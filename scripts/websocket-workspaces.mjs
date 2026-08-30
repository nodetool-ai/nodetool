import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// The workspaces `@nodetool-ai/websocket` needs, in build order. Derived from
// the dependency graph rather than listed by hand: the hand-maintained list
// drifted to 21 of the 49 real entries, and a workspace missing from it is
// invisible to the staleness check — `npm run build-stale-backend` reported
// "up to date" while `packages/execution`'s dist was two days behind its
// source, so `electron:dev` started against stale type declarations.

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");

function readPackageJson(pathname) {
  return JSON.parse(readFileSync(pathname, "utf8"));
}

/** Every workspace, by package name. Paths come from the root package.json. */
function readWorkspaces() {
  const { workspaces } = readPackageJson(resolve(rootDir, "package.json"));
  const byName = new Map();

  for (const relativeDir of workspaces) {
    const workspaceDir = resolve(rootDir, relativeDir);
    let packageJson;
    try {
      packageJson = readPackageJson(resolve(workspaceDir, "package.json"));
    } catch {
      // An example or template directory that ships no package.json is not a
      // workspace we can build.
      continue;
    }

    byName.set(packageJson.name, {
      dir: workspaceDir,
      dependencies: Object.keys(packageJson.dependencies ?? {}),
    });
  }

  return byName;
}

const workspacesByName = readWorkspaces();

function workspaceEntry(workspaceName) {
  const entry = workspacesByName.get(workspaceName);
  if (!entry) {
    throw new Error(`${workspaceName} is not a workspace in the root package.json`);
  }
  return entry;
}

export function getWorkspaceDir(workspaceName) {
  return workspaceEntry(workspaceName).dir;
}

/** This workspace's dependencies that are themselves workspaces. */
export function getWorkspaceDependencies(workspaceName) {
  return workspaceEntry(workspaceName).dependencies.filter((dependencyName) =>
    workspacesByName.has(dependencyName)
  );
}

/**
 * `rootName` and everything it depends on transitively, dependencies first.
 * Throws on a dependency cycle — a cycle has no build order, and silently
 * picking one emits against declarations that do not exist yet.
 */
function buildOrderFrom(rootName) {
  const order = [];
  const state = new Map();

  function visit(workspaceName, stack) {
    const visitState = state.get(workspaceName);
    if (visitState === "done") {
      return;
    }
    if (visitState === "visiting") {
      throw new Error(
        `Dependency cycle between workspaces: ${[...stack, workspaceName].join(" -> ")}`
      );
    }

    state.set(workspaceName, "visiting");
    for (const dependencyName of getWorkspaceDependencies(workspaceName)) {
      visit(dependencyName, [...stack, workspaceName]);
    }
    state.set(workspaceName, "done");
    order.push(workspaceName);
  }

  visit(rootName, []);
  return order;
}

export const websocketWorkspaces = buildOrderFrom("@nodetool-ai/websocket");
