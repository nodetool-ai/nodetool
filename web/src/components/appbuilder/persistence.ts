/**
 * Loads and saves an app's document on a workflow.
 *
 * The document lives in the first-class `workflow.app_doc` field. Legacy
 * `{ version, data }` documents still read: the parser lifts them into an
 * application document with one operation bound to the host workflow.
 */
import type { Data } from "@puckeditor/core";
import { Workflow } from "../../stores/ApiTypes";
import { AppDocument, parseApplicationDocument } from "./appData";

export const loadAppDocument = (
  workflow?: Workflow | null
): AppDocument | null => {
  const doc = workflow?.app_doc;
  if (doc && typeof doc === "object") {
    return parseApplicationDocument(doc, { hostWorkflowId: workflow?.id });
  }
  return null;
};

export const loadAppData = (workflow?: Workflow | null): Data | null =>
  (loadAppDocument(workflow)?.ui as Data | undefined) ?? null;

export const hasAppSpec = (workflow?: Workflow | null): boolean => {
  const data = loadAppData(workflow);
  return Boolean(data && data.content.length > 0);
};

/** The `app_doc` field value for a workflow update (or null to clear it). */
export const toAppDocField = (
  doc: AppDocument | null
): Record<string, unknown> | null =>
  doc === null
    ? null
    : {
        schemaVersion: doc.schemaVersion,
        ui: doc.ui,
        operations: doc.operations,
        resources: doc.resources,
        variables: doc.variables,
        ...(doc.theme ? { theme: doc.theme } : {})
      };
