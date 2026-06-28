/**
 * Loads and saves an app's Puck document on a workflow.
 *
 * The document rides along in `workflow.settings` under a reserved key,
 * serialized as JSON. `settings` round-trips through the workflow create/update
 * API (it accepts arbitrary JSON), so shipping the builder needs no
 * backend/migration work.
 */
import type { Data } from "@puckeditor/core";
import { Workflow } from "../../stores/ApiTypes";
import {
  AppDocument,
  APP_DATA_SETTINGS_KEY,
  parseAppDocument
} from "./appData";

type WorkflowSettings = Workflow["settings"];

export const loadAppDocument = (
  workflow?: Workflow | null
): AppDocument | null => {
  const raw = (
    workflow?.settings as Record<string, unknown> | null | undefined
  )?.[APP_DATA_SETTINGS_KEY];
  if (typeof raw !== "string") return null;
  try {
    return parseAppDocument(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const loadAppData = (workflow?: Workflow | null): Data | null =>
  loadAppDocument(workflow)?.data ?? null;

export const hasAppSpec = (workflow?: Workflow | null): boolean => {
  const data = loadAppData(workflow);
  return Boolean(data && data.content.length > 0);
};

/** Returns new settings with the document embedded (or removed when null). */
export const withAppDocument = (
  settings: WorkflowSettings,
  doc: AppDocument | null
): WorkflowSettings => {
  const next: Record<string, unknown> = { ...(settings ?? {}) };
  if (doc === null) {
    delete next[APP_DATA_SETTINGS_KEY];
  } else {
    next[APP_DATA_SETTINGS_KEY] = JSON.stringify(doc);
  }
  return next as WorkflowSettings;
};
