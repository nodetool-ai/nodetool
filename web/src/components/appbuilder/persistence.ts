/**
 * Loads and saves an app's Puck document on a workflow.
 *
 * The document lives in the first-class `workflow.app_doc` field — a JSON object
 * `{ version, data }`.
 */
import type { Data } from "@puckeditor/core";
import { Workflow } from "../../stores/ApiTypes";
import { AppDocument, parseAppDocument } from "./appData";

export const loadAppDocument = (
  workflow?: Workflow | null
): AppDocument | null => {
  const doc = workflow?.app_doc;
  if (doc && typeof doc === "object") return parseAppDocument(doc);
  return null;
};

export const loadAppData = (workflow?: Workflow | null): Data | null =>
  loadAppDocument(workflow)?.data ?? null;

export const hasAppSpec = (workflow?: Workflow | null): boolean => {
  const data = loadAppData(workflow);
  return Boolean(data && data.content.length > 0);
};

/** The `app_doc` field value for a workflow update (or null to clear it). */
export const toAppDocField = (
  doc: AppDocument | null
): Record<string, unknown> | null =>
  doc === null ? null : (doc as unknown as Record<string, unknown>);
