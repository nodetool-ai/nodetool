/**
 * The `files` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `files.ts`, so nothing the
 * implementations pull in reaches the entry graph. `files.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";
import { Tool } from "../tools/base-tool.js";
import { isObjectLike } from "../utils/type-guards.js";

export const READ_FILE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    file_path: {
      type: "string",
      description: "Workspace-relative path to the file (POSIX-style)."
    },
    offset: {
      type: "number",
      description: "1-indexed line number to start reading from. Defaults to 1."
    },
    limit: {
      type: "number",
      description: "Number of lines to read. Defaults to 2000."
    }
  },
  required: ["file_path"]
};

export const WRITE_FILE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    file_path: {
      type: "string",
      description: "Workspace-relative path to the file to write."
    },
    content: {
      type: "string",
      description: "Full content to write to the file."
    }
  },
  required: ["file_path", "content"]
};

export const LIST_DIRECTORY_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description:
        "Workspace-relative directory path. Use `.` for the workspace root."
    },
    recursive: {
      type: "boolean",
      description: "Walk subdirectories. Defaults to false."
    }
  },
  required: ["path"]
};

export const EDIT_FILE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "Path to the file to modify, relative to the workspace"
    },
    old_string: {
      type: "string",
      description:
        "The exact text to find and replace. Pass an empty string to create a new file."
    },
    new_string: {
      type: "string",
      description: "The text to replace it with (must differ from old_string)"
    },
    replace_all: {
      type: "boolean",
      description:
        "Replace all occurrences of old_string (default false — only first match)",
      default: false
    }
  },
  required: ["path", "old_string", "new_string"]
};

export const GLOB_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    pattern: {
      type: "string",
      description: 'Glob pattern to match files (e.g. "**/*.ts", "src/**/*.js")'
    },
    path: {
      type: "string",
      description:
        "Directory to search in, relative to workspace (default: workspace root)"
    }
  },
  required: ["pattern"]
};

export const GREP_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    pattern: {
      type: "string",
      description: "Regular expression pattern to search for"
    },
    path: {
      type: "string",
      description:
        "Directory or file to search in, relative to workspace (default: workspace root)"
    },
    include: {
      type: "string",
      description: 'Glob pattern to filter files (e.g. "*.ts", "*.{js,jsx}")'
    },
    context: {
      type: "number",
      description:
        "Number of lines to show before and after each match (default: 0)"
    },
    case_insensitive: {
      type: "boolean",
      description: "Case-insensitive search (default: false)"
    },
    max_results: {
      type: "number",
      description: "Maximum number of matches to return (default: 100)"
    }
  },
  required: ["pattern"]
};

export const TODO_WRITE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    todos: {
      type: "array",
      description:
        "Complete todo list for this session. Replaces any prior list.",
      items: {
        type: "object",
        properties: {
          content: {
            type: "string",
            minLength: 1,
            description: "Short description of the task (one sentence)."
          },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "completed"],
            description: "Current status of the task."
          }
        },
        required: ["content", "status"],
        additionalProperties: false
      }
    }
  },
  required: ["todos"],
  additionalProperties: false
};

export const readFileCapabilitySpec: CapabilitySpec = {
  name: "read_file",
  description:
    "Reads a text file from the agent workspace. Returns the file contents " +
    "with line numbers in `cat -n` format. By default reads up to 2000 " +
    "lines from the start. Use `offset` and `limit` to read a specific " +
    "window. Cannot read binary files. Paths are workspace-relative storage " +
    "keys; the workspace adapter handles backend resolution (local FS, S3, " +
    "Supabase).",
  inputSchema: READ_FILE_SCHEMA,
  category: "read",
  userMessage: (params) => {
    const path = params["file_path"];
    const msg = `Reading ${path}`;
    return msg.length > 80 ? "Reading a file" : msg;
  }
};

export const writeFileCapabilitySpec: CapabilitySpec = {
  name: "write_file",
  description:
    "Writes a file in the agent workspace. Overwrites the file if it " +
    "exists. If the file already exists, you MUST call `read_file` on it " +
    "first in this session so you know what you're about to replace. New " +
    "files don't require a prior read. Paths are workspace-relative storage " +
    "keys.",
  inputSchema: WRITE_FILE_SCHEMA,
  category: "write",
  userMessage: (params) => {
    const path = params["file_path"] ?? "";
    const msg = `Writing ${path}`;
    return msg.length > 160 ? "Writing a file" : msg;
  }
};

export const listDirectorySpec: CapabilitySpec = {
  name: "list_directory",
  description:
    "Lists files and subdirectories in a workspace directory. Returns one " +
    "entry per line: directories end with `/`, files show their size in " +
    'bytes after the name. Use `path: "."` to list the workspace root.',
  inputSchema: LIST_DIRECTORY_SCHEMA,
  category: "read",
  userMessage: (params) => `Listing ${String(params["path"] ?? ".")}`
};

export const editFileSpec: CapabilitySpec = {
  name: "edit_file",
  description:
    "Perform exact string replacements in a file. The old_string must match exactly " +
    "(including whitespace and indentation). Use replace_all to change every occurrence. " +
    "Prefer this over write_file when modifying existing files — it only sends the diff. " +
    "To create a new file, pass an empty old_string and the full file contents as new_string.",
  inputSchema: EDIT_FILE_SCHEMA,
  category: "write",
  userMessage: (params) => `Editing file ${String(params["path"] ?? "")}`
};

export const globSpec: CapabilitySpec = {
  name: "glob",
  description:
    "Find files matching a glob pattern within the workspace. " +
    'Supports patterns like "**/*.ts", "src/**/*.js", "*.{ts,tsx}". ' +
    "Returns matching file paths sorted alphabetically.",
  inputSchema: GLOB_SCHEMA,
  category: "read",
  userMessage: (params) =>
    `Searching for files: ${String(params["pattern"] ?? "")}`
};

export const grepSpec: CapabilitySpec = {
  name: "grep",
  description:
    "Search file contents for lines matching a regex pattern within the workspace. " +
    "Returns matching lines with file paths, line numbers, and optional context lines. " +
    'Use the include parameter to filter files (e.g. "*.ts", "*.{js,jsx}").',
  inputSchema: GREP_SCHEMA,
  category: "read",
  userMessage: (params) => `Searching for: ${String(params["pattern"] ?? "")}`
};

export const todoWriteSpec: CapabilitySpec = {
  name: "todo_write",
  description:
    "Maintain a checklist of work for the current chat session. Pass the FULL " +
    "todo list on every call (this replaces, not appends). Use to plan multi-" +
    "step tasks, track progress, and surface what's done vs. pending to the " +
    "user — the list is rendered as a live sidebar in the chat UI. Keep items " +
    "concise (one short sentence each). Mark exactly one item as `in_progress` " +
    "at a time; move it to `completed` before starting the next.",
  inputSchema: TODO_WRITE_SCHEMA,
  category: "read",
  userMessage: (params) => {
    // The template reads the LLM-authored `_message` first, as the class did:
    // `Tool.userMessage` handled that itself before the port.
    const llm = Tool.extractMessage(params);
    if (llm) return llm;
    const raw = params["todos"];
    if (!Array.isArray(raw)) return "Updating todo list";
    const total = raw.length;
    const inProgress = raw.find(
      (t) =>
        isObjectLike(t) &&
        (t as Record<string, unknown>).status === "in_progress"
    ) as { content?: string } | undefined;
    if (inProgress?.content) {
      return `Working on: ${inProgress.content}`;
    }
    return `Updating todo list (${total} item${total === 1 ? "" : "s"})`;
  }
};

/** Every spec this module declares, in declaration order. */
export const filesSpecs: readonly CapabilitySpec[] = [
  readFileCapabilitySpec,
  writeFileCapabilitySpec,
  listDirectorySpec,
  editFileSpec,
  globSpec,
  grepSpec,
  todoWriteSpec
];
