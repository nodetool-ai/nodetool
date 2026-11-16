/**
 * Client helpers for `.nodetool-project` files:
 *   GET  /api/projects/:id/export  → download the whole project
 *   POST /api/projects/import      → create a new project from a file
 */
import { restFetch } from "../lib/rest-fetch";
import { saveResponseAsFile } from "./downloadResponse";
import { isObjectLike } from "./typePredicates";

export const PROJECT_FILE_EXTENSION = ".nodetool-project";

export interface ImportedProject {
  id: string;
  name: string;
}

export interface ImportProjectResponse {
  project: ImportedProject;
  counts: Record<string, number>;
  missing: string[];
  checksum_mismatches: string[];
  skipped: Array<{ kind: string; id: string; reason: string }>;
}

function isImportProjectResponse(data: unknown): data is ImportProjectResponse {
  if (!isObjectLike(data) || !("project" in data)) return false;
  const { project } = data;
  return (
    isObjectLike(project) &&
    "id" in project &&
    typeof project.id === "string" &&
    "name" in project &&
    typeof project.name === "string" &&
    "missing" in data &&
    Array.isArray(data.missing)
  );
}

async function errorDetail(res: Response, fallback: string): Promise<string> {
  const data: unknown = await res.json().catch(() => null);
  return isObjectLike(data) && "detail" in data
    ? String(data.detail)
    : fallback;
}

function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_") || "project";
}

/** An asset that references a file outside the project folder. */
export interface LinkedProjectFile {
  id: string;
  name: string;
}

/**
 * The server refused an export because the project still links files from
 * outside its folder. The creator collects them first or does not export.
 */
export class ProjectLinkedFilesError extends Error {
  readonly files: LinkedProjectFile[];
  constructor(message: string, files: LinkedProjectFile[]) {
    super(message);
    this.name = "ProjectLinkedFilesError";
    this.files = files;
  }
}

function linkedFilesOf(data: unknown): LinkedProjectFile[] | null {
  if (!isObjectLike(data) || !("linked_files" in data)) return null;
  const { linked_files: files } = data;
  if (!Array.isArray(files)) return null;
  return files.flatMap((file: unknown) =>
    isObjectLike(file) &&
    "id" in file &&
    typeof file.id === "string" &&
    "name" in file &&
    typeof file.name === "string"
      ? [{ id: file.id, name: file.name }]
      : []
  );
}

/**
 * Download a project with everything in it as a `.nodetool-project` file.
 * With `collectLinked`, the server first copies files the project links from
 * outside its folder into the folder. Without it, a project with linked
 * files throws {@link ProjectLinkedFilesError} naming them.
 */
export async function exportProjectFile(
  projectId: string,
  projectName: string,
  options: { collectLinked?: boolean } = {}
): Promise<void> {
  const query = options.collectLinked ? "?linked=collect" : "";
  const res = await restFetch(
    `/api/projects/${encodeURIComponent(projectId)}/export${query}`,
    { method: "GET" }
  );
  if (res.status === 409) {
    const data: unknown = await res.json().catch(() => null);
    const files = linkedFilesOf(data);
    if (files) {
      const detail =
        isObjectLike(data) && "detail" in data
          ? String(data.detail)
          : "The project links files outside its folder";
      throw new ProjectLinkedFilesError(detail, files);
    }
    throw new Error(`Export failed (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(await errorDetail(res, `Export failed (${res.status})`));
  }
  await saveResponseAsFile(
    res,
    `${sanitizeName(projectName)}${PROJECT_FILE_EXTENSION}`
  );
}

/** Upload a `.nodetool-project` file; the server creates a new project from it. */
export async function importProjectFile(
  file: File
): Promise<ImportProjectResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await restFetch("/api/projects/import", {
    method: "POST",
    body: formData
  });
  if (!res.ok) {
    throw new Error(await errorDetail(res, `Import failed (${res.status})`));
  }
  const data: unknown = await res.json().catch(() => null);
  if (!isImportProjectResponse(data)) {
    throw new Error("Unexpected response format from import endpoint");
  }
  return data;
}
