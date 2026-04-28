import { describe, it, expect, vi, beforeEach } from "vitest";
import { join, resolve } from "node:path";
import type { ProcessingContext } from "@nodetool/runtime";
import {
  ExtractPDFTextTool,
  ExtractPDFTablesTool,
  ConvertPDFToMarkdownTool,
  ConvertMarkdownToPDFTool,
  ConvertDocumentTool
} from "../src/tools/pdf-tools.js";

// Hoist mock variable so it's available inside the vi.mock factory
const { mockParse } = vi.hoisted(() => ({ mockParse: vi.fn() }));

// Mock @llamaindex/liteparse
function makeMockParseResult(pageTexts: string[]) {
  return {
    pages: pageTexts.map((text, i) => ({
      pageNum: i + 1,
      text,
      textItems: [],
      width: 612,
      height: 792
    })),
    text: pageTexts.join("\n")
  };
}

vi.mock("@llamaindex/liteparse", () => ({
  LiteParse: class {
    parse(...args: unknown[]) {
      return mockParse(...args);
    }
  }
}));

// Mock child_process
vi.mock("node:child_process", () => ({
  execFile: vi.fn()
}));

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn()
}));

const workspaceDir = "/tmp/test-workspace";

function makeMockContext(): ProcessingContext {
  return {
    resolveWorkspacePath(path: string): string {
      const resolved = resolve(join(workspaceDir, path));
      if (!resolved.startsWith(resolve(workspaceDir))) {
        throw new Error(
          `Resolved path '${resolved}' is outside the workspace directory.`
        );
      }
      return resolved;
    }
  } as unknown as ProcessingContext;
}

let ctx: ProcessingContext;

beforeEach(() => {
  vi.clearAllMocks();
  ctx = makeMockContext();
  mockParse.mockResolvedValue(makeMockParseResult(["Hello World"]));
});

// ---------------------------------------------------------------------------
// ExtractPDFTextTool
// ---------------------------------------------------------------------------

describe("ExtractPDFTextTool", () => {
  const tool = new ExtractPDFTextTool();

  it("has correct name and schema", () => {
    expect(tool.name).toBe("extract_pdf_text");
    const pt = tool.toProviderTool();
    expect(pt.description).toBeTruthy();
    expect((pt.inputSchema as Record<string, unknown>).required).toContain("path");
  });

  it("extracts full text from a PDF", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValue(Buffer.from("fake-pdf"));
    mockParse.mockResolvedValue(makeMockParseResult(["Hello World"]));

    const result = (await tool.process(ctx, { path: "doc.pdf" })) as Record<string, unknown>;
    expect(result.text).toBe("Hello World");
    expect(readFile).toHaveBeenCalledWith(
      resolve(join(workspaceDir, "doc.pdf"))
    );
  });

  it("extracts text for a specific page range", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValue(Buffer.from("fake-pdf"));
    mockParse.mockResolvedValue(makeMockParseResult(["Page0", "Page1", "Page2"]));

    const result = (await tool.process(ctx, {
      path: "doc.pdf",
      start_page: 1,
      end_page: 1
    })) as Record<string, unknown>;
    expect(result.text).toBe("Page1");
  });

  it("returns error on failure", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockRejectedValue(new Error("File not found"));

    const result = (await tool.process(ctx, {
      path: "missing.pdf"
    })) as Record<string, unknown>;
    expect(result.error).toContain("File not found");
  });

  it("userMessage returns concise message", () => {
    expect(tool.userMessage({ path: "doc.pdf" })).toBe(
      "Extracting text from doc.pdf..."
    );
  });

  it("userMessage truncates long paths", () => {
    const longPath = "a".repeat(100) + ".pdf";
    expect(tool.userMessage({ path: longPath })).toBe(
      "Extracting text from PDF..."
    );
  });
});

// ---------------------------------------------------------------------------
// ExtractPDFTablesTool
// ---------------------------------------------------------------------------

describe("ExtractPDFTablesTool", () => {
  const tool = new ExtractPDFTablesTool();

  it("has correct name and schema", () => {
    expect(tool.name).toBe("extract_pdf_tables");
    expect((tool.inputSchema as Record<string, unknown>).required).toContain("path");
    expect((tool.inputSchema as Record<string, unknown>).required).toContain("output_file");
  });

  it("extracts tables and writes JSON output", async () => {
    const { readFile, writeFile, mkdir } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValue(Buffer.from("fake-pdf"));
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(mkdir).mockResolvedValue(undefined);
    mockParse.mockResolvedValue(makeMockParseResult(["Name  Age  City\nAlice  30  NYC\nBob  25  LA"]));

    const result = (await tool.process(ctx, {
      path: "data.pdf",
      output_file: "tables.json"
    })) as Record<string, unknown>;

    expect(result.output_file).toBe(resolve(join(workspaceDir, "tables.json")));
    expect(writeFile).toHaveBeenCalled();
    const writtenData = JSON.parse(
      vi.mocked(writeFile).mock.calls[0][1] as string
    );
    expect(Array.isArray(writtenData)).toBe(true);
  });

  it("returns error on failure", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockRejectedValue(new Error("read error"));

    const result = (await tool.process(ctx, {
      path: "bad.pdf",
      output_file: "out.json"
    })) as Record<string, unknown>;
    expect(result.error).toContain("read error");
  });

  it("userMessage works", () => {
    expect(
      tool.userMessage({ path: "doc.pdf", output_file: "tables.json" })
    ).toBe("Extracting tables from doc.pdf to tables.json...");
  });
});

// ---------------------------------------------------------------------------
// ConvertPDFToMarkdownTool
// ---------------------------------------------------------------------------

describe("ConvertPDFToMarkdownTool", () => {
  const tool = new ConvertPDFToMarkdownTool();

  it("has correct name and schema", () => {
    expect(tool.name).toBe("convert_pdf_to_markdown");
    expect((tool.inputSchema as Record<string, unknown>).required).toContain("input_file");
    expect((tool.inputSchema as Record<string, unknown>).required).toContain("output_file");
  });

  it("converts PDF to markdown", async () => {
    const { readFile, writeFile, mkdir } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValue(Buffer.from("fake-pdf"));
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(mkdir).mockResolvedValue(undefined);
    mockParse.mockResolvedValue(makeMockParseResult(["# Title\n\nSome content"]));

    const result = (await tool.process(ctx, {
      input_file: "doc.pdf",
      output_file: "doc.md"
    })) as Record<string, unknown>;

    expect(result.output_file).toBe(resolve(join(workspaceDir, "doc.md")));
    expect(writeFile).toHaveBeenCalledWith(
      resolve(join(workspaceDir, "doc.md")),
      expect.any(String),
      "utf-8"
    );
  });

  it("handles page range", async () => {
    const { readFile, writeFile, mkdir } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValue(Buffer.from("fake-pdf"));
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(mkdir).mockResolvedValue(undefined);
    mockParse.mockResolvedValue(makeMockParseResult(["Page0", "Page1", "Page2"]));

    const result = (await tool.process(ctx, {
      input_file: "doc.pdf",
      output_file: "doc.md",
      start_page: 1,
      end_page: 2
    })) as Record<string, unknown>;

    expect(result.output_file).toBeDefined();
    const writtenContent = vi.mocked(writeFile).mock.calls[0][1];
    expect(writtenContent).toBe("Page1\nPage2");
  });

  it("returns error on failure", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockRejectedValue(new Error("not found"));

    const result = (await tool.process(ctx, {
      input_file: "bad.pdf",
      output_file: "out.md"
    })) as Record<string, unknown>;
    expect(result.error).toContain("not found");
  });

  it("userMessage works", () => {
    expect(
      tool.userMessage({ input_file: "doc.pdf", output_file: "doc.md" })
    ).toBe("Converting doc.pdf to doc.md...");
  });
});

// ---------------------------------------------------------------------------
// ConvertMarkdownToPDFTool
// ---------------------------------------------------------------------------

describe("ConvertMarkdownToPDFTool", () => {
  const tool = new ConvertMarkdownToPDFTool();

  it("has correct name and schema", () => {
    expect(tool.name).toBe("convert_markdown_to_pdf");
    expect((tool.inputSchema as Record<string, unknown>).required).toContain("input_file");
    expect((tool.inputSchema as Record<string, unknown>).required).toContain("output_file");
  });

  it("calls pandoc to convert markdown to PDF", async () => {
    const { mkdir } = await import("node:fs/promises");
    const { execFile } = await import("node:child_process");
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, cb: unknown) => {
      if (typeof cb === "function") cb(null, "", "");
      return {} as ReturnType<typeof execFile>;
    });

    const result = (await tool.process(ctx, {
      input_file: "doc.md",
      output_file: "doc.pdf"
    })) as Record<string, unknown>;

    expect(result.status).toBe("success");
    expect(result.output_file).toBe(resolve(join(workspaceDir, "doc.pdf")));
    expect(execFile).toHaveBeenCalledWith(
      "pandoc",
      expect.arrayContaining([
        resolve(join(workspaceDir, "doc.md")),
        "-f",
        "markdown",
        "-t",
        "pdf",
        "-o",
        resolve(join(workspaceDir, "doc.pdf"))
      ]),
      expect.any(Function)
    );
  });

  it("returns error when pandoc fails", async () => {
    const { mkdir } = await import("node:fs/promises");
    const { execFile } = await import("node:child_process");
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, cb: unknown) => {
      if (typeof cb === "function") cb(new Error("pandoc not found"));
      return {} as ReturnType<typeof execFile>;
    });

    const result = (await tool.process(ctx, {
      input_file: "doc.md",
      output_file: "doc.pdf"
    })) as Record<string, unknown>;

    expect(result.error).toContain("pandoc not found");
  });

  it("userMessage works", () => {
    expect(
      tool.userMessage({ input_file: "doc.md", output_file: "doc.pdf" })
    ).toBe("Converting doc.md to doc.pdf...");
  });
});

// ---------------------------------------------------------------------------
// ConvertDocumentTool
// ---------------------------------------------------------------------------

describe("ConvertDocumentTool", () => {
  const tool = new ConvertDocumentTool();

  it("has correct name and schema", () => {
    expect(tool.name).toBe("convert_document");
    expect((tool.inputSchema as Record<string, unknown>).required).toContain("input_file");
    expect((tool.inputSchema as Record<string, unknown>).required).toContain("output_file");
  });

  it("calls pandoc with correct format arguments", async () => {
    const { mkdir } = await import("node:fs/promises");
    const { execFile } = await import("node:child_process");
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, cb: unknown) => {
      if (typeof cb === "function") cb(null, "", "");
      return {} as ReturnType<typeof execFile>;
    });

    const result = (await tool.process(ctx, {
      input_file: "doc.rst",
      output_file: "doc.html",
      from_format: "rst",
      to_format: "html"
    })) as Record<string, unknown>;

    expect(result.status).toBe("success");
    expect(execFile).toHaveBeenCalledWith(
      "pandoc",
      expect.arrayContaining(["-f", "rst", "-t", "html"]),
      expect.any(Function)
    );
  });

  it("passes extra_args to pandoc", async () => {
    const { mkdir } = await import("node:fs/promises");
    const { execFile } = await import("node:child_process");
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, cb: unknown) => {
      if (typeof cb === "function") cb(null, "", "");
      return {} as ReturnType<typeof execFile>;
    });

    await tool.process(ctx, {
      input_file: "doc.md",
      output_file: "doc.pdf",
      extra_args: ["--toc", "--standalone"]
    });

    const callArgs = vi.mocked(execFile).mock.calls[0][1] as string[];
    expect(callArgs).toContain("--toc");
    expect(callArgs).toContain("--standalone");
  });

  it("returns error when pandoc fails", async () => {
    const { mkdir } = await import("node:fs/promises");
    const { execFile } = await import("node:child_process");
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, cb: unknown) => {
      if (typeof cb === "function") cb(new Error("conversion failed"));
      return {} as ReturnType<typeof execFile>;
    });

    const result = (await tool.process(ctx, {
      input_file: "doc.md",
      output_file: "doc.pdf"
    })) as Record<string, unknown>;

    expect(result.error).toContain("conversion failed");
  });

  it("userMessage includes format info", () => {
    expect(
      tool.userMessage({
        input_file: "doc.md",
        output_file: "doc.html",
        to_format: "html"
      })
    ).toBe("Converting doc.md to doc.html (html)...");
  });
});
