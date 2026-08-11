/**
 * The `documents` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `documents.ts`, so nothing the
 * implementations pull in reaches the entry graph. `documents.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";

export const extractPdfTextSpec: CapabilitySpec = {
  name: "extract_pdf_text",
  description: "Extract plain text from a PDF document",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the PDF file"
      },
      start_page: {
        type: "integer",
        description: "First page to extract (0-based index)",
        default: 0
      },
      end_page: {
        type: "integer",
        description: "Last page to extract (-1 for last page)",
        default: -1
      }
    },
    required: ["path"]
  },
  category: "read",
  userMessage: (params) => {
    const path = params["path"] ?? "a PDF";
    const msg = `Extracting text from ${path}...`;
    return msg.length > 80 ? "Extracting text from PDF..." : msg;
  }
};

export const extractPdfTablesSpec: CapabilitySpec = {
  name: "extract_pdf_tables",
  description: "Extract tables from a PDF document to a JSON file",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the PDF file"
      },
      output_file: {
        type: "string",
        description: "Path to the output JSON file"
      },
      start_page: {
        type: "integer",
        description: "First page to extract (0-based index)",
        default: 0
      },
      end_page: {
        type: "integer",
        description: "Last page to extract (-1 for last page)",
        default: -1
      }
    },
    required: ["path", "output_file"]
  },
  category: "read",
  userMessage: (params) => {
    const path = params["path"] ?? "a PDF";
    const output = params["output_file"] ?? "output";
    let msg = `Extracting tables from ${path} to ${output}...`;
    if (msg.length > 80) msg = `Extracting tables from PDF to ${output}...`;
    if (msg.length > 80) msg = "Extracting tables from PDF...";
    return msg;
  }
};

export const convertPdfToMarkdownSpec: CapabilitySpec = {
  name: "convert_pdf_to_markdown",
  description: "Convert PDF to Markdown format",
  inputSchema: {
    type: "object",
    properties: {
      input_file: {
        type: "string",
        description: "Path to the input PDF file"
      },
      output_file: {
        type: "string",
        description: "Path to the output Markdown file"
      },
      start_page: {
        type: "integer",
        description: "First page to extract (0-based index)",
        default: 0
      },
      end_page: {
        type: "integer",
        description: "Last page to extract (-1 for last page)",
        default: -1
      }
    },
    required: ["input_file", "output_file"]
  },
  category: "read",
  userMessage: (params) => {
    const inputFile = params["input_file"] ?? "a PDF";
    const outputFile = params["output_file"] ?? "Markdown";
    let msg = `Converting ${inputFile} to ${outputFile}...`;
    if (msg.length > 80) msg = `Converting PDF to ${outputFile}...`;
    if (msg.length > 80) msg = "Converting PDF to Markdown...";
    return msg;
  }
};

export const convertMarkdownToPdfSpec: CapabilitySpec = {
  name: "convert_markdown_to_pdf",
  description: "Convert Markdown to PDF using Pandoc.",
  inputSchema: {
    type: "object",
    properties: {
      input_file: {
        type: "string",
        description: "Path to the input Markdown file"
      },
      output_file: {
        type: "string",
        description: "Path to the output PDF file"
      }
    },
    required: ["input_file", "output_file"]
  },
  category: "write",
  userMessage: (params) => {
    const inputFile = params["input_file"] ?? "Markdown";
    const outputFile = params["output_file"] ?? "a PDF";
    let msg = `Converting ${inputFile} to ${outputFile}...`;
    if (msg.length > 80) msg = `Converting Markdown to ${outputFile}...`;
    if (msg.length > 80) msg = "Converting Markdown to PDF...";
    return msg;
  }
};

export const convertDocumentSpec: CapabilitySpec = {
  name: "convert_document",
  description:
    "Convert between document formats using Pandoc, supports markdown, docx, rst, pdf, html, etc.",
  inputSchema: {
    type: "object",
    properties: {
      input_file: {
        type: "string",
        description: "Path to the input file"
      },
      output_file: {
        type: "string",
        description: "Path to the output file"
      },
      from_format: {
        type: "string",
        description: "Input format (e.g., markdown, docx, rst)",
        default: "markdown"
      },
      to_format: {
        type: "string",
        description: "Output format (e.g., pdf, docx, html)",
        default: "pdf"
      },
      extra_args: {
        type: "array",
        description: "Additional Pandoc arguments",
        items: { type: "string" },
        default: []
      }
    },
    required: ["input_file", "output_file"]
  },
  category: "write",
  userMessage: (params) => {
    const inputFile = params["input_file"] ?? "input";
    const outputFile = params["output_file"] ?? "output";
    const toFormat = params["to_format"] ?? "target format";
    let msg = `Converting ${inputFile} to ${outputFile} (${toFormat})...`;
    if (msg.length > 80) msg = `Converting ${inputFile} to ${toFormat}...`;
    if (msg.length > 80) msg = `Converting document to ${toFormat}...`;
    return msg;
  }
};

/** Every spec this module declares, in declaration order. */
export const documentsSpecs: readonly CapabilitySpec[] = [
  extractPdfTextSpec,
  extractPdfTablesSpec,
  convertPdfToMarkdownSpec,
  convertMarkdownToPdfSpec,
  convertDocumentSpec
];
