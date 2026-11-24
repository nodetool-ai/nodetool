// assetLanguage.ts
// -----------------------------------------------------------------
// Maps an asset's filename / MIME type to a Monaco language id and
// decides whether the asset holds editable text. Shared by the
// workspace text editor (TextDocumentEditor), the legacy file-tab
// editor (FileTabContent) and the tab-type resolver (assetTabType).
// -----------------------------------------------------------------

/** The minimal asset shape needed to detect a text language. */
interface TextAssetLike {
  name?: string | null;
  content_type?: string | null;
}

/** Filename extension → Monaco language id. */
const EXTENSION_LANGUAGE: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  json: "json",
  jsonc: "json",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  htm: "html",
  xml: "xml",
  svg: "xml",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  markdown: "markdown",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  sql: "sql",
  toml: "ini",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  env: "ini",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  swift: "swift",
  graphql: "graphql",
  gql: "graphql",
  txt: "plaintext",
  log: "plaintext",
  csv: "plaintext",
  tsv: "plaintext"
};

const fileExtension = (name: string): string =>
  name.includes(".") ? (name.split(".").pop() ?? "") : "";

/**
 * Resolve the Monaco language id for an asset from its filename, falling back
 * to its MIME type. Returns `undefined` when the asset is not a known text
 * format (so callers can treat it as binary).
 */
export const languageFromAsset = (asset: TextAssetLike): string | undefined => {
  const name = (asset.name ?? "").toLowerCase();
  // Extension-less names whose basename *is* the type (Dockerfile, .gitignore).
  if (name === "dockerfile" || name.endsWith("/dockerfile")) {
    return "dockerfile";
  }
  const ext = fileExtension(name);
  if (ext && EXTENSION_LANGUAGE[ext]) {
    return EXTENSION_LANGUAGE[ext];
  }

  const type = asset.content_type ?? "";
  if (type === "application/json") {
    return "json";
  }
  if (type === "application/xml") {
    return "xml";
  }
  if (type === "application/javascript" || type === "application/typescript") {
    return "javascript";
  }
  if (type === "text/markdown" || type === "text/x-markdown") {
    return "markdown";
  }
  if (type.startsWith("text/")) {
    return "plaintext";
  }
  return undefined;
};

/** Whether an asset holds editable text content. */
export const isTextAsset = (asset: TextAssetLike): boolean =>
  languageFromAsset(asset) !== undefined;

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Whether an asset is an Excel workbook (.xlsx) the table editor can open.
 * Legacy binary .xls and macro-enabled .xlsm are excluded: the workbook
 * writer cannot round-trip them.
 */
export const isSpreadsheetAsset = (asset: TextAssetLike): boolean =>
  asset.content_type === XLSX_CONTENT_TYPE ||
  (asset.name ?? "").toLowerCase().endsWith(".xlsx");

const MARKDOWN_CONTENT_TYPES = new Set([
  "text/markdown",
  "text/x-markdown"
]);
const MARKDOWN_EXTENSION = /\.(md|markdown)$/i;

const SPECIFIC_IMPORTABLE_DOCUMENT_TYPES = new Set([
  "text/markdown",
  "text/x-markdown",
  "text/html",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);
const GENERIC_OR_TEXT_DOCUMENT_TYPES = new Set([
  "",
  "text/plain",
  "application/octet-stream"
]);
const IMPORTABLE_DOCUMENT_EXTENSION =
  /\.(md|markdown|txt|html|htm|docx|pdf)$/i;

/** File picker `accept` string for editable Markdown documents. */
export const MARKDOWN_DOCUMENT_ACCEPT = ".md,.markdown,text/markdown";

/** Electron file dialog extensions for editable Markdown documents. */
export const MARKDOWN_DOCUMENT_EXTENSIONS = ["md", "markdown"] as const;

/** File picker `accept` string for `DocumentInput` (Markdown + convertible formats). */
export const IMPORTABLE_DOCUMENT_ACCEPT =
  ".md,.markdown,.txt,.html,.htm,.docx,.pdf,text/markdown,text/plain,text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Electron file dialog extensions for `DocumentInput`. */
export const IMPORTABLE_DOCUMENT_EXTENSIONS = [
  "md",
  "markdown",
  "txt",
  "html",
  "htm",
  "docx",
  "pdf"
] as const;

/** Whether a file or asset is already an editable Markdown document. */
export const isEditableMarkdownDocument = (
  contentType: string | null | undefined,
  name: string | null | undefined
): boolean => {
  const mime = (contentType ?? "").toLowerCase().split(";")[0].trim();
  if (MARKDOWN_CONTENT_TYPES.has(mime)) {
    return true;
  }
  return (
    Boolean(name && MARKDOWN_EXTENSION.test(name)) &&
    GENERIC_OR_TEXT_DOCUMENT_TYPES.has(mime)
  );
};

/**
 * Whether a file or asset can be accepted by `DocumentInput` (either already
 * Markdown or convertible via document import: `.txt`, `.html`, `.docx`, `.pdf`).
 */
export const isImportableDocument = (
  contentType: string | null | undefined,
  name: string | null | undefined
): boolean => {
  const mime = (contentType ?? "").toLowerCase().split(";")[0].trim();
  if (SPECIFIC_IMPORTABLE_DOCUMENT_TYPES.has(mime)) {
    return true;
  }
  if (!GENERIC_OR_TEXT_DOCUMENT_TYPES.has(mime)) {
    return false;
  }
  if (name && IMPORTABLE_DOCUMENT_EXTENSION.test(name)) {
    return true;
  }
  return mime === "text/plain" && Boolean(name && !name.includes("."));
};

/** How a text asset should be rendered/edited, beyond raw language. */
type PreviewKind = "markdown" | "csv" | "code" | "text";

const isCsvName = (name: string): boolean =>
  name.endsWith(".csv") || name.endsWith(".tsv");

/**
 * Classify a text asset for the editor/preview surfaces:
 * - `markdown` → rendered markdown,
 * - `csv`      → tabular (data-table editor / MUI table view),
 * - `code`     → syntax-highlighted (Monaco),
 * - `text`     → plain text.
 */
export const previewKind = (asset: TextAssetLike): PreviewKind => {
  const language = languageFromAsset(asset);
  const name = (asset.name ?? "").toLowerCase();
  if (language === "markdown") return "markdown";
  if (isCsvName(name)) return "csv";
  if (language && language !== "plaintext") return "code";
  return "text";
};
