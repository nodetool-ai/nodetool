/**
 * PDF tools for extracting text, tables, and converting documents.
 *
 * Port of src/nodetool/agents/tools/pdf_tools.py
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProcessingContext } from "@nodetool/runtime";
import { Tool } from "./base-tool.js";

const execFileAsync = promisify(execFile);

export class ExtractPDFTextTool extends Tool {
  readonly name = "extract_pdf_text";
  readonly description = "Extract plain text from a PDF document";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string" as const,
        description: "Path to the PDF file"
      },
      start_page: {
        type: "integer" as const,
        description: "First page to extract (0-based index)",
        default: 0
      },
      end_page: {
        type: "integer" as const,
        description: "Last page to extract (-1 for last page)",
        default: -1
      }
    },
    required: ["path"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const filePath = context.resolveWorkspacePath(params["path"] as string);
      const buffer = await readFile(filePath);
      const data = await pdfParse(buffer);

      const startPage = (params["start_page"] as number) ?? 0;
      const endPage = (params["end_page"] as number) ?? -1;

      if (startPage === 0 && endPage === -1) {
        return { text: data.text };
      }

      // Split by form feed to get pages, then select range
      const pages = data.text.split("\f");
      const end = endPage === -1 ? pages.length - 1 : endPage;
      const selectedPages = pages.slice(startPage, end + 1);
      return { text: selectedPages.join("\f") };
    } catch (e) {
      return { error: String(e instanceof Error ? e.message : e) };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const path = params["path"] ?? "a PDF";
    const msg = `Extracting text from ${path}...`;
    return msg.length > 80 ? "Extracting text from PDF..." : msg;
  }
}

export class ExtractPDFTablesTool extends Tool {
  readonly name = "extract_pdf_tables";
  readonly description = "Extract tables from a PDF document to a JSON file";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string" as const,
        description: "Path to the PDF file"
      },
      output_file: {
        type: "string" as const,
        description: "Path to the output JSON file"
      },
      start_page: {
        type: "integer" as const,
        description: "First page to extract (0-based index)",
        default: 0
      },
      end_page: {
        type: "integer" as const,
        description: "Last page to extract (-1 for last page)",
        default: -1
      }
    },
    required: ["path", "output_file"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const filePath = context.resolveWorkspacePath(params["path"] as string);
      const outputFile = context.resolveWorkspacePath(
        params["output_file"] as string
      );
      const buffer = await readFile(filePath);
      const data = await pdfParse(buffer);

      const startPage = (params["start_page"] as number) ?? 0;
      const endPage = (params["end_page"] as number) ?? -1;

      // Split text into pages and select range
      const pages = data.text.split("\f");
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

      const parentDir = dirname(outputFile);
      await mkdir(parentDir, { recursive: true });
      await writeFile(outputFile, JSON.stringify(allTables), "utf-8");

      return { output_file: outputFile };
    } catch (e) {
      return { error: String(e instanceof Error ? e.message : e) };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const path = params["path"] ?? "a PDF";
    const output = params["output_file"] ?? "output";
    let msg = `Extracting tables from ${path} to ${output}...`;
    if (msg.length > 80) msg = `Extracting tables from PDF to ${output}...`;
    if (msg.length > 80) msg = "Extracting tables from PDF...";
    return msg;
  }
}

export class ConvertPDFToMarkdownTool extends Tool {
  readonly name = "convert_pdf_to_markdown";
  readonly description = "Convert PDF to Markdown format";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      input_file: {
        type: "string" as const,
        description: "Path to the input PDF file"
      },
      output_file: {
        type: "string" as const,
        description: "Path to the output Markdown file"
      },
      start_page: {
        type: "integer" as const,
        description: "First page to extract (0-based index)",
        default: 0
      },
      end_page: {
        type: "integer" as const,
        description: "Last page to extract (-1 for last page)",
        default: -1
      }
    },
    required: ["input_file", "output_file"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const inputFile = context.resolveWorkspacePath(
        params["input_file"] as string
      );
      const outputFile = context.resolveWorkspacePath(
        params["output_file"] as string
      );

      const buffer = await readFile(inputFile);
      const data = await pdfParse(buffer);
      let mdText = data.text;

      const startPage = (params["start_page"] as number) ?? 0;
      const endPage = (params["end_page"] as number) ?? -1;

      if (startPage !== 0 || endPage !== -1) {
        const pages = mdText.split("\f");
        const end = endPage === -1 ? pages.length - 1 : endPage;
        mdText = pages.slice(startPage, end + 1).join("\f");
      }

      const parentDir = dirname(outputFile);
      await mkdir(parentDir, { recursive: true });
      await writeFile(outputFile, mdText, "utf-8");

      return { output_file: outputFile };
    } catch (e) {
      return { error: String(e instanceof Error ? e.message : e) };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const inputFile = params["input_file"] ?? "a PDF";
    const outputFile = params["output_file"] ?? "Markdown";
    let msg = `Converting ${inputFile} to ${outputFile}...`;
    if (msg.length > 80) msg = `Converting PDF to ${outputFile}...`;
    if (msg.length > 80) msg = "Converting PDF to Markdown...";
    return msg;
  }
}

export class ConvertMarkdownToPDFTool extends Tool {
  readonly name = "convert_markdown_to_pdf";
  readonly description = "Convert Markdown to PDF using Pandoc.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      input_file: {
        type: "string" as const,
        description: "Path to the input Markdown file"
      },
      output_file: {
        type: "string" as const,
        description: "Path to the output PDF file"
      }
    },
    required: ["input_file", "output_file"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
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

  userMessage(params: Record<string, unknown>): string {
    const inputFile = params["input_file"] ?? "Markdown";
    const outputFile = params["output_file"] ?? "a PDF";
    let msg = `Converting ${inputFile} to ${outputFile}...`;
    if (msg.length > 80) msg = `Converting Markdown to ${outputFile}...`;
    if (msg.length > 80) msg = "Converting Markdown to PDF...";
    return msg;
  }
}

export class ConvertDocumentTool extends Tool {
  readonly name = "convert_document";
  readonly description =
    "Convert between document formats using Pandoc, supports markdown, docx, rst, pdf, html, etc.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      input_file: {
        type: "string" as const,
        description: "Path to the input file"
      },
      output_file: {
        type: "string" as const,
        description: "Path to the output file"
      },
      from_format: {
        type: "string" as const,
        description: "Input format (e.g., markdown, docx, rst)",
        default: "markdown"
      },
      to_format: {
        type: "string" as const,
        description: "Output format (e.g., pdf, docx, html)",
        default: "pdf"
      },
      extra_args: {
        type: "array" as const,
        description: "Additional Pandoc arguments",
        items: { type: "string" as const },
        default: []
      }
    },
    required: ["input_file", "output_file"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
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
      if (typeof extraArgs === "string") {
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

  userMessage(params: Record<string, unknown>): string {
    const inputFile = params["input_file"] ?? "input";
    const outputFile = params["output_file"] ?? "output";
    const toFormat = params["to_format"] ?? "target format";
    let msg = `Converting ${inputFile} to ${outputFile} (${toFormat})...`;
    if (msg.length > 80) msg = `Converting ${inputFile} to ${toFormat}...`;
    if (msg.length > 80) msg = `Converting document to ${toFormat}...`;
    return msg;
  }
}
