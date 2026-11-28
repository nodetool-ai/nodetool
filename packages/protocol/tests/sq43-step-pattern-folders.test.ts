/**
 * SQ43 Step Pattern Library Folder Operations — Protocol schemas & contracts.
 */
import { describe, expect, it } from "vitest";
import { uiToolParams } from "../src/api-schemas/ui-tool-contract.js";
import { buildTimelineToolContracts } from "../src/api-schemas/timeline-tool-contracts.js";
import {
  SHARED_TIMELINE_TOOL_NAMES,
  listStepPatternsParams
} from "../src/api-schemas/timeline-tool-params.js";

const VOCAB = {
  staggerUnits: ["word", "character", "line"] as [string, ...string[]],
  animatedProperties: ["offsetX", "offsetY", "opacity"],
  beatToleranceMs: 60
};

describe("SQ43 step pattern folder protocol contracts", () => {
  const contracts = buildTimelineToolContracts(VOCAB);

  it("registers all four step pattern folder tools in SHARED_TIMELINE_TOOL_NAMES and contracts", () => {
    const folderTools = [
      "ui_timeline_create_step_pattern_folder",
      "ui_timeline_rename_step_pattern_folder",
      "ui_timeline_delete_step_pattern_folder",
      "ui_timeline_move_step_pattern"
    ] as const;

    for (const name of folderTools) {
      expect(SHARED_TIMELINE_TOOL_NAMES).toContain(name);
      const contract = (contracts as Record<string, { description: string }>)[name];
      expect(contract, `missing contract ${name}`).toBeDefined();
      expect(contract!.description.length).toBeGreaterThan(20);
    }
  });

  it("validates create, rename, delete folder and move pattern params strictly", () => {
    const createSchema = uiToolParams(
      (contracts as Record<string, never>)["ui_timeline_create_step_pattern_folder"]
    );
    expect(
      createSchema.parse({
        name: "Drums",
        kind: "pattern",
        parentFolder: "aabbccddeeff"
      })
    ).toEqual({
      name: "Drums",
      kind: "pattern",
      parentFolder: "aabbccddeeff"
    });
    expect(createSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createSchema.safeParse({ name: "Drums", extra: 1 }).success).toBe(false);

    const renameSchema = uiToolParams(
      (contracts as Record<string, never>)["ui_timeline_rename_step_pattern_folder"]
    );
    expect(
      renameSchema.parse({
        folder: "aabbccddeeff",
        newName: "Percussion",
        kind: "pattern"
      })
    ).toEqual({
      folder: "aabbccddeeff",
      newName: "Percussion",
      kind: "pattern"
    });
    expect(renameSchema.safeParse({ folder: "Drums", newName: "" }).success).toBe(false);
    expect(
      renameSchema.safeParse({ folder: "Drums", newName: "Perc", extra: true }).success
    ).toBe(false);

    const deleteSchema = uiToolParams(
      (contracts as Record<string, never>)["ui_timeline_delete_step_pattern_folder"]
    );
    expect(deleteSchema.parse({ folder: "aabbccddeeff" })).toEqual({
      folder: "aabbccddeeff"
    });
    expect(deleteSchema.safeParse({ folder: "" }).success).toBe(false);
    expect(deleteSchema.safeParse({ folder: "Drums", extra: true }).success).toBe(false);

    const moveSchema = uiToolParams(
      (contracts as Record<string, never>)["ui_timeline_move_step_pattern"]
    );
    expect(
      moveSchema.parse({ pattern: "112233445566", folder: "aabbccddeeff" })
    ).toEqual({
      pattern: "112233445566",
      folder: "aabbccddeeff"
    });
    expect(moveSchema.parse({ pattern: "112233445566", folder: null })).toEqual({
      pattern: "112233445566",
      folder: null
    });
    expect(moveSchema.parse({ pattern: "112233445566" })).toEqual({
      pattern: "112233445566"
    });
    expect(moveSchema.safeParse({ pattern: "" }).success).toBe(false);
    expect(
      moveSchema.safeParse({ pattern: "Beat", folder: "Drums", extra: 1 }).success
    ).toBe(false);
  });

  it("allows optional folder filter on list_step_patterns", () => {
    expect(listStepPatternsParams.parse({ folder: "Drums" })).toEqual({
      folder: "Drums"
    });
  });
});
