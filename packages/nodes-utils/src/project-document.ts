/**
 * Project-relative paths in document nodes (document editor PRD R23, R24).
 * A path inside the run's project folder names the project's document: its
 * asset when a row names the file, else the file's workspace URI.
 */
/**
 * Whether `path` is relative to the project folder: not absolute, not under
 * the home directory, and not a URI.
 */
export function isProjectRelativePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.startsWith("\\") || path.startsWith("~")) {
    return false;
  }
  if (/^[A-Za-z]:[\\/]/.test(path)) return false;
  return !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path);
}

/** The context members project path resolution uses. */
export interface ProjectDocumentContext {
  findProjectAsset?: (path: string) => Promise<{ id: string } | null>;
  workspace?: {
    uri(path: string): string;
    stat(path: string): Promise<{ isDirectory: boolean } | null>;
  } | null;
}

/**
 * The document a project-relative path names: its asset when a row names
 * the file, else the file's workspace URI. Null for any other path, or when
 * the run has no project folder.
 */
export async function projectDocumentRef(
  path: string,
  context: ProjectDocumentContext | undefined
): Promise<{ type: "document"; uri: string; asset_id?: string } | null> {
  if (!isProjectRelativePath(path) || !context?.workspace) return null;
  const asset = context.findProjectAsset ? await context.findProjectAsset(path) : null;
  if (asset) return { type: "document", uri: `asset://${asset.id}`, asset_id: asset.id };
  const stat = await context.workspace.stat(path);
  if (!stat || stat.isDirectory) return null;
  return { type: "document", uri: context.workspace.uri(path) };
}
