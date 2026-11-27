/**
 * Files in a project folder that no asset or document names
 * (docs/plans/library-search.md, F13): Markdown, text, PDF and Word files a
 * person dropped into the folder. Each is an item of resource type
 * `project_file` with the resource id `<project id>:<path>`.
 *
 * This package does not open project folders. The process that runs the
 * indexer installs a {@link ProjectFileSource}. Without one, these items are
 * neither added nor removed.
 */

import type { SearchMetadata } from "@nodetool-ai/protocol";
import { assetContentFormat, type ExtractedItem } from "./extract.js";

/** One file in a project folder, as the source lists it. */
export interface ProjectFile {
  /** Relative to the project folder, with `/` separators. */
  path: string;
  size: number;
  /** Milliseconds since the epoch. */
  modifiedAt: number;
}

/** Lists and reads project folders. Installed by the indexer process. */
export interface ProjectFileSource {
  /** Projects whose folders this process can read, optionally of one owner. */
  projects(userId?: string): Promise<Array<{ userId: string; projectId: string }>>;
  /** Files of one project's folder that no row names. */
  files(userId: string, projectId: string): Promise<ProjectFile[]>;
  /** A file's size in bytes, or null when it is gone. Asked before `read`, so a large file is never loaded. */
  size(userId: string, projectId: string, path: string): Promise<number | null>;
  /** A file's bytes, or null when it is gone. */
  read(userId: string, projectId: string, path: string): Promise<Uint8Array | null>;
}

let source: ProjectFileSource | null = null;

/** Install how project folders are read, or remove it with `null`. */
export function setProjectFileSource(next: ProjectFileSource | null): void {
  source = next;
}

export function projectFileSource(): ProjectFileSource | null {
  return source;
}

/** Content types by extension, for the files the extractors read. */
const CONTENT_TYPES: Record<string, string> = {
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  rst: "text/plain",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
};

/** The content type of a folder file the index reads, or null for one it does not. */
export function projectFileContentType(path: string): string | null {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  const type = CONTENT_TYPES[name.slice(dot + 1).toLowerCase()] ?? null;
  return type && assetContentFormat(type, name) ? type : null;
}

export function projectFileResourceId(projectId: string, path: string): string {
  return `${projectId}:${path}`;
}

/** Split a resource id into project and path. Project ids never hold a colon. */
export function parseProjectFileResourceId(resourceId: string): { projectId: string; path: string } | null {
  const at = resourceId.indexOf(":");
  if (at <= 0 || at === resourceId.length - 1) return null;
  return { projectId: resourceId.slice(0, at), path: resourceId.slice(at + 1) };
}

export function projectFileSourceVersion(file: Pick<ProjectFile, "modifiedAt" | "size">): string {
  return `${file.modifiedAt}|${file.size}`;
}

/** What the index stores for one folder file. */
export function extractProjectFile(
  userId: string,
  projectId: string,
  file: ProjectFile,
  contentType: string
): ExtractedItem {
  const slash = file.path.lastIndexOf("/");
  const name = file.path.slice(slash + 1);
  const folderPath = slash > 0 ? file.path.slice(0, slash) : null;
  const time = new Date(file.modifiedAt).toISOString();
  const metadata: SearchMetadata = {
    kind: "document",
    title: name,
    content_type: contentType,
    project_id: projectId,
    size: file.size,
    origin: "folder_file",
    created_at: time,
    updated_at: time
  };
  if (folderPath) metadata.folder_path = folderPath;
  return {
    userId,
    projectId,
    resourceType: "project_file",
    resourceId: projectFileResourceId(projectId, file.path),
    kind: "document",
    title: name,
    contentType,
    provider: null,
    model: null,
    workflowId: null,
    favorite: false,
    folderPath,
    tags: [],
    metadata,
    sourceVersion: projectFileSourceVersion(file),
    createdAt: time,
    updatedAt: time,
    chunks: [{ field: "title", text: folderPath ? `${name}\n${file.path}` : name }],
    hasContent: true
  };
}

/**
 * Every readable folder file of the reachable projects, optionally of one
 * owner, keyed by `<owner>\0<resource id>`. `reachable` lists the projects
 * that were read, so items of other projects are kept, not removed.
 */
export async function listProjectFiles(
  userId?: string
): Promise<{ files: Map<string, ExtractedItem>; reachable: Set<string> } | null> {
  const active = source;
  if (!active) return null;
  const files = new Map<string, ExtractedItem>();
  const reachable = new Set<string>();
  for (const project of await active.projects(userId)) {
    let listed: ProjectFile[];
    try {
      listed = await active.files(project.userId, project.projectId);
    } catch {
      // An unreadable folder keeps its items until it is readable again.
      continue;
    }
    reachable.add(`${project.userId}\u0000${project.projectId}`);
    for (const file of listed) {
      const contentType = projectFileContentType(file.path);
      if (!contentType) continue;
      const item = extractProjectFile(project.userId, project.projectId, file, contentType);
      files.set(`${project.userId}\u0000${item.resourceId}`, item);
    }
  }
  return { files, reachable };
}
