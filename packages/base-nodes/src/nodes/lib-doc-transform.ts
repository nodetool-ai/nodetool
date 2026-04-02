import { BaseNode, prop } from "@nodetool/node-sdk";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";

function pathFromInput(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const p = (value as { path?: unknown; uri?: unknown }).path;
    if (typeof p === "string") return p;
    const uri = (value as { uri?: unknown }).uri;
    if (typeof uri === "string")
      return uri.startsWith("file://") ? uri.slice("file://".length) : uri;
  }
  return "";
}

type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

async function runCommand(
  cmd: string,
  args: string[],
  stdin: string,
  timeoutMs: number
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({
          stdout,
          stderr: `${stderr}\nProcess timed out`,
          exitCode: 124
        });
        return;
      }
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });

    if (stdin.length > 0) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

abstract class PandocBaseLibNode extends BaseNode {
  static readonly requiredRuntimes = ["pandoc"];

  protected formats(): { input: string; output: string } {
    const input = String(
      (this as any).input_format ?? "markdown"
    ).toLowerCase();
    const output = String((this as any).output_format ?? "plain").toLowerCase();
    return { input, output };
  }

  protected extraArgs(): string[] {
    const raw = (this as any).extra_args ?? [];
    return Array.isArray(raw) ? raw.map(String) : [];
  }

  protected timeoutMs(): number {
    const sec = Number((this as any).timeout ?? 120);
    return Math.max(1, Math.trunc(sec * 1000));
  }
}

export class ConvertTextPandocLibNode extends PandocBaseLibNode {
  static readonly nodeType = "lib.convert.pandoc.ConvertText";
  static readonly title = "Convert Text";
  static readonly description =
    "Converts text content between different document formats using pandoc.\n    convert, text, format, pandoc\n\n    Use cases:\n    - Convert text content between various formats (Markdown, HTML, LaTeX, etc.)\n    - Transform content without saving to disk\n    - Process text snippets in different formats";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  @prop({
    type: "str",
    default: "",
    title: "Content",
    description: "Text content to convert"
  })
  declare content: any;

  @prop({
    type: "enum",
    default: "markdown",
    title: "Input Format",
    description: "Input format",
    values: [
      "biblatex",
      "bibtex",
      "bits",
      "commonmark",
      "commonmark_x",
      "creole",
      "csljson",
      "csv",
      "djot",
      "docbook",
      "docx",
      "dokuwiki",
      "endnotexml",
      "epub",
      "fb2",
      "gfm",
      "haddock",
      "html",
      "ipynb",
      "jats",
      "jira",
      "json",
      "latex",
      "man",
      "markdown",
      "markdown_github",
      "markdown_mmd",
      "markdown_phpextra",
      "markdown_strict",
      "mdoc",
      "mediawiki",
      "muse",
      "native",
      "odt",
      "opml",
      "org",
      "ris",
      "rst",
      "rtf",
      "t2t",
      "textile",
      "tikiwiki",
      "tsv",
      "twiki",
      "typst",
      "vimwiki"
    ]
  })
  declare input_format: any;

  @prop({
    type: "enum",
    default: "docx",
    title: "Output Format",
    description: "Output format",
    values: [
      "asciidoc",
      "asciidoctor",
      "beamer",
      "context",
      "docbook4",
      "docbook5",
      "docx",
      "epub2",
      "epub3",
      "pdf",
      "plain",
      "pptx",
      "slideous",
      "slidy",
      "dzslides",
      "revealjs",
      "s5",
      "tei",
      "texinfo",
      "zimwiki"
    ]
  })
  declare output_format: any;

  @prop({
    type: "list[str]",
    default: [],
    title: "Extra Args",
    description: "Additional pandoc arguments"
  })
  declare extra_args: any;

  async process(): Promise<Record<string, unknown>> {
    const content = String(this.content ?? "");
    const { input, output } = this.formats();
    const args = ["-f", input, "-t", output, ...this.extraArgs()];
    const result = await runCommand("pandoc", args, content, this.timeoutMs());
    if (result.exitCode !== 0) {
      throw new Error(
        `pandoc failed: ${result.stderr || `exit ${result.exitCode}`}`
      );
    }
    return { output: result.stdout };
  }
}

export class ConvertFilePandocLibNode extends PandocBaseLibNode {
  static readonly nodeType = "lib.convert.pandoc.ConvertFile";
  static readonly title = "Convert File";
  static readonly description =
    "Converts between different document formats using pandoc.\n    convert, document, format, pandoc\n\n    Use cases:\n    - Convert between various document formats (Markdown, HTML, LaTeX, etc.)\n    - Generate documentation in different formats\n    - Create publication-ready documents";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  @prop({
    type: "file_path",
    default: {
      type: "file_path",
      path: ""
    },
    title: "Input Path",
    description: "Path to the input file"
  })
  declare input_path: any;

  @prop({
    type: "enum",
    default: "markdown",
    title: "Input Format",
    description: "Input format",
    values: [
      "biblatex",
      "bibtex",
      "bits",
      "commonmark",
      "commonmark_x",
      "creole",
      "csljson",
      "csv",
      "djot",
      "docbook",
      "docx",
      "dokuwiki",
      "endnotexml",
      "epub",
      "fb2",
      "gfm",
      "haddock",
      "html",
      "ipynb",
      "jats",
      "jira",
      "json",
      "latex",
      "man",
      "markdown",
      "markdown_github",
      "markdown_mmd",
      "markdown_phpextra",
      "markdown_strict",
      "mdoc",
      "mediawiki",
      "muse",
      "native",
      "odt",
      "opml",
      "org",
      "ris",
      "rst",
      "rtf",
      "t2t",
      "textile",
      "tikiwiki",
      "tsv",
      "twiki",
      "typst",
      "vimwiki"
    ]
  })
  declare input_format: any;

  @prop({
    type: "enum",
    default: "pdf",
    title: "Output Format",
    description: "Output format",
    values: [
      "asciidoc",
      "asciidoctor",
      "beamer",
      "context",
      "docbook4",
      "docbook5",
      "docx",
      "epub2",
      "epub3",
      "pdf",
      "plain",
      "pptx",
      "slideous",
      "slidy",
      "dzslides",
      "revealjs",
      "s5",
      "tei",
      "texinfo",
      "zimwiki"
    ]
  })
  declare output_format: any;

  @prop({
    type: "list[str]",
    default: [],
    title: "Extra Args",
    description: "Additional pandoc arguments"
  })
  declare extra_args: any;

  async process(): Promise<Record<string, unknown>> {
    const inPath = pathFromInput(this.input_path);
    if (!inPath) {
      throw new Error("Input path is not set");
    }
    try {
      await fs.access(inPath);
    } catch {
      throw new Error(`Input file not found: ${inPath}`);
    }

    const { input, output } = this.formats();
    const args = [inPath, "-f", input, "-t", output, ...this.extraArgs()];
    const result = await runCommand("pandoc", args, "", this.timeoutMs());
    if (result.exitCode !== 0) {
      throw new Error(
        `pandoc failed: ${result.stderr || `exit ${result.exitCode}`}`
      );
    }
    return { output: result.stdout };
  }
}

export const LIB_PANDOC_NODES = [
  ConvertFilePandocLibNode,
  ConvertTextPandocLibNode
] as const;
