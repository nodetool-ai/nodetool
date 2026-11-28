/**
 * Factory Step Sequencer pattern & template library tests (SQ44).
 */
import { describe, expect, it } from "vitest";
import {
  FACTORY_STEP_PATTERNS,
  FACTORY_STEP_TEMPLATES,
  STEP_PATTERN_ASSET_CONTENT_TYPE,
  expandPattern,
  findFactoryStepPattern,
  listFactoryStepPatterns,
  normalizePattern,
  validateStepPattern
} from "../src/midi/index.js";

describe("SQ44: factory step pattern library", () => {
  it("ships at least 24 patterns covering required styles and at least 8 templates", () => {
    expect(STEP_PATTERN_ASSET_CONTENT_TYPE).toBe("application/x-nodetool-step-pattern");
    expect(FACTORY_STEP_PATTERNS.length).toBeGreaterThanOrEqual(24);
    expect(FACTORY_STEP_TEMPLATES.length).toBeGreaterThanOrEqual(8);

    for (const required of [
      "Four-on-the-Floor",
      "Boom Bap",
      "Trap",
      "Breakbeat",
      "House",
      "Techno",
      "Half-Time",
      "Shuffle"
    ]) {
      expect(findFactoryStepPattern(required), `missing ${required}`).toBeDefined();
    }
    const categories = new Set(FACTORY_STEP_PATTERNS.map((e) => e.category));
    expect(categories.has("drums")).toBe(true);
    expect(categories.has("bass")).toBe(true);
    expect(categories.has("keys")).toBe(true);
    expect(categories.has("arps")).toBe(true);
  });

  it("every factory pattern passes normalizePattern, validateStepPattern and expands without error", () => {
    const ids = new Set<string>();
    for (const entry of FACTORY_STEP_PATTERNS) {
      expect(ids.has(entry.id), `duplicate id ${entry.id}`).toBe(false);
      ids.add(entry.id);
      const norm = normalizePattern(entry.pattern);
      expect(validateStepPattern(norm)).toEqual([]);
      const expanded = expandPattern(norm, { clipLengthTicks: 4 * 3840 });
      expect(
        expanded.notes.length + expanded.controllers.length + expanded.deviceAutomation.length,
        `empty factory pattern ${entry.id}`
      ).toBeGreaterThan(0);
    }
  });

  it("every factory template has rows, passes validation and has no active steps", () => {
    for (const entry of FACTORY_STEP_TEMPLATES) {
      const norm = normalizePattern(entry.pattern);
      expect(validateStepPattern(norm)).toEqual([]);
      expect(norm.rows.length).toBeGreaterThan(0);
      for (const row of norm.rows) {
        expect(row.steps.every((s) => Object.keys(s).length === 0)).toBe(true);
      }
    }
  });

  it("listFactoryStepPatterns filters by query, kind and category", () => {
    const boom = listFactoryStepPatterns({ query: "boom", kind: "pattern" });
    expect(boom.some((e) => e.name === "Boom Bap")).toBe(true);
    const tpls = listFactoryStepPatterns({ kind: "template" });
    expect(tpls.length).toBe(FACTORY_STEP_TEMPLATES.length);
    const bass = listFactoryStepPatterns({ kind: "pattern", category: "bass" });
    expect(bass.length).toBeGreaterThanOrEqual(4);
  });
});
