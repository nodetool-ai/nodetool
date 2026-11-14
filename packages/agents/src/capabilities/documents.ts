/**
 * The `documents` capability module — PDF extraction and in-process document
 * conversion (`document-conversion.ts`).
 *
 * Five capabilities that used to be five `Tool` subclasses in
 * `pdf-tools.ts`. Their wire names are unchanged; a belt builds all five from
 * `documents.specs.ts` by name.
 *
 * The PDF parser (`@llamaindex/liteparse`) is imported inside the extraction
 * helper, as it always was — loading this module costs a handful of node
 * builtins and nothing else. It is an optional package the desktop app
 * installs on first use ("PDF Libraries").
 *
 * Design: docs/tool-class-retirement-design.md § "PRs 4–9 — remaining
 * namespaces".
 */

import {
  readFile,
  writeFile,
  mkdir,
  lstat,
  realpath
} from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { loadMediaRefBytes } from "@nodetool-ai/runtime";
import type { ProcessingContext, Workspace } from "@nodetool-ai/runtime";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  extractPdfTextSpec,
  extractPdfTablesSpec,
  convertPdfToMarkdownSpec,
  convertMarkdownToPdfSpec,
  convertDocumentSpec
} from "./documents.specs.js";
import { isNonBlankString, isString } from "../utils/type-guards.js";
import {
  MAX_HOST_INPUT_BYTES,
  importOptionalLibrary
} from "../host-modules/limits.js";
import { convertDocumentBytes } from "./document-conversion.js";
import {
  isStorageReference,
  ownedStorageReference
} from "./storage-reference.js";

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

/**
 * The run's workspace when no folder backs it: a cloud deployment's
 * storage-backed workspace. `resolveWorkspacePath` needs a real directory and
 * throws on one of these, so its files go through the `Workspace` interface.
 */
function virtualWorkspace(context: ProcessingContext): Workspace | null {
  const workspace = context.workspace;
  return workspace && workspace.localDir === null && !context.workspaceDir
    ? workspace
    : null;
}

/** True when the run has no workspace of any kind to write a file into. */
function hasNoWorkspace(context: ProcessingContext): boolean {
  return context.workspace == null && context.workspaceDir == null;
}

/**
 * Whether a document argument names an asset or a stored file rather than a
 * workspace path. A PDF attached in chat reaches the model as
 * `asset://<id>.pdf`, and a cloud chat has no workspace folder to copy it to.
 */
function isAssetReference(value: string): boolean {
  return value.startsWith("asset://") || isStorageReference(value);
}

/**
 * Read a document argument: an `asset://` URI or storage key from the asset
 * store (owner-checked), a file in a virtual workspace through the
 * `Workspace` interface, or a file in a local workspace with the
 * symlink-resolved containment check.
 */
async function readDocumentBytes(
  run: CapabilityRun,
  raw: unknown,
  field: string
): Promise<Uint8Array> {
  if (!isNonBlankString(raw)) {
    throw new Error(`${field} is required and must be a non-empty string.`);
  }
  const value = raw.trim();
  const context = run.context;
  if (isAssetReference(value)) {
    const owned = await ownedStorageReference(context, value, run.projectId);
    if (!owned.ok) throw new Error(owned.error);
    const bytes = await loadMediaRefBytes({ uri: owned.ref }, context);
    if (!bytes || bytes.byteLength === 0) {
      throw new Error(
        `${value} resolved to no bytes. Pass the asset:// URI of a file this user owns.`
      );
    }
    return bytes;
  }
  const workspace = virtualWorkspace(context);
  if (workspace) {
    const bytes = await workspace.read(value);
    if (!bytes) throw new Error(`File not found in the workspace: ${value}`);
    return bytes;
  }
  if (hasNoWorkspace(context)) {
    throw new Error(
      `No workspace is assigned, so ${value} cannot be read as a file. ` +
        `Pass the document's asset:// URI instead.`
    );
  }
  const filePath = context.resolveWorkspacePath(value);
  await assertWithinWorkspace(context, filePath);
  return readFile(filePath);
}

/**
 * Write a tool's output file into the workspace and return the path to report
 * back, or null when the run has no workspace to write into.
 */
async function writeDocumentOutput(
  context: ProcessingContext,
  raw: string,
  data: Uint8Array | string,
  contentType: string
): Promise<string | null> {
  const workspace = virtualWorkspace(context);
  if (workspace) {
    const key = workspace.key(raw);
    await workspace.write(key, data, contentType);
    return key;
  }
  if (hasNoWorkspace(context)) return null;
  const outputFile = context.resolveWorkspacePath(raw);
  await assertWithinWorkspace(context, await nearestExisting(dirname(outputFile)));
  await mkdir(dirname(outputFile), { recursive: true });
  await assertWithinWorkspace(context, outputFile);
  if (typeof data === "string") {
    await writeFile(outputFile, data, "utf-8");
  } else {
    await writeFile(outputFile, data);
  }
  return outputFile;
}

/** `path`, or its closest ancestor that exists. */
async function nearestExisting(path: string): Promise<string> {
  let current = path;
  for (;;) {
    try {
      await lstat(current);
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) return current;
      current = parent;
    }
  }
}

/** Why an output file was returned inline instead of written. */
const NO_WORKSPACE_NOTE =
  "No workspace is assigned, so output_file was not written. The result is returned inline.";

interface PdfExtraction {
  /** Per-page text arrays (one entry per page). */
  pages: string[];
  numPages: number;
}

/**
 * Extract text from a PDF buffer using @llamaindex/liteparse.
 * Returns per-page text so callers can slice by page range.
 */
async function extractPdfPages(buffer: Uint8Array): Promise<PdfExtraction> {
  const { LiteParse } = await importOptionalLibrary<
    typeof import("@llamaindex/liteparse")
  >("documents", "@llamaindex/liteparse", "pdf-js");
  const parser = new LiteParse({ ocrEnabled: false });
  const result = await parser.parse(Buffer.from(buffer), true);
  const pages = result.pages.map((p) => p.text);
  return { pages, numPages: result.pages.length };
}

// ---------------------------------------------------------------------------
// extract_pdf_text
// ---------------------------------------------------------------------------

const extractPdfText: CapabilityExport = {
  spec: extractPdfTextSpec,
  impl: async (run, params) => {
    try {
      const buffer = await readDocumentBytes(run, params["path"], "path");
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
    try {
      const buffer = await readDocumentBytes(run, params["path"], "path");
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

      const requested = params["output_file"];
      if (!isNonBlankString(requested)) return { tables: allTables };
      const outputFile = await writeDocumentOutput(
        run.context,
        requested,
        JSON.stringify(allTables),
        "application/json"
      );
      return outputFile === null
        ? { tables: allTables, note: NO_WORKSPACE_NOTE }
        : { output_file: outputFile };
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
    try {
      const buffer = await readDocumentBytes(
        run,
        params["input_file"],
        "input_file"
      );
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

      const requested = params["output_file"];
      if (!isNonBlankString(requested)) return { markdown: mdText };
      const outputFile = await writeDocumentOutput(
        run.context,
        requested,
        mdText,
        "text/markdown"
      );
      return outputFile === null
        ? { markdown: mdText, note: NO_WORKSPACE_NOTE }
        : { output_file: outputFile };
    } catch (e) {
      return { error: String(e instanceof Error ? e.message : e) };
    }
  }
};

// ---------------------------------------------------------------------------
// convert_markdown_to_pdf / convert_document
// ---------------------------------------------------------------------------

/**
 * Read `input_file`, convert it in process, and write `output_file` into the
 * workspace. The input may also be an `asset://` URI.
 */
async function convertWorkspaceFile(
  run: CapabilityRun,
  params: Record<string, unknown>,
  fromFormat: string,
  toFormat: string
): Promise<Record<string, unknown>> {
  try {
    const input = await readDocumentBytes(run, params["input_file"], "input_file");
    if (input.byteLength > MAX_HOST_INPUT_BYTES) {
      throw new Error(
        `${String(params["input_file"])} is ${input.byteLength} bytes; conversion accepts at most ${MAX_HOST_INPUT_BYTES}`
      );
    }
    const output = await convertDocumentBytes(input, fromFormat, toFormat);
    const requested = params["output_file"];
    if (!isNonBlankString(requested)) {
      throw new Error("output_file is required and must be a non-empty string.");
    }
    const outputFile = await writeDocumentOutput(
      run.context,
      requested,
      output,
      "application/octet-stream"
    );
    if (outputFile === null) {
      throw new Error(
        "No workspace is assigned, so the converted file has nowhere to go. Configure a workspace first."
      );
    }
    return { output_file: outputFile, status: "success" };
  } catch (e) {
    return { error: String(e instanceof Error ? e.message : e) };
  }
}

const convertMarkdownToPdf: CapabilityExport = {
  spec: convertMarkdownToPdfSpec,
  impl: async (run, params) =>
    convertWorkspaceFile(run, params, "markdown", "pdf")
};

const convertDocument: CapabilityExport = {
  spec: convertDocumentSpec,
  impl: async (run, params) =>
    convertWorkspaceFile(
      run,
      params,
      isString(params["from_format"]) ? params["from_format"] : "markdown",
      isString(params["to_format"]) ? params["to_format"] : "pdf"
    )
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
