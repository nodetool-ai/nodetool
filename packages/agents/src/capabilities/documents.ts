/**
 * The `documents` capability module — PDF extraction and Pandoc conversion.
 *
 * Five capabilities that used to be five `Tool` subclasses in
 * `pdf-tools.ts`. Wire names, descriptions and schemas are unchanged; a belt
 * builds all five from `documents.specs.ts` by name.
 *
 * The PDF parser (`@llamaindex/liteparse`) is imported inside the extraction
 * helper, as it always was — loading this module costs a handful of node
 * builtins and nothing else.
 *
 * Design: docs/tool-class-retirement-design.md § "PRs 4–9 — remaining
 * namespaces".
 */

import { readFile, writeFile, mkdir, lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { CapabilityExport, CapabilityModule } from "./types.js";
import {
  extractPdfTextSpec,
  extractPdfTablesSpec,
  convertPdfToMarkdownSpec,
  convertMarkdownToPdfSpec,
  convertDocumentSpec
} from "./documents.specs.js";
import { isString } from "../utils/type-guards.js";

const execFileAsync = promisify(execFile);

/**
 * True when `candidate`'s real (symlink-resolved) path stays within the real
 * workspace root. `context.resolveWorkspacePath` only checks containment
 * lexically, so an in-workspace symlink pointing outside the root would
 * otherwise be dereferenced and leak host files. Mirrors the shared helper in
 * edit-search-tools.ts (kept local — that copy is module-private there).
 */
async function isRealPathWithinRoot(
  root: string,
  candidate: string
): Promise<boolean> {
  try {
    const realRoot = await realpath(root);
    const realCandidate = await realpath(candidate);
    if (realCandidate === realRoot) return true;
    const rel = relative(realRoot, realCandidate);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  } catch {
    return false;
  }
}

/**
 * Like {@link isRealPathWithinRoot} but tolerant of a not-yet-created output
 * file: when the candidate does not exist, its parent directory is
 * realpath-checked instead, so writing through a symlinked-out directory is
 * still blocked. Uses lstat (not access) so a dangling in-workspace symlink is
 * treated as existing-but-out-of-root rather than absent.
 */
async function isWriteTargetWithinRoot(
  root: string,
  candidate: string
): Promise<boolean> {
  if (await isRealPathWithinRoot(root, candidate)) return true;
  const parent = dirname(candidate);
  if (parent === candidate) return false;
  try {
    await lstat(candidate);
    return false;
  } catch {
    return isRealPathWithinRoot(root, parent);
  }
}

/**
 * Verify a workspace-resolved path stays inside the workspace after resolving
 * symlinks, throwing on escape. Uses the not-yet-created-tolerant check for
 * both reads and writes (matching edit-search-tools): a missing read target
 * passes containment here and then fails naturally with the tool's own
 * "not found" error, rather than being mislabeled as an escape.
 */
async function assertWithinWorkspace(
  context: ProcessingContext,
  resolvedPath: string
): Promise<void> {
  const root = context.resolveWorkspacePath(".");
  if (!(await isWriteTargetWithinRoot(root, resolvedPath))) {
    throw new Error(`Path resolves outside the workspace: ${resolvedPath}`);
  }
}

interface PdfExtraction {
  /** Per-page text arrays (one entry per page). */
  pages: string[];
  numPages: number;
}

/**
 * Extract text from a PDF buffer using @llamaindex/liteparse.
 * Returns per-page text so callers can slice by page range.
 */
async function extractPdfPages(buffer: Buffer): Promise<PdfExtraction> {
  const { LiteParse } = await import("@llamaindex/liteparse");
  const parser = new LiteParse({ ocrEnabled: false });
  const result = await parser.parse(buffer, true);
  const pages = result.pages.map((p) => p.text);
  return { pages, numPages: result.pages.length };
}

// ---------------------------------------------------------------------------
// extract_pdf_text
// ---------------------------------------------------------------------------

const extractPdfText: CapabilityExport = {
  spec: extractPdfTextSpec,
  impl: async (run, params) => {
    const context = run.context;
    try {
      const filePath = context.resolveWorkspacePath(params["path"] as string);
      await assertWithinWorkspace(context, filePath);
      const buffer = await readFile(filePath);
      const { pages } = await extractPdfPages(buffer);

      const startPage = (params["start_page"] as number) ?? 0;
      const endPage = (params["end_page"] as number) ?? -1;

      if (startPage === 0 && endPage === -1) {
        return { text: pages.join("\n") };
      }

      const end = endPage === -1 ? pages.length - 1 : endPage;
      const selectedPages = pages.slice(startPage, end + 1);
      return { text: selectedPages.join("\n") };
    } catch (e) {
      return { error: String(e instanceof Error ? e.message : e) };
    }
  }
};

// ---------------------------------------------------------------------------
// extract_pdf_tables
// ---------------------------------------------------------------------------

const extractPdfTables: CapabilityExport = {
  spec: extractPdfTablesSpec,
  impl: async (run, params) => {
    const context = run.context;
    try {
      const filePath = context.resolveWorkspacePath(params["path"] as string);
      const outputFile = context.resolveWorkspacePath(
        params["output_file"] as string
      );
      await assertWithinWorkspace(context, filePath);
      const buffer = await readFile(filePath);
      const { pages } = await extractPdfPages(buffer);

      const startPage = (params["start_page"] as number) ?? 0;
      const endPage = (params["end_page"] as number) ?? -1;

      const end = endPage === -1 ? pages.length - 1 : endPage;

      // Best-effort table extraction: look for lines with consistent
      // column-like separators (multiple spaces or tabs)
      const allTables: Array<Record<string, unknown>> = [];
      for (
        let pageNum = startPage;
        pageNum <= end && pageNum < pages.length;
        pageNum++
      ) {
        const pageText = pages[pageNum] ?? "";
        const lines = pageText
          .split("\n")
          .filter((l: string) => l.trim().length > 0);

        // Detect tabular rows: lines with 2+ segments separated by 2+ spaces
        const tabularLines: string[][] = [];
        for (const line of lines) {
          const cells = line
            .split(/\s{2,}/)
            .filter((c: string) => c.trim().length > 0);
          if (cells.length >= 2) {
            tabularLines.push(cells);
          }
        }

        // Group consecutive tabular lines into tables
        if (tabularLines.length >= 2) {
          allTables.push({
            page: pageNum,
            rows: tabularLines.length,
            columns: Math.max(...tabularLines.map((r) => r.length)),
            content: tabularLines
          });
        }
      }

      await assertWithinWorkspace(context, outputFile);
      const parentDir = dirname(outputFile);
      await mkdir(parentDir, { recursive: true });
      await writeFile(outputFile, JSON.stringify(allTables), "utf-8");

      return { output_file: outputFile };
    } catch (e) {
      return { error: String(e instanceof Error ? e.message : e) };
    }
  }
};

// ---------------------------------------------------------------------------
// convert_pdf_to_markdown
// ---------------------------------------------------------------------------

const convertPdfToMarkdown: CapabilityExport = {
  spec: convertPdfToMarkdownSpec,
  impl: async (run, params) => {
    const context = run.context;
    try {
      const inputFile = context.resolveWorkspacePath(
        params["input_file"] as string
      );
      const outputFile = context.resolveWorkspacePath(
        params["output_file"] as string
      );

      await assertWithinWorkspace(context, inputFile);
      const buffer = await readFile(inputFile);
      const { pages } = await extractPdfPages(buffer);

      const startPage = (params["start_page"] as number) ?? 0;
      const endPage = (params["end_page"] as number) ?? -1;

      let mdText: string;
      if (startPage !== 0 || endPage !== -1) {
        const end = endPage === -1 ? pages.length - 1 : endPage;
        mdText = pages.slice(startPage, end + 1).join("\n");
      } else {
        mdText = pages.join("\n");
      }

      await assertWithinWorkspace(context, outputFile);
      const parentDir = dirname(outputFile);
      await mkdir(parentDir, { recursive: true });
      await writeFile(outputFile, mdText, "utf-8");

      return { output_file: outputFile };
    } catch (e) {
      return { error: String(e instanceof Error ? e.message : e) };
    }
  }
};

// ---------------------------------------------------------------------------
// convert_markdown_to_pdf
// ---------------------------------------------------------------------------

const convertMarkdownToPdf: CapabilityExport = {
  spec: convertMarkdownToPdfSpec,
  impl: async (run, params) => {
    const context = run.context;
    try {
      const inputFile = context.resolveWorkspacePath(
        params["input_file"] as string
      );
      const outputFile = context.resolveWorkspacePath(
        params["output_file"] as string
      );

      const parentDir = dirname(outputFile);
      await mkdir(parentDir, { recursive: true });

      await execFileAsync("pandoc", [
        inputFile,
        "-f",
        "markdown",
        "-t",
        "pdf",
        "-o",
        outputFile
      ]);

      return { output_file: outputFile, status: "success" };
    } catch (e) {
      return { error: String(e instanceof Error ? e.message : e) };
    }
  }
};

// ---------------------------------------------------------------------------
// convert_document
// ---------------------------------------------------------------------------

const convertDocument: CapabilityExport = {
  spec: convertDocumentSpec,
  impl: async (run, params) => {
    const context = run.context;
    try {
      const inputFile = context.resolveWorkspacePath(
        params["input_file"] as string
      );
      const outputFile = context.resolveWorkspacePath(
        params["output_file"] as string
      );
      const fromFormat = (params["from_format"] as string) ?? "markdown";
      const toFormat = (params["to_format"] as string) ?? "pdf";
      let extraArgs = (params["extra_args"] as string[]) ?? [];
      if (isString(extraArgs)) {
        extraArgs = [extraArgs];
      }

      const parentDir = dirname(outputFile);
      await mkdir(parentDir, { recursive: true });

      await execFileAsync("pandoc", [
        inputFile,
        "-f",
        fromFormat,
        "-t",
        toFormat,
        "-o",
        outputFile,
        ...extraArgs
      ]);

      return { output_file: outputFile, status: "success" };
    } catch (e) {
      return { error: String(e instanceof Error ? e.message : e) };
    }
  }
};

/** Every document capability, in the order pdf-tools.ts declared them. */
export const DOCUMENT_CAPABILITIES: readonly CapabilityExport[] = [
  extractPdfText,
  extractPdfTables,
  convertPdfToMarkdown,
  convertMarkdownToPdf,
  convertDocument
];

export const module: CapabilityModule = {
  module: "documents",
  exports: DOCUMENT_CAPABILITIES
};

export {
  extractPdfText,
  extractPdfTables,
  convertPdfToMarkdown,
  convertMarkdownToPdf,
  convertDocument
};
