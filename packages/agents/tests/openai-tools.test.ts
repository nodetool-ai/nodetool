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

  // The guards have to be what refuses, and they have to refuse before the
  // completion call — otherwise an empty query reaches the search model and is
  // billed, and the run only fails later on whatever the SDK says back.
  it.each([
    ["missing", {}],
    ["empty string", { query: "" }]
  ])("refuses a %s query without calling the model", async (_label, params) => {
    setApiKey("fake");
    mockCreate.mockClear();
    const result = (await openAiWebSearch(ctx, params)) as any;
    expect(result.error).toBe("Search query is required");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses without calling the model when OPENAI_API_KEY is not set", async () => {
    setApiKey(undefined);
    mockCreate.mockClear();
    const result = (await openAiWebSearch(ctx, { query: "test" })) as any;
    expect(result.error).toContain("OPENAI_API_KEY is not set");
    expect(mockCreate).not.toHaveBeenCalled();
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

