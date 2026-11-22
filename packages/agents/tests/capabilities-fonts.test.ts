/**
 * `list_fonts` — the families a timeline text clip can name, from the same
 * listing the tRPC `fonts.list` procedure returns to the editor.
 */

import { describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { BUNDLED_FONT_FAMILIES } from "@nodetool-ai/timeline";
import { listFontFamilies } from "@nodetool-ai/timeline/fonts/list";
import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";

const ctx = { userId: "fonts-user" } as unknown as ProcessingContext;

function toolFor(name: string) {
  return toolForCapabilityName(name, () =>
    createCapabilityRun({ context: ctx, gate: UNGATED })
  );
}

type FontsResult = {
  fonts: Array<{ name: string; source: string; portable: boolean }>;
};

describe("list_fonts", () => {
  it("returns the editor's listing, bundled families first", async () => {
    const result = (await toolFor("list_fonts").process(ctx, {})) as FontsResult;
    expect(result.fonts).toEqual(listFontFamilies());
    const bundled = result.fonts.slice(0, BUNDLED_FONT_FAMILIES.length);
    expect(bundled.map((f) => f.name)).toEqual([...BUNDLED_FONT_FAMILIES]);
    expect(bundled.every((f) => f.source === "bundled" && f.portable)).toBe(true);
  });

  it("returns only the portable families when asked", async () => {
    const result = (await toolFor("list_fonts").process(ctx, {
      portable_only: true
    })) as FontsResult;
    expect(result.fonts.map((f) => f.name)).toEqual([...BUNDLED_FONT_FAMILIES]);
    expect(result.fonts.every((f) => f.portable)).toBe(true);
  });
});

describe("listFontFamilies", () => {
  it("drops a system family that duplicates a bundled one", () => {
    const first = BUNDLED_FONT_FAMILIES[0];
    const fonts = listFontFamilies([first, "Some Local Face"]);
    expect(fonts.filter((f) => f.name === first)).toHaveLength(1);
    expect(fonts.at(-1)).toEqual({
      name: "Some Local Face",
      source: "system",
      portable: false
    });
  });
});
