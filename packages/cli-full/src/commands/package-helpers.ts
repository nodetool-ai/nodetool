import fs from "node:fs";
import path from "node:path";
import { isObjectLike } from "../predicates.js";

export { printTable, asJson } from "./output.js";

/**
 * Return filesystem roots discovered from the cwd's package.json workspaces
 * plus the cwd itself. Patterns like "packages/*" are expanded by a single
 * readdir — the typical workspace layout — rather than pulling in a glob lib.
 */
export function findWorkspaceRoots(cwd: string = process.cwd()): string[] {
  const roots = new Set<string>([cwd]);
  const packageJsonPath = path.join(cwd, "package.json");
  if (!fs.existsSync(packageJsonPath)) return [...roots];

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return [...roots];
  }

  const patterns = Array.isArray(pkg["workspaces"])
    ? (pkg["workspaces"] as string[])
    : pkg["workspaces"] &&
        isObjectLike(pkg["workspaces"]) &&
        Array.isArray(
          (pkg["workspaces"] as Record<string, unknown>)["packages"]
        )
      ? ((pkg["workspaces"] as Record<string, unknown>)[
          "packages"
        ] as string[])
      : [];

  for (const pattern of patterns) {
    if (pattern.endsWith("/*")) {
      const parentRel = pattern.slice(0, -2);
      const parent = path.resolve(cwd, parentRel);
      if (!fs.existsSync(parent)) continue;
      try {
        for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
          if (entry.isDirectory()) roots.add(path.join(parent, entry.name));
        }
      } catch {
        // ignore
      }
    } else if (!pattern.includes("*")) {
      const full = path.resolve(cwd, pattern);
      if (fs.existsSync(full)) roots.add(full);
    }
  }

  return [...roots];
}
