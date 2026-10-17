/**
 * Client helpers for the application bundle endpoints:
 *   GET  /api/applications/:id/export-bundle  → download an app + its workflows
 *   GET  /api/applications/:id/export-project → download it as a standalone JS project (.zip)
 *   POST /api/applications/import-bundle      → create the app and its workflows
 *
 * Building an app from a description is `applicationBuild.ts`.
 *
 * The workflow equivalents live in `workflowBundle.ts`; an application bundle
 * is plain JSON rather than a zip, because it carries graphs, not asset bytes.
 */
import { restFetch } from "../lib/rest-fetch";
import { saveResponseAsFile } from "./downloadResponse";
import { isObjectLike } from "./typePredicates";

interface ImportedApplication {
  id: string;
  name: string;
}

function isImportedApplication(data: unknown): data is ImportedApplication {
  return (
    data != null &&
    typeof data === "object" &&
    "id" in data &&
    typeof data.id === "string"
  );
}

function sanitizeBundleName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_") || "application";
}

/** Download one app, with the graph of every workflow it binds. */
export async function exportApplicationBundle(
  applicationId: string,
  fallbackName: string,
  options: { released?: boolean } = {}
): Promise<void> {
  const query = options.released ? "?released=1" : "";
  const res = await restFetch(
    `/api/applications/${encodeURIComponent(applicationId)}/export-bundle${query}`,
    { method: "GET" }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Export failed (${res.status})`);
  }
  await saveResponseAsFile(res, `${sanitizeBundleName(fallbackName)}.app.json`);
}

/**
 * Download one app as a standalone JavaScript project: a zip holding a Vite UI
 * and a Node server that runs the app's workflows without NodeTool.
 */
export async function exportApplicationProject(
  applicationId: string,
  fallbackName: string
): Promise<void> {
  const res = await restFetch(
    `/api/applications/${encodeURIComponent(applicationId)}/export-project`,
    { method: "GET" }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Export failed (${res.status})`);
  }
  await saveResponseAsFile(res, `${sanitizeBundleName(fallbackName)}.zip`);
}

/** Upload a bundle file; the server creates the workflows, then the app. */
export async function importApplicationBundle(
  file: File,
  projectId = "default"
): Promise<ImportedApplication> {
  const bundle: unknown = JSON.parse(await file.text());
  return installApplicationBundle(bundle, projectId);
}

/** Install a bundle already in memory, such as a green app build's. */
export async function installApplicationBundle(
  bundle: unknown,
  projectId = "default"
): Promise<ImportedApplication> {
  const res = await restFetch("/api/applications/import-bundle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bundle, projectId })
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      data && isObjectLike(data) && "detail" in data
        ? String(data.detail)
        : `Import failed (${res.status})`;
    throw new Error(detail);
  }
  if (!isImportedApplication(data)) {
    throw new Error("Unexpected response format from import endpoint");
  }
  return data;
}
