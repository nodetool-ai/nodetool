// assetLanguage.ts
// -----------------------------------------------------------------
// Maps an asset's filename / MIME type to a Monaco language id and
// decides whether the asset holds editable text. Shared by the
// workspace text editor (TextDocumentEditor), the legacy file-tab
// editor (FileTabContent) and the tab-type resolver (assetTabType).
// -----------------------------------------------------------------

/** The minimal asset shape needed to detect a text language. */
export interface TextAssetLike {
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
  if (type.startsWith("text/")) {
    return "plaintext";
  }
  return undefined;
};

/** Whether an asset holds editable text content. */
export const isTextAsset = (asset: TextAssetLike): boolean =>
  languageFromAsset(asset) !== undefined;
