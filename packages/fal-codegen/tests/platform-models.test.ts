import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchAllActiveCatalogModels,
  mapFalCategoryToModuleKey,
  parseRetryAfterMs,
} from "../src/platform-models.js";

describe("mapFalCategoryToModuleKey", () => {
  it("maps dashed categories to module keys", () => {
    expect(mapFalCategoryToModuleKey("text-to-image")).toBe("text_to_image");
    expect(mapFalCategoryToModuleKey("image-to-video")).toBe("image_to_video");
  });

  it("maps json to json_processing", () => {
    expect(mapFalCategoryToModuleKey("json")).toBe("json_processing");
  });

  it("returns unknown for missing or unmapped categories", () => {
    expect(mapFalCategoryToModuleKey(undefined)).toBe("unknown");
    expect(mapFalCategoryToModuleKey("")).toBe("unknown");
    expect(mapFalCategoryToModuleKey("not-a-real-category-xyz")).toBe(
      "unknown",
    );
  });
});

describe("parseRetryAfterMs", () => {
  it("parses delay-seconds", () => {
    const res = new Response(null, { headers: { "retry-after": "3" } });
    expect(parseRetryAfterMs(res)).toBe(3000);
  });

  it("returns undefined when header absent", () => {
    const res = new Response(null);
    expect(parseRetryAfterMs(res)).toBeUndefined();
  });
});

describe("fetchAllActiveCatalogModels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries catalog GET on 429 then succeeds", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const okBody = JSON.stringify({
      models: [
        {
          endpoint_id: "test/inference",
          metadata: { kind: "inference", category: "text-to-image" },
        },
      ],
      has_more: false,
    });

    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 429,
          headers: { "retry-after": "0" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(okBody, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const p = fetchAllActiveCatalogModels();
    await vi.runAllTimersAsync();
    const r = await p;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.models.map((m) => m.endpoint_id)).toEqual(["test/inference"]);
  });
});
