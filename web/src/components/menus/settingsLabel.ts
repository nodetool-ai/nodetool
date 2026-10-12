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
  seo: "SEO",
  tts: "TTS",
  gpu: "GPU",
  s3: "S3",
  json: "JSON",
  http: "HTTP"
};

/** "AUTOSAVE_INTERVAL_MINUTES" → "Autosave interval minutes" (acronyms kept). */
export const formatSettingLabel = (envVar: string): string =>
  envVar
    .toLowerCase()
    .split("_")
    .map(
      (word, index) =>
        LABEL_ACRONYMS[word] ??
        (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)
    )
    .join(" ");