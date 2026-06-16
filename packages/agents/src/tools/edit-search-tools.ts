/**
 * Claude Code-style tools for agents: Edit, Glob, and Grep.
 *
 * These mirror the standard Claude Code tool semantics:
 * - EditFileTool: exact string replacement in files (like Claude Code's Edit)
 * - GlobTool: file pattern matching (like Claude Code's Glob)
 * - GrepTool: content search with regex (like Claude Code's Grep)
 */

import {
  readFile,
  writeFile,
  readdir,
  stat,
  access
} from "node:fs/promises";
import { join, relative } from "node:path";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";

function resolveSafePath(context: ProcessingContext, rawPath: string): string {
  return context.resolveWorkspacePath(rawPath);
}

// ---------------------------------------------------------------------------
// EditFileTool — exact string replacement in files
// ---------------------------------------------------------------------------

export class EditFileTool extends Tool {
  readonly name = "edit_file";
  readonly description =
    "Perform exact string replacements in a file. The old_string must match exactly " +
    "(including whitespace and indentation). Use replace_all to change every occurrence. " +
    "Prefer this over write_file when modifying existing files — it only sends the diff.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string" as const,
        description: "Path to the file to modify, relative to the workspace"
      },
      old_string: {
        type: "string" as const,
        description: "The exact text to find and replace"
      },
      new_string: {
        type: "string" as const,
        description: "The text to replace it with (must differ from old_string)"
      },
      replace_all: {
        type: "boolean" as const,
        description:
          "Replace all occurrences of old_string (default false — only first match)",
        default: false
      }
    },
    required: ["path", "old_string", "new_string"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const rawPath = params["path"];
    const oldString = params["old_string"];
    const newString = params["new_string"];
    const replaceAll = params["replace_all"] === true;

    if (typeof rawPath !== "string")
      return { success: false, error: "path must be a string" };
    if (typeof oldString !== "string")
      return { success: false, error: "old_string must be a string" };
    if (typeof newString !== "string")
      return { success: false, error: "new_string must be a string" };
    if (oldString === newString)
      return {
        success: false,
        error: "old_string and new_string must be different"
      };

    let filePath: string;
    try {
      filePath = resolveSafePath(context, rawPath);
    } catch (e) {
      return {
        success: false,
        error: String(e instanceof Error ? e.message : e)
      };
    }

    try {
      await access(filePath);
    } catch {
      return { success: false, error: `File not found: ${rawPath}` };
    }

    try {
      const content = await readFile(filePath, "utf-8");

      if (!content.includes(oldString)) {
        return {
          success: false,
          error:
            "old_string not found in file. Make sure the string matches exactly, " +
            "including whitespace and indentation."
        };
      }

      // Count occurrences
      let count = 0;
      let idx = 0;
      while ((idx = content.indexOf(oldString, idx)) !== -1) {
        count++;
        idx += oldString.length;
      }

      if (!replaceAll && count > 1) {
        return {
          success: false,
          error: `old_string matches ${count} locations. Provide more surrounding context ` +
            "to make it unique, or set replace_all to true.",
          match_count: count
        };
      }

      let newContent: string;
      if (replaceAll) {
        newContent = content.split(oldString).join(newString);
      } else {
        // Replace only first occurrence
        const firstIdx = content.indexOf(oldString);
        newContent =
          content.slice(0, firstIdx) +
          newString +
          content.slice(firstIdx + oldString.length);
      }

      await writeFile(filePath, newContent, "utf-8");

      return {
        success: true,
        path: rawPath,
        replacements: replaceAll ? count : 1
      };
    } catch (e) {
      return {
        success: false,
        error: `Failed to edit file: ${String(e)}`
      };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    return `Editing file ${String(params["path"] ?? "")}`;
  }
}

// ---------------------------------------------------------------------------
// GlobTool — file pattern matching
// ---------------------------------------------------------------------------

/** Minimal glob matcher supporting *, **, and ? patterns. */
function globToRegex(pattern: string): RegExp {
  let regexStr = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // ** matches anything including /
        if (pattern[i + 2] === "/") {
          regexStr += "(?:.*/)?";
          i += 3;
        } else {
          regexStr += ".*";
          i += 2;
        }
      } else {
        // * matches anything except /
        regexStr += "[^/]*";
        i++;
      }
    } else if (ch === "?") {
      regexStr += "[^/]";
      i++;
    } else if (ch === "{") {
      // Simple brace expansion: {a,b,c}
      const closeIdx = pattern.indexOf("}", i);
      if (closeIdx === -1) {
        regexStr += "\\{";
        i++;
      } else {
        const alternatives = pattern.slice(i + 1, closeIdx).split(",");
        regexStr +=
          "(?:" + alternatives.map((a) => escapeRegex(a)).join("|") + ")";
        i = closeIdx + 1;
      }
    } else if (".+^$|()[]\\".includes(ch)) {
      regexStr += "\\" + ch;
      i++;
    } else {
      regexStr += ch;
      i++;
    }
  }
  return new RegExp("^" + regexStr + "$");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function walkDir(
  dir: string,
  maxDepth: number,
  depth = 0
): Promise<string[]> {
  if (depth > maxDepth) return [];
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      // Skip hidden dirs and node_modules for performance
      if (
        entry.isDirectory() &&
        (entry.name.startsWith(".") || entry.name === "node_modules")
      ) {
        continue;
      }
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await walkDir(fullPath, maxDepth, depth + 1)));
      } else {
        results.push(fullPath);
      }
    }
  } catch {
    // Permission denied or broken symlink — skip
  }
  return results;
}

export class GlobTool extends Tool {
  readonly name = "glob";
  readonly description =
    "Find files matching a glob pattern within the workspace. " +
    'Supports patterns like "**/*.ts", "src/**/*.js", "*.{ts,tsx}". ' +
    "Returns matching file paths sorted alphabetically.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      pattern: {
        type: "string" as const,
        description:
          'Glob pattern to match files (e.g. "**/*.ts", "src/**/*.js")'
      },
      path: {
        type: "string" as const,
        description:
          "Directory to search in, relative to workspace (default: workspace root)"
      }
    },
    required: ["pattern"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const pattern = params["pattern"];
    const rawPath = params["path"];

    if (typeof pattern !== "string")
      return { success: false, error: "pattern must be a string" };

    let searchDir: string;
    try {
      searchDir = resolveSafePath(
        context,
        typeof rawPath === "string" ? rawPath : "."
      );
    } catch (e) {
      return {
        success: false,
        error: String(e instanceof Error ? e.message : e)
      };
    }

    const maxDepth = pattern.includes("**") ? 20 : 5;

    try {
      const allFiles = await walkDir(searchDir, maxDepth);
      const regex = globToRegex(pattern);
      const matches = allFiles
        .map((f) => relative(searchDir, f))
        .filter((rel) => regex.test(rel))
        .sort();

      return {
        success: true,
        pattern,
        match_count: matches.length,
        files: matches.slice(0, 500) // Cap output size
      };
    } catch (e) {
      return {
        success: false,
        error: `Glob search failed: ${String(e)}`
      };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    return `Searching for files: ${String(params["pattern"] ?? "")}`;
  }
}

// ---------------------------------------------------------------------------
// GrepTool — content search with regex
// ---------------------------------------------------------------------------

export class GrepTool extends Tool {
  readonly name = "grep";
  readonly description =
    "Search file contents for lines matching a regex pattern within the workspace. " +
    "Returns matching lines with file paths, line numbers, and optional context lines. " +
    'Use the include parameter to filter files (e.g. "*.ts", "*.{js,jsx}").';
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      pattern: {
        type: "string" as const,
        description: "Regular expression pattern to search for"
      },
      path: {
        type: "string" as const,
        description:
          "Directory or file to search in, relative to workspace (default: workspace root)"
      },
      include: {
        type: "string" as const,
        description:
          'Glob pattern to filter files (e.g. "*.ts", "*.{js,jsx}")'
      },
      context: {
        type: "number" as const,
        description:
          "Number of lines to show before and after each match (default: 0)"
      },
      case_insensitive: {
        type: "boolean" as const,
        description: "Case-insensitive search (default: false)"
      },
      max_results: {
        type: "number" as const,
        description: "Maximum number of matches to return (default: 100)"
      }
    },
    required: ["pattern"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const pattern = params["pattern"];
    const rawPath = params["path"];
    const include = params["include"];
    const contextLines =
      typeof params["context"] === "number" ? params["context"] : 0;
    const caseInsensitive = params["case_insensitive"] === true;
    const maxResults =
      typeof params["max_results"] === "number" ? params["max_results"] : 100;

    if (typeof pattern !== "string")
      return { success: false, error: "pattern must be a string" };

    let searchDir: string;
    try {
      searchDir = resolveSafePath(
        context,
        typeof rawPath === "string" ? rawPath : "."
      );
    } catch (e) {
      return {
        success: false,
        error: String(e instanceof Error ? e.message : e)
      };
    }

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, caseInsensitive ? "i" : "");
    } catch (e) {
      return {
        success: false,
        error: `Invalid regex: ${String(e)}`
      };
    }

    // Determine if searching a single file or a directory
    let filesToSearch: string[];
    try {
      const info = await stat(searchDir);
      if (info.isFile()) {
        filesToSearch = [searchDir];
      } else {
        // Walk the directory
        const allFiles = await walkDir(searchDir, 20);
        filesToSearch = allFiles;
      }
    } catch {
      return { success: false, error: `Path not found: ${rawPath ?? "."}` };
    }

    // Apply include filter
    if (typeof include === "string") {
      const includeRegex = globToRegex(include);
      filesToSearch = filesToSearch.filter((f) => {
        const rel = relative(searchDir, f);
        const basename = rel.split("/").pop() ?? rel;
        return includeRegex.test(basename) || includeRegex.test(rel);
      });
    }

    // Filter out binary-looking files by extension
    const binaryExts = new Set([
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".bmp",
      ".ico",
      ".svg",
      ".webp",
      ".mp3",
      ".mp4",
      ".wav",
      ".ogg",
      ".avi",
      ".mov",
      ".zip",
      ".tar",
      ".gz",
      ".bz2",
      ".7z",
      ".rar",
      ".pdf",
      ".woff",
      ".woff2",
      ".ttf",
      ".eot",
      ".otf",
      ".so",
      ".dylib",
      ".dll",
      ".exe",
      ".o",
      ".a",
      ".node",
      ".wasm"
    ]);
    filesToSearch = filesToSearch.filter((f) => {
      const ext = f.slice(f.lastIndexOf(".")).toLowerCase();
      return !binaryExts.has(ext);
    });

    interface GrepMatch {
      file: string;
      line: number;
      content: string;
      context_before?: string[];
      context_after?: string[];
    }

    const matches: GrepMatch[] = [];
    let totalMatches = 0;

    for (const file of filesToSearch) {
      if (totalMatches >= maxResults) break;

      let content: string;
      try {
        const buf = await readFile(file);
        // Skip binary files (null byte check)
        if (buf.subarray(0, 512).includes(0)) continue;
        content = buf.toString("utf-8");
      } catch {
        continue;
      }

      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (totalMatches >= maxResults) break;
        if (regex.test(lines[i])) {
          const match: GrepMatch = {
            file: relative(searchDir, file),
            line: i + 1,
            content: lines[i]
          };

          if (contextLines > 0) {
            const start = Math.max(0, i - contextLines);
            const end = Math.min(lines.length - 1, i + contextLines);
            if (start < i) {
              match.context_before = lines.slice(start, i);
            }
            if (end > i) {
              match.context_after = lines.slice(i + 1, end + 1);
            }
          }

          matches.push(match);
          totalMatches++;
        }
      }
    }

    return {
      success: true,
      pattern,
      match_count: matches.length,
      truncated: totalMatches >= maxResults,
      matches
    };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Searching for: ${String(params["pattern"] ?? "")}`;
  }
}
