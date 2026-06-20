/**
 * Client helpers for the portable `.nodetool` workflow bundle endpoints:
 *   GET  /api/workflows/:id/export-bundle   → download a single workflow + assets
 *   POST /api/workflows/export-bundle        → download multiple workflows + assets
 *   POST /api/workflows/import-bundle        → import a bundle into the library
 */
import { restFetch } from "../lib/rest-fetch";

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
    Array.isArray((data as Record<string, unknown>).workflows) &&
    typeof (data as Record<string, unknown>).imported === "number"
  );
}

function filenameFromDisposition(
  header: string | null,
  fallback: string
): string {
  if (header) {
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }
  return fallback;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
  const blob = await res.blob();
  const filename = filenameFromDisposition(
    res.headers.get("content-disposition"),
    `${sanitizeBundleName(fallbackName)}.nodetool`
  );
  triggerDownload(blob, filename);
}

/** Download several workflows together as a single `.nodetool` bundle. */
export async function exportWorkflowsBundle(
  workflowIds: string[],
  fallbackName = "workflows"
): Promise<void> {
  const res = await restFetch("/api/workflows/export-bundle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workflow_ids: workflowIds })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const filename = filenameFromDisposition(
    res.headers.get("content-disposition"),
    `${sanitizeBundleName(fallbackName)}.nodetool`
  );
  triggerDownload(blob, filename);
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
      data && typeof data === "object" && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : `Import failed (${res.status})`;
    throw new Error(detail);
  }
  if (!isImportBundleResponse(data)) {
    throw new Error("Unexpected response format from import endpoint");
  }
  return data;
}
