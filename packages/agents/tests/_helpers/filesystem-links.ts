import { symlink } from "node:fs/promises";

/**
 * Create a directory link without requiring elevated Windows privileges.
 * Junctions exercise the same realpath containment boundary as directory
 * symlinks; other platforms use a regular directory symlink.
 */
export async function createDirectoryLink(
  target: string,
  linkPath: string
): Promise<void> {
  await symlink(
    target,
    linkPath,
    process.platform === "win32" ? "junction" : "dir"
  );
}
