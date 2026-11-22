/**
 * The `text-documents` module's specs — data only, no implementation.
 *
 * A document is a Markdown file in a project folder, the file the document
 * editor opens. These tools read and change it with no editor open (PRD
 * R16). An open editor shows each change without a reload.
 */

import type { CapabilitySpec } from "./types.js";

const documentTarget = {
  asset_id: {
    type: "string",
    description:
      "The document's asset id (full or the 12-character short id)."
  },
  path: {
    type: "string",
    description:
      "The document's path in the project folder, such as notes/plan.md. Used when asset_id is absent."
  }
} as const;

export const createDocumentSpec: CapabilitySpec = {
  name: "create_document",
  description:
    "Create a Markdown document in the project folder and return its asset_id " +
    "and path. The name gets a .md extension when it has none. A name that " +
    "exists gets a numbered copy. Use edit_document to change it later.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "File name, such as Launch plan.md." },
      content: { type: "string", description: "The Markdown content." },
      directory: {
        type: "string",
        description: "Directory in the project folder. Defaults to the root."
      },
      project_id: {
        type: "string",
        description: "Project to create it in. Defaults to the run's project."
      }
    },
    required: ["name", "content"],
    additionalProperties: false
  },
  category: "write",
  userMessage: (params) => `Creating document ${String(params["name"])}`
};

export const readDocumentSpec: CapabilitySpec = {
  name: "read_document",
  description:
    "Read a Markdown document. Returns asset_id, name, path, updated_at and " +
    "the full Markdown content.",
  inputSchema: {
    type: "object",
    properties: { ...documentTarget },
    additionalProperties: false
  },
  category: "read",
  userMessage: () => "Reading a document"
};

export const editDocumentSpec: CapabilitySpec = {
  name: "edit_document",
  description:
    "Change a Markdown document. Pass edits, a list of exact-text " +
    "replacements applied in order (old_text must occur once unless " +
    "replace_all is set), or content to replace the whole document, or " +
    "append to add text at the end. The content before the first change of " +
    "this turn or run is kept as a version, so the user can restore it. " +
    "Read the document first so old_text matches.",
  inputSchema: {
    type: "object",
    properties: {
      ...documentTarget,
      edits: {
        type: "array",
        items: {
          type: "object",
          properties: {
            old_text: { type: "string" },
            new_text: { type: "string" },
            replace_all: { type: "boolean" }
          },
          required: ["old_text", "new_text"],
          additionalProperties: false
        }
      },
      content: {
        type: "string",
        description: "The whole new document. Exclusive with edits and append."
      },
      append: {
        type: "string",
        description: "Markdown to add at the end, as a new block."
      }
    },
    additionalProperties: false
  },
  category: "write",
  userMessage: () => "Editing a document"
};

export const listDocumentVersionsSpec: CapabilitySpec = {
  name: "list_document_versions",
  description:
    "List a document's stored versions, newest first: version number, name, " +
    "save_type (agent_turn, workflow_run, manual, autosave, restore), " +
    "cause_id and created_at. Content is not included.",
  inputSchema: {
    type: "object",
    properties: { ...documentTarget },
    additionalProperties: false
  },
  category: "read",
  userMessage: () => "Listing document versions"
};

export const createDocumentVersionSpec: CapabilitySpec = {
  name: "create_document_version",
  description:
    "Store the document's current content as a named version the user can " +
    "restore later.",
  inputSchema: {
    type: "object",
    properties: {
      ...documentTarget,
      name: { type: "string", description: "A short label for the version." }
    },
    additionalProperties: false
  },
  category: "write",
  userMessage: () => "Saving a document version"
};

export const restoreDocumentVersionSpec: CapabilitySpec = {
  name: "restore_document_version",
  description:
    "Restore a stored version of a document. The current content is kept as " +
    "a new version first, so the restore can be undone.",
  inputSchema: {
    type: "object",
    properties: {
      ...documentTarget,
      version: {
        type: "integer",
        description: "The version number list_document_versions reported."
      }
    },
    required: ["version"],
    additionalProperties: false
  },
  category: "write",
  userMessage: (params) => `Restoring document version ${String(params["version"])}`
};

/** Every spec this module declares, in declaration order. */
export const textDocumentsSpecs: readonly CapabilitySpec[] = [
  createDocumentSpec,
  readDocumentSpec,
  editDocumentSpec,
  listDocumentVersionsSpec,
  createDocumentVersionSpec,
  restoreDocumentVersionSpec
];
