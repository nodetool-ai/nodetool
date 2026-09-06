/**
 * @jest-environment node
 *
 * The board's drag path, in two halves.
 *
 * `sceneDropTarget` is the pure half: it turns "this card was dropped on that
 * card" into the `(sceneId, position)` `moveShot` takes. The half that follows
 * drives the real store through it and asserts the ordering contract holds
 * afterwards — `shot.index` contiguous `0..n-1`, every scene one unbroken run
 * (PRD § 7.7.3, criterion 9).
 */

import type { Scene, Shot } from "@nodetool-ai/protocol";

import { sceneOrder } from "../../../lib/storyboard/sceneOrder";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { sceneDropTarget } from "../sceneDrop";

const shot = (id: string, index: number, sceneId?: string): Shot => {
  const made: Shot = {
    type: "shot",
    id,
    index,
    action: `action ${id}`,
    status: "planned"
  };
  // An unscened shot has no `scene_id` at all — that is what a legacy board is.
  if (sceneId) {
    made.scene_id = sceneId;
  }
  return made;
};

const scene = (id: string, slugline: string): Scene => ({
  type: "scene",
  id,
  slugline
});

/** Two scenes, two shots each. */
const twoScenes = (): { shots: Shot[]; scenes: Scene[] } => ({
  shots: [
    shot("a1", 0, "sc-a"),
    shot("a2", 1, "sc-a"),
    shot("b1", 2, "sc-b"),
    shot("b2", 3, "sc-b")
  ],
  scenes: [scene("sc-a", "INT. FLAT — DAY"), scene("sc-b", "EXT. STREET — NIGHT")]
});

const groupsOf = (board: { shots: Shot[]; scenes?: Scene[] }) =>
  sceneOrder(board.shots, board.scenes);

describe("sceneDropTarget", () => {
  it("keeps a same-scene drop where the flat grid put it", () => {
    const groups = groupsOf(twoScenes());

    // Forward: the card lands after the target, which is the target's own
    // index once the dragged card has been taken out of the scene.
    expect(sceneDropTarget(groups, "a1", "a2")).toEqual({
      sceneId: "sc-a",
      position: 1
    });
    // Backward: it lands before the target.
    expect(sceneDropTarget(groups, "a2", "a1")).toEqual({
      sceneId: "sc-a",
      position: 0
    });
  });

  it("names the target's scene when the drop crosses a header", () => {
    const groups = groupsOf(twoScenes());

    // Forward across a header: nothing shifted out of the target scene, so
    // landing after its first shot is one past that shot.
    expect(sceneDropTarget(groups, "a1", "b1")).toEqual({
      sceneId: "sc-b",
      position: 1
    });
    // Backward across a header: before the target.
    expect(sceneDropTarget(groups, "b1", "a2")).toEqual({
      sceneId: "sc-a",
      position: 1
    });
  });

  it("reads a legacy board's implicit header as the null scene", () => {
    const groups = sceneOrder([shot("s1", 0), shot("s2", 1), shot("s3", 2)]);

    expect(sceneDropTarget(groups, "s1", "s3")).toEqual({
      sceneId: null,
      position: 2
    });
  });

  it("refuses a drop on the card itself or on an unknown card", () => {
    const groups = groupsOf(twoScenes());

    expect(sceneDropTarget(groups, "a1", "a1")).toBeNull();
    expect(sceneDropTarget(groups, "a1", "nope")).toBeNull();
    expect(sceneDropTarget(groups, "nope", "a1")).toBeNull();
  });
});

/** Every shot's index is `0..n-1` and every scene is one unbroken run. */
const assertOrderingContract = (shots: readonly Shot[]): void => {
  const byIndex = [...shots].sort((a, b) => a.index - b.index);
  expect(byIndex.map((s) => s.index)).toEqual(byIndex.map((_, i) => i));
  const seen = new Set<string | null>();
  let previous: string | null | undefined;
  for (const s of byIndex) {
    const key = s.scene_id ?? null;
    if (key === previous) {
      continue;
    }
    expect(seen.has(key)).toBe(false);
    seen.add(key);
    previous = key;
  }
};

describe("dropping past a scene header (criterion 9)", () => {
  const BOARD = "board-drag";

  const seed = (): void => {
    const store = useStoryboardStore.getState();
    store.removeBoard(BOARD);
    store.ensureBoard(BOARD);
    const { shots, scenes } = twoScenes();
    store.setScreenplay(BOARD, {
      type: "screenplay",
      id: "sp-1",
      title: "Drag test",
      shots,
      scenes
    });
  };

  const board = () => {
    const b = useStoryboardStore.getState().getBoard(BOARD);
    if (!b) {
      throw new Error("board missing");
    }
    return b;
  };

  it("changes the dragged shot's scene and reindexes the board", () => {
    seed();
    const drop = sceneDropTarget(
      sceneOrder(board().shots, board().screenplay?.scenes),
      "a1",
      "b2"
    );
    expect(drop).not.toBeNull();

    useStoryboardStore
      .getState()
      .moveShot(BOARD, "a1", drop!.sceneId, drop!.position);

    const shots = board().shots;
    const moved = shots.find((s) => s.id === "a1");
    expect(moved?.scene_id).toBe("sc-b");
    assertOrderingContract(shots);
    // Dropped on the last card of the second scene, so it lands at the end.
    expect(
      [...shots].sort((a, b) => a.index - b.index).map((s) => s.id)
    ).toEqual(["a2", "b1", "b2", "a1"]);
  });

  it("moves a shot back across the header it came from", () => {
    seed();
    const drop = sceneDropTarget(
      sceneOrder(board().shots, board().screenplay?.scenes),
      "b1",
      "a1"
    );

    useStoryboardStore
      .getState()
      .moveShot(BOARD, "b1", drop!.sceneId, drop!.position);

    const shots = board().shots;
    expect(shots.find((s) => s.id === "b1")?.scene_id).toBe("sc-a");
    assertOrderingContract(shots);
    expect(
      [...shots].sort((a, b) => a.index - b.index).map((s) => s.id)
    ).toEqual(["b1", "a1", "a2", "b2"]);
  });

  it("gives a legacy board a scene rather than leaving the move unscened", () => {
    const store = useStoryboardStore.getState();
    store.removeBoard(BOARD);
    store.ensureBoard(BOARD);
    store.setScreenplay(BOARD, {
      type: "screenplay",
      id: "sp-legacy",
      title: "Legacy board",
      shots: [shot("s1", 0), shot("s2", 1), shot("s3", 2)]
    });

    const drop = sceneDropTarget(sceneOrder(board().shots), "s3", "s1");
    expect(drop).toEqual({ sceneId: null, position: 0 });

    useStoryboardStore
      .getState()
      .moveShot(BOARD, "s3", drop!.sceneId, drop!.position);

    const shots = board().shots;
    assertOrderingContract(shots);
    expect(
      [...shots].sort((a, b) => a.index - b.index).map((s) => s.id)
    ).toEqual(["s3", "s1", "s2"]);
    // The move is scene-creating: every shot now belongs to the one new scene.
    const sceneIds = new Set(shots.map((s) => s.scene_id));
    expect(sceneIds.size).toBe(1);
    expect([...sceneIds][0]).toBeTruthy();
  });
});
