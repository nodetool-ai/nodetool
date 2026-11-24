/**
 * In-process document conversion for `convert_document` and
 * `convert_markdown_to_pdf`.
 *
 * Markdown is parsed with `marked`. Raw HTML in Markdown is escaped and links
 * and images keep only safe URL schemes. DOCX is read with `mammoth`, from the
 * optional "office-documents" runtime package. No conversion writes DOCX.
 * HTML becomes Markdown through `turndown`. PDF is printed by the Chromium
 * that `@nodetool-ai/browser` launches, with every network request failed and
 * scripts disabled while the page renders. Chromium is the only process this
 * module starts.
 */

import { Marked } from "marked";
import { launchBrowser } from "@nodetool-ai/browser";
import { importOptionalLibrary, unwrapLibrary } from "../host-modules/limits.js";
import { isFunction } from "../utils/type-guards.js";

export type DocumentFormat = "markdown" | "html" | "docx" | "pdf" | "text";

const FORMAT_ALIASES: Readonly<Record<string, DocumentFormat>> = {
  markdown: "markdown",
  md: "markdown",
  gfm: "markdown",
  commonmark: "markdown",
  html: "html",
  htm: "html",
  html5: "html",
  docx: "docx",
  pdf: "pdf",
  text: "text",
  txt: "text",
  plain: "text"
};

/** Every conversion the tools perform, as `from → to` pairs. */
export const SUPPORTED_CONVERSIONS: readonly (readonly [
  DocumentFormat,
  DocumentFormat
])[] = [
  ["markdown", "html"],
  ["markdown", "pdf"],
  ["markdown", "text"],
  ["html", "markdown"],
  ["html", "pdf"],
  ["docx", "markdown"],
  ["docx", "html"],
  ["docx", "text"],
  ["text", "markdown"],
  ["text", "text"]
];

/** The supported pairs as one line, for tool descriptions and errors. */
export const SUPPORTED_CONVERSIONS_TEXT = SUPPORTED_CONVERSIONS.map(
  ([from, to]) => `${from} → ${to}`
).join(", ");

/** Resolve a format name or alias, or `null` when it is not one we read or write. */
export function normalizeFormat(name: string): DocumentFormat | null {
  const key = name.trim().toLowerCase();
  return Object.hasOwn(FORMAT_ALIASES, key) ? FORMAT_ALIASES[key]! : null;
}

function unsupportedPairError(from: string, to: string): Error {
  return new Error(
    `Cannot convert ${from} to ${to}. Supported conversions: ` +
      `${SUPPORTED_CONVERSIONS_TEXT}. Format aliases: md, gfm and commonmark ` +
      `are markdown; htm is html; txt and plain are text.`
  );
}

// ---------------------------------------------------------------------------
// Markdown → HTML
// ---------------------------------------------------------------------------

const SAFE_LINK = /^(?:https?:|mailto:|#|\/|\.{0,2}\/|[^:]*$)/i;
const SAFE_IMAGE = /^(?:https?:|data:image\/(?:png|jpe?g|gif|webp);)/i;

/**
 * A `marked` instance that cannot emit markup the Markdown did not describe:
 * raw HTML is shown as text, and a link or image whose URL has an unsafe
 * scheme (`javascript:`, `file:`, `data:text/html`, …) loses the URL.
 */
const markdownParser = new Marked({
  gfm: true,
  renderer: {
    html(html: string): string {
      return escapeHtml(html);
    },
    link(href: string, _title: string | null | undefined, text: string) {
      return SAFE_LINK.test(href.trim()) ? false : text;
    },
    image(href: string, _title: string | null, text: string) {
      return SAFE_IMAGE.test(href.trim()) ? false : escapeHtml(text);
    }
  }
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DOCUMENT_CSS = `
body { font-family: "Liberation Sans", Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.45; color: #111; margin: 0; }
h1, h2, h3, h4, h5, h6 { line-height: 1.2; margin: 1.2em 0 0.5em; }
pre, code { font-family: "Liberation Mono", Menlo, Consolas, monospace; font-size: 0.92em; }
pre { background: #f4f4f4; padding: 0.6em; white-space: pre-wrap; }
table { border-collapse: collapse; }
th, td { border: 1px solid #999; padding: 0.25em 0.5em; }
blockquote { margin-left: 0; padding-left: 1em; border-left: 3px solid #ccc; color: #444; }
img { max-width: 100%; }
`;

/** Wrap an HTML fragment in a standalone UTF-8 document. */
export function htmlDocument(body: string, title = "Document"): string {
  return (
    `<!doctype html>\n<html><head><meta charset="utf-8">` +
    `<title>${escapeHtml(title)}</title><style>${DOCUMENT_CSS}</style>` +
    `</head><body>\n${body}\n</body></html>\n`
  );
}

/** Sanitized HTML fragment for a Markdown source. */
export function markdownToHtmlFragment(markdown: string): string {
  return markdownParser.parse(markdown, { async: false }) as string;
}

// ---------------------------------------------------------------------------
// HTML → Markdown
// ---------------------------------------------------------------------------

interface TurndownLike {
  new (opts?: Record<string, unknown>): {
    turndown: (html: string) => string;
    remove: (filter: string[]) => void;
  };
}

async function htmlToMarkdown(html: string): Promise<string> {
  const mod: unknown = await import("turndown");
  const Turndown = unwrapLibrary<TurndownLike>(
    mod,
    "convert_document",
    "turndown",
    (v) => isFunction(v)
  );
  const service = new Turndown({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced"
  });
  service.remove(["script", "style", "head", "title"]);
  return `${service.turndown(html).trim()}\n`;
}

// ---------------------------------------------------------------------------
// DOCX → HTML / text
// ---------------------------------------------------------------------------

interface MammothLike {
  convertToHtml: (input: { buffer: Buffer }) => Promise<{ value: string }>;
  extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }>;
}

async function loadMammoth(): Promise<MammothLike> {
  const mod = await importOptionalLibrary<unknown>(
    "convert_document",
    "mammoth",
    "office-documents"
  );
  return unwrapLibrary<MammothLike>(mod, "convert_document", "mammoth", (v) =>
    isFunction((v as MammothLike | undefined)?.convertToHtml)
  );
}

async function docxToHtmlFragment(bytes: Uint8Array): Promise<string> {
  const mammoth = await loadMammoth();
  const result = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
  return result.value;
}

// ---------------------------------------------------------------------------
// HTML → PDF
// ---------------------------------------------------------------------------

/** CSP placed ahead of any document: no scripts, frames or remote loads. */
const RENDER_CSP =
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ` +
  `img-src data:; style-src 'unsafe-inline'; font-src data:">`;

const PDF_RENDER_TIMEOUT_MS = 60_000;

/** CDP calls this module makes, typed for the parameters it passes. */
interface PdfCdpClient {
  Fetch: {
    enable: (params: { patterns: { urlPattern: string }[] }) => Promise<void>;
    requestPaused: (handler: (event: { requestId: string }) => void) => void;
    failRequest: (params: { requestId: string; errorReason: string }) => Promise<void>;
  };
  Page: {
    enable: () => Promise<void>;
    getFrameTree: () => Promise<{ frameTree: { frame: { id: string } } }>;
    setDocumentContent: (params: { frameId: string; html: string }) => Promise<void>;
    printToPDF: (params: Record<string, unknown>) => Promise<{ data: string }>;
  };
  Emulation: {
    setScriptExecutionDisabled: (params: { value: boolean }) => Promise<void>;
  };
}

/**
 * Print an HTML document to PDF in headless Chromium.
 *
 * The browser comes from `launchBrowser`, the launcher every browser tool
 * shares (`CHROME_PATH`, then chrome-launcher's own discovery). Every request
 * the page makes is failed through the Fetch domain, scripts are disabled,
 * and the document carries a CSP that forbids remote loads, so nothing in the
 * input can reach the network or the file system.
 */
export async function htmlToPdf(html: string): Promise<Uint8Array> {
  let session: Awaited<ReturnType<typeof launchBrowser>>;
  try {
    session = await launchBrowser();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const hint = /chrome installation/i.test(message)
      ? " PDF output is printed by Chromium: install Chrome or set CHROME_PATH to a Chromium binary."
      : "";
    throw new Error(`Could not start Chromium for PDF output: ${message}${hint}`);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const client = session.client as PdfCdpClient;
    const render = async (): Promise<Uint8Array> => {
      client.Fetch.requestPaused(({ requestId }) => {
        void client.Fetch.failRequest({ requestId, errorReason: "BlockedByClient" }).catch(
          () => undefined
        );
      });
      await client.Fetch.enable({ patterns: [{ urlPattern: "*" }] });
      await client.Emulation.setScriptExecutionDisabled({ value: true });
      await client.Page.enable();
      const { frameTree } = await client.Page.getFrameTree();
      await client.Page.setDocumentContent({
        frameId: frameTree.frame.id,
        html: RENDER_CSP + html
      });
      const { data } = await client.Page.printToPDF({
        printBackground: true,
        marginTop: 0.6,
        marginBottom: 0.6,
        marginLeft: 0.6,
        marginRight: 0.6
      });
      return new Uint8Array(Buffer.from(data, "base64"));
    };
    return await Promise.race([
      render(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`PDF rendering timed out after ${PDF_RENDER_TIMEOUT_MS} ms`)),
          PDF_RENDER_TIMEOUT_MS
        );
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Convert `input` from one format to another. Text formats are passed and
 * returned as UTF-8 strings, DOCX and PDF as bytes. Throws a named error for a
 * pair outside {@link SUPPORTED_CONVERSIONS}.
 */
export async function convertDocumentBytes(
  input: Uint8Array,
  fromName: string,
  toName: string
): Promise<Uint8Array | string> {
  const from = normalizeFormat(fromName);
  const to = normalizeFormat(toName);
  if (
    from === null ||
    to === null ||
    !SUPPORTED_CONVERSIONS.some(([f, t]) => f === from && t === to)
  ) {
    throw unsupportedPairError(fromName, toName);
  }
  const text = (): string => Buffer.from(input).toString("utf-8");

  switch (`${from}->${to}`) {
    case "markdown->html":
      return htmlDocument(markdownToHtmlFragment(text()));
    case "markdown->pdf":
      return htmlToPdf(htmlDocument(markdownToHtmlFragment(text())));
    case "markdown->text":
    case "text->markdown":
    case "text->text":
      return text();
    case "html->markdown":
      return htmlToMarkdown(text());
    case "html->pdf":
      return htmlToPdf(text());
    case "docx->markdown":
      return htmlToMarkdown(await docxToHtmlFragment(input));
    case "docx->html":
      return htmlDocument(await docxToHtmlFragment(input));
    case "docx->text": {
      const mammoth = await loadMammoth();
      const result = await mammoth.extractRawText({ buffer: Buffer.from(input) });
      return result.value;
    }
    default:
      throw unsupportedPairError(fromName, toName);
  }
}
