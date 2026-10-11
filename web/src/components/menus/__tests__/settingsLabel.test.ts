import { formatSettingLabel } from "../settingsLabel";

describe("formatSettingLabel", () => {
  it("converts UPPER_SNAKE_CASE to sentence case", () => {
    expect(formatSettingLabel("AUTOSAVE_INTERVAL_MINUTES")).toBe(
      "Autosave interval minutes"
    );
  });

  it("preserves known acronyms in upper case", () => {
    expect(formatSettingLabel("API_URL")).toBe("API URL");
    expect(formatSettingLabel("DATABASE_ID")).toBe("Database ID");
  });

  it("handles single word", () => {
    expect(formatSettingLabel("PORT")).toBe("Port");
  });

  it("preserves multi-char acronyms", () => {
    expect(formatSettingLabel("HF_API_URL")).toBe("HF API URL");
    expect(formatSettingLabel("SERP_API_KEY")).toBe("SERP API key");
  });

  it("handles SerpAPI as a special case", () => {
    expect(formatSettingLabel("SERPAPI_KEY")).toBe("SerpAPI key");
  });

  it("handles LLM and MCP acronyms", () => {
    expect(formatSettingLabel("LLM_PROVIDER")).toBe("LLM provider");
    expect(formatSettingLabel("MCP_SERVER_URL")).toBe("MCP server URL");
  });

  it("handles vLLM special casing", () => {
    expect(formatSettingLabel("VLLM_ENDPOINT")).toBe("vLLM endpoint");
  });

  it("capitalizes only the first non-acronym word", () => {
    expect(formatSettingLabel("MAX_RETRIES")).toBe("Max retries");
    expect(formatSettingLabel("LOG_LEVEL")).toBe("Log level");
  });

  it("keeps more acronyms upper-cased", () => {
    expect(formatSettingLabel("ELEVENLABS_TTS_JSON_HTTP")).toBe(
      "Elevenlabs TTS JSON HTTP"
    );
    expect(formatSettingLabel("S3_GPU_TYPE")).toBe("S3 GPU type");
  });

  it("handles already-lowercase input", () => {
    expect(formatSettingLabel("timeout")).toBe("Timeout");
  });
});
