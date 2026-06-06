/** Acronyms that should stay upper-cased in setting labels. */
const LABEL_ACRONYMS: Record<string, string> = {
  api: "API",
  url: "URL",
  id: "ID",
  js: "JS",
  db: "DB",
  hf: "HF",
  serp: "SERP",
  serpapi: "SerpAPI",
  vllm: "vLLM",
  llm: "LLM",
  mcp: "MCP",
  seo: "SEO"
};

/** "AUTOSAVE_INTERVAL_MINUTES" → "Autosave Interval Minutes" (acronyms kept). */
export const formatSettingLabel = (envVar: string): string =>
  envVar
    .toLowerCase()
    .split("_")
    .map(
      (word) =>
        LABEL_ACRONYMS[word] ?? word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
