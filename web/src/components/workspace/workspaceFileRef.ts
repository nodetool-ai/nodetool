// workspaceFileRef.ts
// -----------------------------------------------------------------
// The `ref` of a `workspace-file` tab is `${workspaceId}::${path}`.
// The path is workspace-relative and may contain "/", so only the
// FIRST separator splits the ref — a path is never re-split.
// -----------------------------------------------------------------

const SEPARATOR = "::";

export interface WorkspaceFileRef {
  workspaceId: string;
  /** Workspace-relative path, no leading slash, "/" separated. */
  path: string;
}

/** Strip leading "./" and "/" so one file always yields one ref. */
const normalizePath = (path: string): string =>
  path.replace(/^\.\//, "").replace(/^\/+/, "");

export const buildWorkspaceFileRef = (
  workspaceId: string,
  path: string
): string => `${workspaceId}${SEPARATOR}${normalizePath(path)}`;

/** Parse a ref, or `null` when it is not a well-formed workspace-file ref. */
export const parseWorkspaceFileRef = (
  ref: string
): WorkspaceFileRef | null => {
  const index = ref.indexOf(SEPARATOR);
  if (index <= 0) {
    return null;
  }
  const workspaceId = ref.slice(0, index);
  const path = normalizePath(ref.slice(index + SEPARATOR.length));
  if (path.length === 0) {
    return null;
  }
  return { workspaceId, path };
};

/** The basename of a workspace-relative path. */
export const workspaceFileName = (path: string): string =>
  path.split("/").filter(Boolean).pop() ?? path;

/**
 * The REST download endpoint for a workspace file. Each path segment is
 * encoded on its own so the "/" separators survive.
 */
export const workspaceFileDownloadPath = (
  workspaceId: string,
  path: string
): string =>
  `/api/workspaces/${encodeURIComponent(workspaceId)}/download/${normalizePath(
    path
  )
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
