/**
 * Storage model for an app: a Puck {@link Data} document plus a version tag.
 * Persisted on `workflow.settings` as a JSON string (settings already accepts
 * arbitrary JSON, so no backend change is needed).
 */
import type { Data } from "@puckeditor/core";

export const APP_DATA_VERSION = 2 as const;
export const APP_DATA_SETTINGS_KEY = "__appbuilder__" as const;

export interface AppDocument {
  version: typeof APP_DATA_VERSION;
  data: Data;
}

export const createEmptyData = (): Data => ({
  root: { props: {} },
  content: [],
  zones: {}
});

export const createEmptyDocument = (title?: string): AppDocument => ({
  version: APP_DATA_VERSION,
  data: {
    root: { props: title ? { title } : {} },
    content: [],
    zones: {}
  }
});

const isData = (value: unknown): value is Data => {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Record<string, unknown>;
  return typeof d.root === "object" && d.root !== null && Array.isArray(d.content);
};

/** Validate an unknown value into a Puck Data document, or null. */
export const parseAppDocument = (value: unknown): AppDocument | null => {
  if (typeof value !== "object" || value === null) return null;
  const doc = value as Record<string, unknown>;
  if (!isData(doc.data)) return null;
  return { version: APP_DATA_VERSION, data: doc.data };
};

/** True when the document has at least one placed component. */
export const isRenderableData = (data: Data | null | undefined): data is Data =>
  Boolean(data && Array.isArray(data.content) && data.content.length > 0);
