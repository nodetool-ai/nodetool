/**
 * Tests for the conflict store — what the document conflict banner offers,
 * and which resolver answers each offer.
 */
import { useConflictStore, clearAllConflicts } from "../ConflictStore";
import type { MergeConflict } from "../documentMerge";

const conflict = (id: string, external: unknown): MergeConflict => ({
  unit: { kind: "shot", id, label: id },
  external,
  reason: "edited"
});

const noop = { onAccept: () => {}, onDiscard: () => {} };

const offered = (key: string): string[] =>
  (useConflictStore.getState().byKey[key]?.conflicts ?? []).map((c) => c.unit.id);

beforeEach(() => clearAllConflicts());

describe("addConflicts", () => {
  it("keeps offers the user has not answered yet", () => {
    // A render batch is one write per shot, so the banner fills over several
    // merges. Replacing the list left every earlier offer unreachable.
    useConflictStore.getState().addConflicts("storyboard:b", [conflict("s1", "still-1")], noop);
    useConflictStore.getState().addConflicts("storyboard:b", [conflict("s2", "still-2")], noop);

    expect(offered("storyboard:b")).toEqual(["s1", "s2"]);
  });

  it("replaces an offer for a unit that is contested again", () => {
    useConflictStore.getState().addConflicts("storyboard:b", [conflict("s1", "first")], noop);
    useConflictStore.getState().addConflicts("storyboard:b", [conflict("s1", "second")], noop);

    const conflicts = useConflictStore.getState().byKey["storyboard:b"]?.conflicts ?? [];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].external).toBe("second");
  });

  it("answers each offer with the resolver that made it", () => {
    // A resolver closes over the server document its own merge fetched, so an
    // older offer must not be handed to a newer merge's callback.
    const accepted: string[] = [];
    useConflictStore.getState().addConflicts("storyboard:b", [conflict("s1", "still-1")], {
      onAccept: (unitId) => accepted.push(`first:${unitId}`),
      onDiscard: () => {}
    });
    useConflictStore.getState().addConflicts("storyboard:b", [conflict("s2", "still-2")], {
      onAccept: (unitId) => accepted.push(`second:${unitId}`),
      onDiscard: () => {}
    });

    useConflictStore.getState().accept("storyboard:b", "s1");
    useConflictStore.getState().accept("storyboard:b", "s2");

    expect(accepted).toEqual(["first:s1", "second:s2"]);
    expect(useConflictStore.getState().byKey["storyboard:b"]).toBeUndefined();
  });

  it("ignores a merge that refused nothing", () => {
    useConflictStore.getState().addConflicts("storyboard:b", [conflict("s1", "still-1")], noop);
    useConflictStore.getState().addConflicts("storyboard:b", [], noop);

    expect(offered("storyboard:b")).toEqual(["s1"]);
  });
});

describe("discard", () => {
  it("drops the offer and the entry once nothing is left", () => {
    const discarded: string[] = [];
    useConflictStore.getState().addConflicts("storyboard:b", [conflict("s1", "x")], {
      onAccept: () => {},
      onDiscard: (unitId) => discarded.push(unitId)
    });

    useConflictStore.getState().discard("storyboard:b", "s1");

    expect(discarded).toEqual(["s1"]);
    expect(useConflictStore.getState().byKey["storyboard:b"]).toBeUndefined();
  });
});

describe("setConflicts", () => {
  it("replaces the list, and an empty one clears the entry", () => {
    useConflictStore.getState().setConflicts("storyboard:b", [conflict("s1", "x")], noop);
    useConflictStore.getState().setConflicts("storyboard:b", [conflict("s2", "y")], noop);
    expect(offered("storyboard:b")).toEqual(["s2"]);

    useConflictStore.getState().setConflicts("storyboard:b", [], noop);
    expect(useConflictStore.getState().byKey["storyboard:b"]).toBeUndefined();
  });
});
