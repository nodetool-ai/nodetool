/**
 * Storage model for an app: an {@link ApplicationDocument} — a Puck UI
 * document plus operation, resource, and variable bindings — persisted in the
 * `applications` table.
 *
 * Parsing branches on `schemaVersion`: a legacy `{ version, data }` document is
 * lifted into the current shape with one operation bound to the host workflow.
 * The semantics live in `@nodetool-ai/app-runtime`.
 */
import type { Data } from "@puckeditor/core";
import {
  APP_SCHEMA_VERSION,
  createEmptyDocument as createEmptyApplicationDocument,
  createEmptyPuckData,
  parseApplicationDocument,
  type ApplicationDocument
} from "@nodetool-ai/app-runtime";

export { APP_SCHEMA_VERSION, parseApplicationDocument };
export type { ApplicationDocument };

export type AppDocument = ApplicationDocument;

export const createEmptyData = (): Data => createEmptyPuckData() as Data;

export const createEmptyDocument = (title?: string): AppDocument =>
  createEmptyApplicationDocument(title);
