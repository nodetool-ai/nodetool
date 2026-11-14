/**
 * The PDF tools on a host with no local workspace folder: a cloud chat, where
 * the workspace is storage-backed or absent and a PDF the user attached
 * arrives as an `asset://` URI. `resolveWorkspacePath` throws there ("No
 * workspace is assigned"), so these reads and writes must not reach it or
 * `node:fs`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessingContext, Workspace } from "@nodetool-ai/runtime";
import { createCapabilityRun } from "../src/capabilities/invoke.js";
import {
  convertPdfToMarkdown,
  extractPdfTables,
  extractPdfText
} from "../src/capabilities/documents.js";
import type { CapabilityGate } from "../src/capabilities/types.js";

const { mockParse } = vi.hoisted(() => ({ mockParse: vi.fn() }));

vi.mock("@llamaindex/liteparse", () => ({
  LiteParse: class {
    parse(...args: unknown[]) {
      return mockParse(...args);
    }
  }
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  realpath: vi.fn(),
  lstat: vi.fn()
}));

const gate: CapabilityGate = {
  mode: "auto",
  sessionAllow: new Set<string>(),
  requestApproval: async () => "allow"
};

const PDF_BYTES = new TextEncoder().encode("%PDF-1.7 fake");

/** A storage-backed workspace: a map of keys, no folder. */
function memoryWorkspace(files: Record<string, Uint8Array | string> = {}) {
  const store = new Map(Object.entries(files));
  const workspace = {
    localDir: null,
    key: (path: string) => path.replace(/^\/?workspace\//, "").replace(/^\//, ""),
    read: vi.fn(async (path: string) => {
      const value = store.get(workspace.key(path));
      if (value === undefined) return null;
      return typeof value === "string" ? new TextEncoder().encode(value) : value;
    }),
    write: vi.fn(async (path: string, data: Uint8Array | string) => {
      store.set(workspace.key(path), data);
    })
  };
  return { workspace, store };
}

function cloudContext(opts: {
  workspace?: unknown;
  assets?: Record<string, Uint8Array>;
  ownedAssetIds?: string[];
}): ProcessingContext {
  const assets = opts.assets ?? {};
  return {
    workspace: (opts.workspace ?? null) as Workspace | null,
    workspaceDir: null,
    resolveWorkspacePath: () => {
      throw new Error(
        "No workspace is assigned. File operations require a user-defined workspace."
      );
    },
    resolveAssetBytes: vi.fn(async (uri: string) => ({
      bytes: assets[uri] ?? null
    })),
    hasModelInterface: (name: string) => name === "getAssetInfo",
    getAssetInfo: async (id: string) =>
      (opts.ownedAssetIds ?? []).includes(id) ? { id } : null
  } as unknown as ProcessingContext;
}

function runFor(context: ProcessingContext) {
  return createCapabilityRun({ context, gate });
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockParse.mockResolvedValue({
    pages: [{ text: "Page one" }, { text: "Page two" }],
    text: "Page one\nPage two"
  });
});

describe("PDF tools with no workspace", () => {
  const assetUri = "asset://0123456789abcdef0123456789abcdef.pdf";

  it("extracts text from an attached PDF by its asset:// URI", async () => {
    const context = cloudContext({ assets: { [assetUri]: PDF_BYTES } });
    const result = await extractPdfText.impl(runFor(context), {
      path: assetUri
    });
    expect(result).toEqual({ text: "Page one\nPage two" });
    expect(context.resolveAssetBytes).toHaveBeenCalledWith(assetUri, {
      requireOwnedAsset: true
    });
    const { readFile } = await import("node:fs/promises");
    expect(readFile).not.toHaveBeenCalled();
  });

  it("returns Markdown inline when output_file is omitted", async () => {
    const context = cloudContext({ assets: { [assetUri]: PDF_BYTES } });
    const result = await convertPdfToMarkdown.impl(runFor(context), {
      input_file: assetUri
    });
    expect(result).toEqual({ markdown: "Page one\nPage two" });
  });

  it("returns Markdown inline with a note when output_file has nowhere to go", async () => {
    const context = cloudContext({ assets: { [assetUri]: PDF_BYTES } });
    const result = (await convertPdfToMarkdown.impl(runFor(context), {
      input_file: assetUri,
      output_file: "doc.md"
    })) as Record<string, unknown>;
    expect(result["markdown"]).toBe("Page one\nPage two");
    expect(result["note"]).toMatch(/No workspace is assigned/);
    const { writeFile } = await import("node:fs/promises");
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("returns tables inline when there is no workspace", async () => {
    mockParse.mockResolvedValue({
      pages: [{ text: "Name   Age\nAlice   30\nBob   25" }],
      text: ""
    });
    const context = cloudContext({ assets: { [assetUri]: PDF_BYTES } });
    const result = (await extractPdfTables.impl(runFor(context), {
      path: assetUri
    })) as Record<string, unknown>;
    expect(result["tables"]).toEqual([
      {
        page: 0,
        rows: 3,
        columns: 2,
        content: [
          ["Name", "Age"],
          ["Alice", "30"],
          ["Bob", "25"]
        ]
      }
    ]);
  });

  it("names the asset:// form when given a plain path", async () => {
    const context = cloudContext({});
    const result = (await extractPdfText.impl(runFor(context), {
      path: "report.pdf"
    })) as Record<string, unknown>;
    expect(result["error"]).toMatch(/asset:\/\/ URI/);
  });

  it("refuses a storage key for an asset this user does not own", async () => {
    const context = cloudContext({ ownedAssetIds: [] });
    const result = (await extractPdfText.impl(runFor(context), {
      path: "/api/storage/fedcba9876543210fedcba9876543210.pdf"
    })) as Record<string, unknown>;
    expect(result["error"]).toMatch(/not found among this user's assets/);
    expect(mockParse).not.toHaveBeenCalled();
  });
});

describe("PDF tools on a storage-backed workspace", () => {
  it("reads the PDF and writes the Markdown through the Workspace", async () => {
    const { workspace, store } = memoryWorkspace({ "docs/report.pdf": PDF_BYTES });
    const context = cloudContext({ workspace });
    const result = await convertPdfToMarkdown.impl(runFor(context), {
      input_file: "/workspace/docs/report.pdf",
      output_file: "docs/report.md",
      start_page: 1
    });
    expect(result).toEqual({ output_file: "docs/report.md" });
    expect(store.get("docs/report.md")).toBe("Page two");
    expect(workspace.write).toHaveBeenCalledWith(
      "docs/report.md",
      "Page two",
      "text/markdown"
    );
    const { readFile, writeFile } = await import("node:fs/promises");
    expect(readFile).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("reports a missing workspace file as an error", async () => {
    const { workspace } = memoryWorkspace();
    const context = cloudContext({ workspace });
    const result = (await extractPdfText.impl(runFor(context), {
      path: "missing.pdf"
    })) as Record<string, unknown>;
    expect(result["error"]).toBe("File not found in the workspace: missing.pdf");
  });
});
