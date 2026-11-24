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

export const renameDocumentVersionSpec: CapabilitySpec = {
  name: "rename_document_version",
  description:
    "Rename a stored version (snapshot) of a Markdown document. Pass null or " +
    "an empty string to clear its label.",
  inputSchema: {
    type: "object",
    properties: {
      ...documentTarget,
      version: {
        type: "integer",
        description: "The version number list_document_versions reported."
      },
      name: {
        type: ["string", "null"],
        description: "The new label for the version, or null to clear it."
      }
    },
    required: ["version"],
    additionalProperties: false
  },
  category: "write",
  userMessage: (params) => `Renaming document version ${String(params["version"])}`
};

export const deleteDocumentVersionSpec: CapabilitySpec = {
  name: "delete_document_version",
  description:
    "Permanently delete a stored version (snapshot) of a Markdown document " +
    "without changing the document's current content. This cannot be undone " +
    "and always prompts the user for explicit approval.",
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
  alwaysAsk: true,
  userMessage: (params) => `Deleting document version ${String(params["version"])}`
};

export const restoreDocumentVersionSpec: CapabilitySpec = {
  name: "restore_document_version",
  description:
    "Restore a stored version of a document. Preserves any overwritten draft " +
    "in history first and records the restored content as the new latest version.",
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

export const importDocumentSpec: CapabilitySpec = {
  name: "import_document",
  description:
    "Import a .md, .txt, .html, .docx or .pdf file as a new Markdown " +
    "document beside it, and return the document's asset_id and path. DOCX " +
    "keeps headings, lists, tables, links and emphasis. PDF keeps the text " +
    "only. The source file is not changed.",
  inputSchema: {
    type: "object",
    properties: {
      asset_id: {
        type: "string",
        description: "The source file's asset id (full or the 12-character short id)."
      },
      path: {
        type: "string",
        description:
          "The source file's path in the project folder, such as inbox/brief.docx. Used when asset_id is absent."
      },
      name: {
        type: "string",
        description: "Name of the new document. Defaults to the source file's name."
      }
    },
    additionalProperties: false
  },
  category: "write",
  userMessage: () => "Importing a document"
};

export const exportDocumentSpec: CapabilitySpec = {
  name: "export_document",
  description:
    "Export a Markdown document as an .md, .txt, .pdf or .html file in the " +
    "project folder (defaulting to the document's folder), and return the new " +
    "file's asset_id and path. A name that exists gets a numbered copy.",
  inputSchema: {
    type: "object",
    properties: {
      ...documentTarget,
      format: {
        type: "string",
        enum: ["md", "txt", "pdf", "html"],
        description: "The output file format."
      },
      directory: {
        type: "string",
        description:
          "Destination directory in the project folder. Defaults to the document's folder."
      },
      name: {
        type: "string",
        description:
          "Base name for the exported file (matching extension optional). Defaults to the document's name."
      }
    },
    required: ["format"],
    additionalProperties: false
  },
  category: "write",
  userMessage: (params) => `Exporting a document as ${String(params["format"]).toUpperCase()}`
};

export const importGoogleDocSpec: CapabilitySpec = {
  name: "import_google_doc",
  description:
    "Import a Google Doc as a new Markdown document in the project folder, " +
    "keeping headings, lists, tables, links and emphasis. Needs the user's " +
    "Google sign-in. Returns the document's asset_id and path.",
  inputSchema: {
    type: "object",
    properties: {
      document_id: {
        type: "string",
        description: "The Google Doc's id, or its docs.google.com URL."
      },
      directory: {
        type: "string",
        description: "Directory in the project folder. Defaults to the root."
      },
      project_id: {
        type: "string",
        description: "Project to create it in. Defaults to the run's project."
      }
    },
    required: ["document_id"],
    additionalProperties: false
  },
  category: "external",
  userMessage: () => "Importing a Google Doc"
};

export const exportGoogleDocSpec: CapabilitySpec = {
  name: "export_google_doc",
  description:
    "Export a Markdown document to a new Google Doc in the user's Drive, " +
    "keeping headings, lists, tables, links and emphasis. Needs the user's " +
    "Google sign-in. Returns the doc's id and URL.",
  inputSchema: {
    type: "object",
    properties: {
      ...documentTarget,
      title: {
        type: "string",
        description: "Title of the Google Doc. Defaults to the document's name."
      }
    },
    additionalProperties: false
  },
  category: "external",
  userMessage: () => "Exporting a document to Google Docs"
};

/** Every spec this module declares, in declaration order. */
export const textDocumentsSpecs: readonly CapabilitySpec[] = [
  createDocumentSpec,
  readDocumentSpec,
  editDocumentSpec,
  listDocumentVersionsSpec,
  createDocumentVersionSpec,
  renameDocumentVersionSpec,
  deleteDocumentVersionSpec,
  restoreDocumentVersionSpec,
  importDocumentSpec,
  exportDocumentSpec,
  importGoogleDocSpec,
  exportGoogleDocSpec
];
