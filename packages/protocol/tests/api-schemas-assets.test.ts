/**
 * Contract tests for the asset API schemas.
 *
 * The `@`-mention typeahead (AssetMentionPlugin) opens on `@` alone and sends
 * the search query as the user types — starting from an empty string. The
 * schema must therefore accept empty and single-character queries so the
 * typeahead can show a list of assets before the user narrows it down.
 */

import { describe, it, expect } from "vitest";
import { searchInput } from "../src/api-schemas/assets.js";

describe("assets.searchInput", () => {
  it("accepts an empty query (typeahead opened on `@` alone)", () => {
    const result = searchInput.safeParse({ query: "", page_size: 8 });
    expect(result.success).toBe(true);
  });

  it("accepts a single-character query (typeahead mid-typing)", () => {
    const result = searchInput.safeParse({ query: "a", page_size: 8 });
    expect(result.success).toBe(true);
  });

  it("accepts a normal multi-character query", () => {
    const result = searchInput.safeParse({ query: "photo" });
    expect(result.success).toBe(true);
  });

  it("defaults page_size when omitted", () => {
    const result = searchInput.parse({ query: "cat" });
    expect(result.page_size).toBe(200);
  });
});
