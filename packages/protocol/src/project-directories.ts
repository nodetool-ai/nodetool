/**
 * Folders of the asset browser inside a project (project folders PRD T3, T8).
 *
 * Within a project, the asset browser's folders are the directories of the
 * project folder. A directory has no asset row, so it is named by an id that
 * carries its project and its project-relative path: `dir:<project>:<path>`,
 * each part URI-encoded. The project root is the user's home folder, whose id
 * is the user id, as everywhere else in the asset browser.
 *
 * An asset sits in the directory of its `workspace_path`. An asset that has no
 * file in the folder yet sits under the path its `parent_id` chain spells: the
 * names of the legacy folder rows above it, or the directory a directory id
 * names. Server and web derive folders with the same functions.
 */

/** Prefix of a directory folder id. Generated resource ids never start so. */
export const PROJECT_DIRECTORY_ID_PREFIX = "dir:";

/**
 * The asset metadata key that records where the bytes of an asset from before
 * project folders are being moved to: a path relative to its project folder.
 * It is written before the first byte is copied and removed after the legacy
 * object is deleted, so a move that was interrupted is found and finished.
 * Server-owned: a client metadata update never writes it.
 */
export const WORKSPACE_MOVE_TARGET_KEY = "workspace_move_target";

/** A directory of a project folder, as a directory folder id names it. */
export interface ProjectDirectoryRef {
  projectId: string;
  /** Project-relative path without leading or trailing slash. "" is the root. */
  path: string;
}

/** The id of the directory `path` of the folder of `projectId`. */
export function projectDirectoryId(projectId: string, path: string): string {
  return `${PROJECT_DIRECTORY_ID_PREFIX}${encodeURIComponent(projectId)}:${encodeURIComponent(path)}`;
}

/**
 * Whether a project lists its assets by directory. A loose asset
 * (`"default"`) and the view across every project keep folder rows.
 */
export function listsByDirectory(
  projectId: string | null | undefined
): projectId is string {
  return (
    projectId !== undefined &&
    projectId !== null &&
    projectId !== "" &&
    projectId !== "default"
  );
}

/**
 * The id of the folder the directory `path` of `projectId` is, for one user.
 * The project root is the user's home folder, whose id is the user id.
 */
export function directoryFolderId(
  userId: string,
  projectId: string,
  path: string
): string {
  return path ? projectDirectoryId(projectId, path) : userId;
}

/** Whether `id` names a directory of a project folder. */
export function isProjectDirectoryId(id: string | null | undefined): boolean {
  return parseProjectDirectoryId(id) !== null;
}

/** The project and path a directory folder id names, or null for any other id. */
export function parseProjectDirectoryId(
  id: string | null | undefined
): ProjectDirectoryRef | null {
  if (!id || !id.startsWith(PROJECT_DIRECTORY_ID_PREFIX)) return null;
  const rest = id.slice(PROJECT_DIRECTORY_ID_PREFIX.length);
  const colon = rest.indexOf(":");
  if (colon <= 0) return null;
  try {
    const projectId = decodeURIComponent(rest.slice(0, colon));
    const path = decodeURIComponent(rest.slice(colon + 1));
    if (!projectId || path.startsWith("/") || path.endsWith("/")) return null;
    return { projectId, path };
  } catch {
    // A malformed escape is not a directory id.
    return null;
  }
}

/** The directory that holds `path`. "" for an entry at the root. */
export function parentDirectory(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(0, slash) : "";
}

/** The last segment of `path`. */
export function directoryName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** `name` under the directory `directory`. */
export function joinDirectory(directory: string, name: string): string {
  return directory ? `${directory}/${name}` : name;
}

/** Whether `path` is `directory` or lies inside it. The root holds everything. */
export function isWithinDirectory(path: string, directory: string): boolean {
  return (
    directory === "" || path === directory || path.startsWith(`${directory}/`)
  );
}

/**
 * The directory name a legacy folder row stands for. A folder name may hold a
 * slash or be empty. Neither can be one path segment.
 */
export function folderNameAsDirectory(name: string): string {
  const cleaned = name.replace(/[/\\]/g, "-").trim();
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "_" : cleaned;
}

/** The fields of an asset row that place it in a directory. */
export interface DirectoryPlacement {
  id: string;
  parent_id: string | null;
  workspace_path?: string | null;
}

/** The fields of a legacy folder row the derivation reads. */
export interface LegacyFolder {
  id: string;
  name: string;
  parent_id: string | null;
}

/**
 * Derives the directory of each asset of one project. Legacy folder rows are
 * looked up by id and each one's path is computed once.
 */
export class ProjectDirectoryResolver {
  private readonly paths = new Map<string, string>();

  constructor(
    private readonly projectId: string,
    private readonly folders: ReadonlyMap<string, LegacyFolder>
  ) {}

  /**
   * The directory a `parent_id` names: the root for the home folder or an
   * unknown id, the path of a directory id of this project, or the path of a
   * legacy folder row.
   */
  directoryOfParent(parentId: string | null | undefined): string {
    return this.resolve(parentId, new Set());
  }

  /** The path a legacy folder row stands for. */
  pathOfFolder(folder: LegacyFolder): string {
    return this.folderPath(folder, new Set());
  }

  /**
   * The directory `asset` sits in: that of its file, or for an asset with no
   * file in the folder yet, the one its `parent_id` names.
   */
  directoryOf(asset: DirectoryPlacement): string {
    if (asset.workspace_path) return parentDirectory(asset.workspace_path);
    return this.directoryOfParent(asset.parent_id);
  }

  private resolve(parentId: string | null | undefined, seen: Set<string>): string {
    if (!parentId) return "";
    const ref = parseProjectDirectoryId(parentId);
    if (ref) return ref.projectId === this.projectId ? ref.path : "";
    const folder = this.folders.get(parentId);
    return folder ? this.folderPath(folder, seen) : "";
  }

  private folderPath(folder: LegacyFolder, seen: Set<string>): string {
    const known = this.paths.get(folder.id);
    if (known !== undefined) return known;
    // A parent cycle ends at the root rather than recursing forever.
    if (seen.has(folder.id)) return "";
    seen.add(folder.id);
    const path = joinDirectory(
      this.resolve(folder.parent_id, seen),
      folderNameAsDirectory(folder.name)
    );
    this.paths.set(folder.id, path);
    return path;
  }
}

/**
 * Every directory `paths` names, with each ancestor, sorted. The root is left
 * out.
 */
export function withAncestorDirectories(paths: Iterable<string>): string[] {
  const all = new Set<string>();
  for (const path of paths) {
    for (let dir = path; dir && !all.has(dir); dir = parentDirectory(dir)) {
      all.add(dir);
    }
  }
  return [...all].sort((a, b) => a.localeCompare(b));
}
