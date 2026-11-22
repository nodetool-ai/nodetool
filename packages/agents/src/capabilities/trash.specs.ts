/**
 * The `trash` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `trash.ts`, so nothing the
 * implementation pulls in reaches the entry graph.
 */

import type { CapabilitySpec } from "./types.js";

/** The kinds a server keeps for their restore period. */
export const DELETED_DOCUMENT_KINDS = ["workflow", "timeline", "project"] as const;

export const listDeletedDocumentsSpec: CapabilitySpec = {
  name: "list_deleted_documents",
  description:
    "List your deleted workflows, timelines and projects that can still be " +
    "restored, newest first. Each entry gives its kind, document_id, name, " +
    "deleted_at and purge_at, the time after which it is gone for good. A " +
    "server that keeps no deleted documents returns an empty list.",
  inputSchema: {
    type: "object",
    properties: {
      project_id: {
        type: "string",
        description:
          "Only documents that were in this project when they were deleted."
      }
    },
    additionalProperties: false
  },
  category: "read",
  userMessage: () => "Listing deleted documents"
};

export const restoreDeletedDocumentSpec: CapabilitySpec = {
  name: "restore_deleted_document",
  description:
    "Restore one of your deleted documents under its old id. Take kind and " +
    "document_id from list_deleted_documents. A document whose project is " +
    "also deleted cannot come back until the project is restored first.",
  inputSchema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: [...DELETED_DOCUMENT_KINDS],
        description: "The kind list_deleted_documents reported."
      },
      document_id: {
        type: "string",
        description: "The document_id list_deleted_documents reported."
      }
    },
    required: ["kind", "document_id"],
    additionalProperties: false
  },
  category: "write",
  userMessage: (params) =>
    `Restoring deleted ${String(params["kind"])} ${String(params["document_id"])}`
};

/** Every spec this module declares, in declaration order. */
export const trashSpecs: readonly CapabilitySpec[] = [
  listDeletedDocumentsSpec,
  restoreDeletedDocumentSpec
];
