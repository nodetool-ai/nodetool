/**
 * Path policy shared by the two surfaces that read arbitrary local files: the
 * REST preview stream (`GET /api/files/local`) and the tRPC file browser
 * (`files.list`).
 *
 * The two used to disagree. The browser was sandboxed to `$HOME`, while the
 * preview stream took any absolute path and only refused a handful of
 * sensitive dotfiles — so an authenticated caller could stream `/etc/passwd`,
 * the SQLite database, or a `.env` holding `SECRETS_MASTER_KEY`. Both now
 * resolve through `resolveLocalPath`, which is an allowlist: a path must sit
 * inside a configured root, and the denylist applies on top of that.
 *
 * Roots default to the user's home directory. `NODETOOL_LOCAL_FILE_ROOTS`
 * (platform path-delimited) replaces that default, which is how a desktop user
 * previews media off an external volume.
 *
 * The single entry `*` lifts the containment check entirely. That is for the
 * desktop app, which spawns this server as the user's own process on loopback
 * and lets them drag a file in from anywhere — the run path already reads any
 * absolute `file://` URI, so restricting only the *preview* left a dropped file
 * that runs fine but shows a broken image. The denylist below still applies.
 *
 * These surfaces are already disabled when `NODETOOL_ENV=production`; this is
 * the second layer, for the dev/desktop/self-hosted deployments where the file
 * browser is live and more than one person can reach the port.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

export const LOCAL_FILE_ROOTS_ENV = "NODETOOL_LOCAL_FILE_ROOTS";

/** The `NODETOOL_LOCAL_FILE_ROOTS` entry that lifts the containment check. */
export const UNRESTRICTED_ROOT = "*";

/** Whether a resolved root list places no containment requirement on a path. */
export function isUnrestricted(roots: string[]): boolean {
  return roots.includes(UNRESTRICTED_ROOT);
}

/**
 * Never part of a legitimate preview or browse flow, even inside a root.
 * Mirrors the Electron main-process denylist so the file-read surfaces agree.
 */
const SENSITIVE_HOME_ENTRIES = [
  ".ssh",
  ".aws",
  ".gnupg",
  ".kube",
  ".docker",
  ".config/gcloud",
  ".netrc",
  ".pgpass",
  ".npmrc"
];

/** Roots a local path may resolve into. Never empty. */
export function getLocalFileRoots(): string[] {
  const configured = process.env[LOCAL_FILE_ROOTS_ENV];
  if (configured) {
    const roots = configured
      .split(path.delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) =>
        entry === UNRESTRICTED_ROOT
          ? UNRESTRICTED_ROOT
          : path.resolve(expandTilde(entry))
      );
    if (roots.length > 0) return roots;
  }
  return [path.resolve(os.homedir())];
}

function expandTilde(candidate: string): string {
  if (candidate === "~") return os.homedir();
  if (candidate.startsWith("~/") || candidate.startsWith("~\\")) {
    return path.join(os.homedir(), candidate.slice(2));
  }
  return candidate;
}

function isWithin(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(root + path.sep);
}

function isWithinAnyRoot(candidate: string, roots: string[]): boolean {
  return roots.some((root) => isWithin(candidate, root));
}

function isSensitivePath(resolved: string): boolean {
  const home = path.resolve(os.homedir());
  return SENSITIVE_HOME_ENTRIES.some((entry) => {
    const forbidden = path.resolve(home, entry);
    return isWithin(resolved, forbidden);
  });
}

/** The roots plus their symlink-resolved forms, deduped. */
async function realRoots(roots: string[]): Promise<string[]> {
  const all = new Set(roots);
  for (const root of roots) {
    try {
      all.add(await fs.realpath(root));
    } catch {
      // A configured root that doesn't exist just contributes nothing.
    }
  }
  return [...all];
}

export type LocalPathDenial = "invalid" | "outside_roots" | "sensitive";

export type LocalPathResult =
  | { ok: true; path: string }
  | { ok: false; reason: LocalPathDenial };

/** Human-readable reason, safe to return to the caller. */
export function localPathDenialMessage(reason: LocalPathDenial): string {
  switch (reason) {
    case "invalid":
      return "Invalid path";
    case "sensitive":
      return "Access to this path is not permitted";
    case "outside_roots":
      return (
        "Path is outside the allowed roots " +
        `(set ${LOCAL_FILE_ROOTS_ENV} to allow more)`
      );
  }
}

/**
 * Resolve a caller-supplied path against the allowed roots.
 *
 * A relative path resolves against the first root (against home when the roots
 * are unrestricted), so the file browser's "." still means "home" out of the
 * box. A leading `~` expands. Containment is checked twice:
 * lexically on the resolved path, then again on the symlink-resolved path —
 * a link at an allowed location (`~/shortcut -> /etc`) passes the first check
 * but the stat/stream that follows would traverse it. realpath runs against
 * the deepest existing ancestor so a not-yet-created leaf still gets its
 * parent chain verified.
 */
export async function resolveLocalPath(
  userPath: string,
  roots: string[] = getLocalFileRoots()
): Promise<LocalPathResult> {
  if (!userPath || userPath.includes("\0")) {
    return { ok: false, reason: "invalid" };
  }

  const unrestricted = isUnrestricted(roots);
  const relativeBase = unrestricted ? os.homedir() : roots[0];

  const expanded = expandTilde(userPath);
  const resolved = path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : path.resolve(relativeBase, expanded);

  if (!unrestricted && !isWithinAnyRoot(resolved, roots)) {
    return { ok: false, reason: "outside_roots" };
  }
  if (isSensitivePath(resolved)) {
    return { ok: false, reason: "sensitive" };
  }

  // A root can itself sit behind a symlink (macOS `/var` → `/private/var`), so
  // the post-realpath containment check compares against the real roots too.
  const resolvedRoots = unrestricted ? roots : await realRoots(roots);

  let probe = resolved;
  for (;;) {
    try {
      const real = await fs.realpath(probe);
      // Re-anchor the not-yet-resolved tail onto the real ancestor so a link
      // in the middle of the path can't smuggle the leaf out of the roots.
      const realResolved = path.join(real, path.relative(probe, resolved));
      if (!unrestricted && !isWithinAnyRoot(realResolved, resolvedRoots)) {
        return { ok: false, reason: "outside_roots" };
      }
      if (isSensitivePath(realResolved)) {
        return { ok: false, reason: "sensitive" };
      }
      break;
    } catch {
      const parent = path.dirname(probe);
      if (parent === probe) break; // reached the filesystem root unresolved
      probe = parent;
    }
  }

  return { ok: true, path: resolved };
}
