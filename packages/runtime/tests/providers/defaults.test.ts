import { describe, it, expect } from "vitest";
import {
  OLLAMA_DEFAULT_URL,
  LMSTUDIO_DEFAULT_URL
} from "../../src/providers/defaults.js";

describe("local server default URLs", () => {
  it("points Ollama at its standard daemon port", () => {
    expect(OLLAMA_DEFAULT_URL).toBe("http://127.0.0.1:11434");
  });

  it("points LM Studio at its standard OpenAI-compatible port", () => {
    expect(LMSTUDIO_DEFAULT_URL).toBe("http://127.0.0.1:1234");
  });
});
