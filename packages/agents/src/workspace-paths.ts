/**
 * Whether a path stays inside the workspace, symlinks included.
 *
 * `resolveWorkspacePath` checks containment lexically, which a symlink defeats:
 * a link inside the workspace (unpacked from an imported bundle, or written by
 * an earlier run) can point anywhere on the host, and dereferencing it hands
 * out files the workspace was supposed to bound. Both predicates below resolve
 * the real path first and answer against the real root.
 *
 * Shared by the file capabilities and the host-binary guard, so "inside the
 * workspace" means one thing no matter which surface asks.
 */

import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";

/**
 * True when `candidate`'s real (symlink-resolved) path stays within the real
 * workspace root. Returns false when either path cannot be resolved
 * (broken/dangling link).
 */
export async function isRealPathWithinRoot(
  root: string,
  candidate: string
): Promise<boolean> {
  try {
    const realRoot = await realpath(root);
    const realCandidate = await realpath(candidate);
    if (realCandidate === realRoot) return true;
    const rel = relative(realRoot, realCandidate);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  } catch {
    return false;
  }
}

/**
 * Like {@link isRealPathWithinRoot} but tolerant of a not-yet-created target:
 * when the candidate does not exist, its parent directory is realpath-checked
 * instead, so creating a file under a symlinked-out directory is still blocked.
 */
export async function isEditTargetWithinRoot(
  root: string,
  candidate: string
): Promise<boolean> {
  if (await isRealPathWithinRoot(root, candidate)) return true;
  // Candidate may not exist yet (create path) — check its parent.
  const parent = dirname(candidate);
  if (parent === candidate) return false;
  try {
    // lstat, NOT access: access() follows symlinks, so a DANGLING in-workspace
    // symlink (target outside the root and not yet created) would look absent
    // and fall through to the parent check, allowing a create that follows the
    // link outside the workspace. lstat stats the link itself, so it succeeds
    // and we treat the path as existing-but-out-of-root.
    await lstat(candidate);
    // It exists (as a real file or a symlink) but failed the realpath
    // containment check above → outside the root.
    return false;
  } catch {
    // Truly does not exist; the containing directory must be inside the root.
    return isRealPathWithinRoot(root, parent);
  }
}
