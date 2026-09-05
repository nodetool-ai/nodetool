/**
 * The `documents` capability module: PDF extraction and Pandoc conversion.
 *
 * Same three questions as every ported namespace — clean module walk, category
 * parity with the map the gate reads, and a Tool built from the spec that renders
 * the spec it was ported from — plus one round trip over a stubbed parser.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { join, resolve } from "node:path";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { toolFromCapability } from "../src/capabilities/adapters.js";
import { createCapabilityRun } from "../src/capabilities/invoke.js";
import {
  capabilityCategoryFor,
  capabilityModuleIssues,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import {
  DOCUMENT_CAPABILITIES,
  module as documentsModule
} from "../src/capabilities/documents.js";
import type {
  CapabilityExport,
  CapabilityGate
} from "../src/capabilities/types.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import type { Tool } from "../src/tools/base-tool.js";

const { mockParse } = vi.hoisted(() => ({ mockParse: vi.fn() }));

vi.mock("@llamaindex/liteparse", () => ({
  LiteParse: class {
    parse(...args: unknown[]) {
      return mockParse(...args);
    }
  }
}));

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  // Non-symlinked filesystem: realpath echoes the path, lstat reports a file.
  realpath: vi.fn(async (p: string) => p),
  lstat: vi.fn(async () => ({
    isDirectory: () => false,
    isSymbolicLink: () => false
  }))
}));

const workspaceDir = "/tmp/test-workspace";

const gate: CapabilityGate = {
  mode: "auto",
  sessionAllow: new Set<string>(),
  requestApproval: async () => "allow"
};

function makeContext(): ProcessingContext {
  return {
    resolveWorkspacePath: (path: string) => resolve(join(workspaceDir, path))
  } as unknown as ProcessingContext;
}

function byName(name: string): CapabilityExport {
  const found = DOCUMENT_CAPABILITIES.find((entry) => entry.spec.name === name);
  if (!found) throw new Error(`no document capability named ${name}`);
  return found;
}

function asTool(entry: CapabilityExport): Tool {
  return toolFromCapability(entry.spec, entry.impl, (context) =>
    createCapabilityRun({ context, gate })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockParse.mockResolvedValue({
    pages: [{ text: "Hello World" }],
    text: "Hello World"
  });
});

describe("documents capability module", () => {
  it("loads from the registry with no issues", async () => {
    const loaded = await loadCapabilityModule("documents");
    expect(loaded).toBe(documentsModule);
    expect(capabilityModuleIssues("documents", loaded)).toEqual([]);
  });

  it("classifies every export exactly as the gate's map does", () => {
    for (const entry of DOCUMENT_CAPABILITIES) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        capabilityCategoryFor(entry.spec.name)
      ]);
    }
  });
});

describe("wire compatibility: a Tool built from the spec", () => {
  const pairs: Array<[Tool, string]> = [
    [toolForCapabilityName("extract_pdf_text"), "extract_pdf_text"],
    [toolForCapabilityName("extract_pdf_tables"), "extract_pdf_tables"],
    [
      toolForCapabilityName("convert_pdf_to_markdown"),
      "convert_pdf_to_markdown"
    ],
    [
      toolForCapabilityName("convert_markdown_to_pdf"),
      "convert_markdown_to_pdf"
    ],
    [toolForCapabilityName("convert_document"), "convert_document"]
  ];

  it.each(pairs)("%o keeps its name, description and schema", (tool, name) => {
    const { spec } = byName(name);
    expect(tool.name).toBe(spec.name);
    expect(tool.description).toBe(spec.description);
    expect(tool.inputSchema).toEqual(spec.inputSchema);
  });

  it("keeps the userMessage templates", () => {
    expect(
      toolForCapabilityName("extract_pdf_text").userMessage({ path: "doc.pdf" })
    ).toBe("Extracting text from doc.pdf...");
    expect(
      toolForCapabilityName("convert_document").userMessage({
        input_file: "a.md",
        output_file: "a.html",
        to_format: "html"
      })
    ).toBe("Converting a.md to a.html (html)...");
  });
});

describe("behaviour through toolFromCapability", () => {
  it("extracts the page range extract_pdf_text was asked for", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValue(Buffer.from("fake-pdf"));
    mockParse.mockResolvedValue({
      pages: [{ text: "Page0" }, { text: "Page1" }, { text: "Page2" }],
      text: "Page0\nPage1\nPage2"
    });

    const context = makeContext();
    const result = (await asTool(byName("extract_pdf_text")).process(context, {
      path: "doc.pdf",
      start_page: 1,
      end_page: 1
    })) as Record<string, unknown>;

    expect(result.text).toBe("Page1");
    expect(readFile).toHaveBeenCalledWith(
      resolve(join(workspaceDir, "doc.pdf"))
    );
  });

  it("reports a read failure as a structured error", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockRejectedValue(new Error("File not found"));

    const context = makeContext();
    const result = (await asTool(byName("extract_pdf_text")).process(context, {
      path: "missing.pdf"
    })) as Record<string, unknown>;

    expect(result.error).toBe("File not found");
  });
});
