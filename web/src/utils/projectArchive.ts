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

/** Download a project with everything in it as a `.nodetool-project` file. */
export async function exportProjectFile(
  projectId: string,
  projectName: string
): Promise<void> {
  const res = await restFetch(
    `/api/projects/${encodeURIComponent(projectId)}/export`,
    { method: "GET" }
  );
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
