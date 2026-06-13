import { formatSettingLabel } from "../settingsLabel";

describe("formatSettingLabel", () => {
  it("converts UPPER_SNAKE_CASE to Title Case", () => {
    expect(formatSettingLabel("AUTOSAVE_INTERVAL_MINUTES")).toBe(
      "Autosave Interval Minutes"
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
    expect(formatSettingLabel("SERP_API_KEY")).toBe("SERP API Key");
  });

  it("handles SerpAPI as a special case", () => {
    expect(formatSettingLabel("SERPAPI_KEY")).toBe("SerpAPI Key");
  });

  it("handles LLM and MCP acronyms", () => {
    expect(formatSettingLabel("LLM_PROVIDER")).toBe("LLM Provider");
    expect(formatSettingLabel("MCP_SERVER_URL")).toBe("MCP Server URL");
  });

  it("handles vLLM special casing", () => {
    expect(formatSettingLabel("VLLM_ENDPOINT")).toBe("vLLM Endpoint");
  });

  it("capitalizes non-acronym words", () => {
    expect(formatSettingLabel("MAX_RETRIES")).toBe("Max Retries");
    expect(formatSettingLabel("LOG_LEVEL")).toBe("Log Level");
  });

  it("handles already-lowercase input", () => {
    expect(formatSettingLabel("timeout")).toBe("Timeout");
  });
});
