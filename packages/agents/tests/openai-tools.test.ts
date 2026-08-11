import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openAiWebSearch } from "../src/tools/openai-tools.js";

// Mock OpenAI to avoid real network calls
const mockCreate = vi.fn();

vi.mock("openai", () => {
  return {
    OpenAI: function () {
      return {
        chat: { completions: { create: mockCreate } }
      };
    }
  };
});

const ctx = {} as any;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setApiKey(key?: string) {
  if (key) {
    process.env["OPENAI_API_KEY"] = key;
  } else {
    delete process.env["OPENAI_API_KEY"];
  }
}

// ---------------------------------------------------------------------------
// The openai web-search backend
// ---------------------------------------------------------------------------

describe("the openai web-search backend", () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env["OPENAI_API_KEY"];
  });
  afterEach(() => {
    if (savedKey !== undefined) process.env["OPENAI_API_KEY"] = savedKey;
    else delete process.env["OPENAI_API_KEY"];
    vi.restoreAllMocks();
  });

  it("returns error when query is missing", async () => {
    setApiKey("fake");
    const result = (await openAiWebSearch(ctx, {})) as any;
    expect(result.error).toBeDefined();
  });

  it("returns error when query is empty string", async () => {
    setApiKey("fake");
    const result = (await openAiWebSearch(ctx, { query: "" })) as any;
    expect(result.error).toBeDefined();
  });

  it("returns error when OPENAI_API_KEY is not set", async () => {
    setApiKey(undefined);
    const result = (await openAiWebSearch(ctx, { query: "test" })) as any;
    expect(result.error).toBeDefined();
  });

  it("returns error shape when API call fails with fake key", async () => {
    setApiKey("fake");
    mockCreate.mockRejectedValueOnce(new Error("Invalid API key"));
    const result = (await openAiWebSearch(ctx, { query: "test query" })) as any;
    // With a fake key the openai SDK will throw, caught and returned as error
    expect(result).toHaveProperty("error");
    expect(typeof result.error).toBe("string");
  });
});

