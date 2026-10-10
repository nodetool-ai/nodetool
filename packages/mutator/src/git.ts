/** Changed files and functions, from git. */

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { formDigests, findForms } from "./forms.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function split(output: string): string[] {
  return output.split("\0").filter((entry) => entry !== "");
}

export function toplevel(root: string): string {
  return git(root, ["rev-parse", "--show-toplevel"]).trim();
}

/** Added, modified and untracked files from `git status`, as absolute paths. */
export function statusChangedFiles(root: string): string[] {
  const top = toplevel(root);
  const entries = split(git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
  const files: string[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    if (code.startsWith("R") || code.startsWith("C")) {
      // The rename's source path follows as its own entry.
      index += 1;
    }
    if (code.includes("D")) {
      continue;
    }
    files.push(join(top, path));
  }
  return files;
}

export function mergeBase(root: string, ref: string): string {
  return git(root, ["merge-base", ref, "HEAD"]).trim();
}

/** Files added or modified since `base`, including uncommitted and untracked ones. */
export function filesChangedSince(root: string, base: string): string[] {
  const top = toplevel(root);
  const tracked = split(git(root, ["diff", "--name-only", "-z", "--diff-filter=AMR", base]));
  const untracked = split(git(root, ["ls-files", "-z", "--others", "--exclude-standard"]));
  return [...new Set([...tracked, ...untracked])].map((path) => join(top, path));
}

function sourceAt(root: string, base: string, repoPath: string): string | null {
  try {
    return git(root, ["show", `${base}:${repoPath}`]);
  } catch {
    return null;
  }
}

/**
 * Form keys whose text differs from `base`. A new file, or a new function,
 * counts as changed.
 */
export function formsChangedSince(
  root: string,
  base: string,
  path: string,
  fileKey: string,
  source: string
): Set<string> {
  const top = toplevel(root);
  const repoPath = path.slice(top.length + 1).split("\\").join("/");
  const current = formDigests(source, findForms(source, path, fileKey));
  const prior = sourceAt(root, base, repoPath);
  const before = prior === null ? new Map<string, string>() : formDigests(prior, findForms(prior, path, fileKey));
  const changed = new Set<string>();
  for (const [key, digest] of current) {
    if (before.get(key) !== digest) {
      changed.add(key);
    }
  }
  return changed;
}
