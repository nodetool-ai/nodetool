import {
  SKETCH_ACTION_IDS,
  ACTION_REGISTRY,
  ACTION_MAP
} from "../actionRegistry";
import type { SketchActionId } from "../actionRegistry";

describe("actionRegistry data integrity", () => {
  it("ACTION_REGISTRY covers every SKETCH_ACTION_IDS entry", () => {
    const registryIds = new Set(ACTION_REGISTRY.map((a) => a.id));
    for (const id of SKETCH_ACTION_IDS) {
      expect(registryIds.has(id)).toBe(true);
    }
  });

  it("ACTION_REGISTRY contains no duplicate ids", () => {
    const ids = ACTION_REGISTRY.map((a) => a.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("every registry entry has a non-empty label", () => {
    for (const action of ACTION_REGISTRY) {
      expect(action.label.length).toBeGreaterThan(0);
    }
  });

  it("every registry entry has a valid displayGroup", () => {
    const validGroups = [
      "Edit",
      "Selection",
      "Canvas",
      "Color",
      "Paint",
      "Layers",
      "Tools",
      "Mode: Transform",
      "Mode: Crop"
    ];
    for (const action of ACTION_REGISTRY) {
      expect(validGroups).toContain(action.displayGroup);
    }
  });

  it("ACTION_MAP contains the same entries as ACTION_REGISTRY", () => {
    expect(ACTION_MAP.size).toBe(ACTION_REGISTRY.length);
    for (const action of ACTION_REGISTRY) {
      expect(ACTION_MAP.get(action.id)).toBe(action);
    }
  });

  it("ACTION_MAP lookup returns correct action", () => {
    const undo = ACTION_MAP.get("undo" as SketchActionId);
    expect(undo).toBeDefined();
    expect(undo!.label).toBe("Undo");
    expect(undo!.displayGroup).toBe("Edit");
  });
});
