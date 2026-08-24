/**
 * Client helpers for the portable `.nodetool` workflow bundle endpoints:
 *   GET  /api/workflows/:id/export-bundle   → download a single workflow + assets
 *   POST /api/workflows/export-bundle        → download multiple workflows + assets
 *   POST /api/workflows/import-bundle        → import a bundle into the library
 */
import { restFetch } from "../lib/rest-fetch";
import { saveResponseAsFile } from "./downloadResponse";
import { isObjectLike } from "./typePredicates";

interface ImportedBundleWorkflow {
  id: string;
  name: string;
}

interface ImportBundleResponse {
  workflows: ImportedBundleWorkflow[];
  imported: number;
  missing: string[];
  checksum_mismatches: string[];
}

function isImportBundleResponse(data: unknown): data is ImportBundleResponse {
  return (
    data != null &&
    typeof data === "object" &&
    "workflows" in data && Array.isArray(data.workflows) &&
    "imported" in data && typeof data.imported === "number"
  );
}

function sanitizeBundleName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_") || "workflow";
}

/** Download one workflow as a `.nodetool` bundle. */
export async function exportWorkflowBundle(
  workflowId: string,
  fallbackName: string
): Promise<void> {
  const res = await restFetch(
    `/api/workflows/${encodeURIComponent(workflowId)}/export-bundle`,
    { method: "GET" }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Export failed (${res.status})`);
  }
  await saveResponseAsFile(res, `${sanitizeBundleName(fallbackName)}.nodetool`);
}

/** Upload a `.nodetool` bundle; the server stores its assets and creates the workflows. */
export async function importWorkflowBundle(
  file: File
): Promise<ImportBundleResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await restFetch("/api/workflows/import-bundle", {
    method: "POST",
    body: formData
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      data && isObjectLike(data) && "detail" in data
        ? String(data.detail)
        : `Import failed (${res.status})`;
    throw new Error(detail);
  }
  if (!isImportBundleResponse(data)) {
    throw new Error("Unexpected response format from import endpoint");
  }
  return data;
}
