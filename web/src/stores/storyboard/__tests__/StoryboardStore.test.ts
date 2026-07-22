/**
 * @jest-environment node
 *
 * Version-preserving media on shots: every generated still/clip is kept in
 * `keyframe_versions` / `clip_versions`, and the select* actions switch the
 * active one without dropping the rest.
 */

import type { ImageRef, VideoRef } from "@nodetool-ai/protocol";
import { useStoryboardStore } from "../StoryboardStore";

const BOARD = "board-versions";
const SHOT = "shot-1";

const image = (n: number): ImageRef => ({
  type: "image",
  uri: `http://example.com/still-${n}.png`,
  asset_id: `img-${n}`
});

const video = (n: number): VideoRef => ({
  type: "video",
  uri: `http://example.com/clip-${n}.mp4`,
  asset_id: `vid-${n}`
});

const seed = (): void => {
  const store = useStoryboardStore.getState();
  store.ensureBoard(BOARD);
  store.upsertShot(BOARD, {
    type: "shot",
    id: SHOT,
    index: 0,
    action: "test shot",
    status: "planned"
  });
};

const getShot = () =>
  useStoryboardStore.getState().boards[BOARD]?.shots.find((s) => s.id === SHOT);

afterEach(() => {
  useStoryboardStore.getState().removeBoard(BOARD);
});

describe("setShotKeyframe", () => {
  it("accumulates every still into keyframe_versions", () => {
    seed();
    const store = useStoryboardStore.getState();
    store.setShotKeyframe(BOARD, SHOT, image(1));
    store.setShotKeyframe(BOARD, SHOT, image(2));

    const shot = getShot();
    expect(shot?.keyframe).toEqual(image(2));
    expect(shot?.keyframe_versions).toEqual([image(1), image(2)]);
  });

  it("does not duplicate an already-known still", () => {
    seed();
    const store = useStoryboardStore.getState();
    store.setShotKeyframe(BOARD, SHOT, image(1));
    store.setShotKeyframe(BOARD, SHOT, image(2));
    store.setShotKeyframe(BOARD, SHOT, image(1));

    const shot = getShot();
    expect(shot?.keyframe).toEqual(image(1));
    expect(shot?.keyframe_versions).toEqual([image(1), image(2)]);
  });

  it("seeds versions from a pre-existing single keyframe", () => {
    seed();
    const store = useStoryboardStore.getState();
    store.updateShot(BOARD, SHOT, { keyframe: image(1) });
    store.setShotKeyframe(BOARD, SHOT, image(2));

    expect(getShot()?.keyframe_versions).toEqual([image(1), image(2)]);
  });
});

describe("selectKeyframeVersion", () => {
  it("switches the selected still without dropping versions", () => {
    seed();
    const store = useStoryboardStore.getState();
    store.setShotKeyframe(BOARD, SHOT, image(1));
    store.setShotKeyframe(BOARD, SHOT, image(2));

    store.selectKeyframeVersion(BOARD, SHOT, 0);

    const shot = getShot();
    expect(shot?.keyframe).toEqual(image(1));
    expect(shot?.keyframe_versions).toEqual([image(1), image(2)]);
  });

  it("ignores an out-of-range index", () => {
    seed();
    const store = useStoryboardStore.getState();
    store.setShotKeyframe(BOARD, SHOT, image(1));

    store.selectKeyframeVersion(BOARD, SHOT, 5);

    expect(getShot()?.keyframe).toEqual(image(1));
  });
});

describe("moveShot", () => {
  const seedThree = (): void => {
    const store = useStoryboardStore.getState();
    store.ensureBoard(BOARD);
    for (let i = 0; i < 3; i++) {
      store.upsertShot(BOARD, {
        type: "shot",
        id: `s${i}`,
        index: i,
        action: `shot ${i}`,
        status: "planned"
      });
    }
  };

  const order = () =>
    useStoryboardStore.getState().boards[BOARD]?.shots.map((s) => s.id);

  it("moves a shot later and re-stamps index to match order", () => {
    seedThree();
    useStoryboardStore.getState().moveShot(BOARD, "s0", "down");

    expect(order()).toEqual(["s1", "s0", "s2"]);
    const shots = useStoryboardStore.getState().boards[BOARD]?.shots;
    expect(shots?.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it("moves a shot earlier", () => {
    seedThree();
    useStoryboardStore.getState().moveShot(BOARD, "s2", "up");
    expect(order()).toEqual(["s0", "s2", "s1"]);
  });

  it("is a no-op at the ends", () => {
    seedThree();
    const store = useStoryboardStore.getState();
    store.moveShot(BOARD, "s0", "up");
    store.moveShot(BOARD, "s2", "down");
    expect(order()).toEqual(["s0", "s1", "s2"]);
  });
});

describe("setShotClip / selectClipVersion", () => {
  it("accumulates takes and switches between them", () => {
    seed();
    const store = useStoryboardStore.getState();
    store.setShotClip(BOARD, SHOT, video(1));
    store.setShotClip(BOARD, SHOT, video(2));

    let shot = getShot();
    expect(shot?.clip).toEqual(video(2));
    expect(shot?.clip_versions).toEqual([video(1), video(2)]);

    store.selectClipVersion(BOARD, SHOT, 0);
    shot = getShot();
    expect(shot?.clip).toEqual(video(1));
    expect(shot?.clip_versions).toEqual([video(1), video(2)]);
  });
});

describe("undo/redo", () => {
  const board = () => useStoryboardStore.getState().boards[BOARD];
  const seedShots = (): void => {
    const store = useStoryboardStore.getState();
    store.ensureBoard(BOARD);
    for (let i = 0; i < 3; i++) {
      store.upsertShot(BOARD, {
        type: "shot",
        id: `s${i}`,
        index: i,
        action: `shot ${i}`,
        status: "planned"
      });
    }
  };

  it("undoes and redoes a shot removal", () => {
    seedShots();
    const store = useStoryboardStore.getState();
    store.removeShot(BOARD, "s1");
    expect(board()?.shots.map((s) => s.id)).toEqual(["s0", "s2"]);

    store.undo(BOARD);
    expect(board()?.shots.map((s) => s.id)).toEqual(["s0", "s1", "s2"]);

    store.redo(BOARD);
    expect(board()?.shots.map((s) => s.id)).toEqual(["s0", "s2"]);
  });

  it("keeps selection and shot status live across undo", () => {
    seedShots();
    const store = useStoryboardStore.getState();
    // A tracked content edit, then transient changes that must survive undo.
    store.updateShot(BOARD, "s0", { action: "revised" });
    store.selectShot(BOARD, "s2");
    store.setShotStatus(BOARD, "s0", "keyframe_ready");

    store.undo(BOARD);
    const b = board();
    // Content reverts…
    expect(b?.shots.find((s) => s.id === "s0")?.action).toBe("shot 0");
    // …but selection and generation status stay where they are now.
    expect(b?.activeShotId).toBe("s2");
    expect(b?.shots.find((s) => s.id === "s0")?.status).toBe("keyframe_ready");
  });

  it("does not record selection or status as undo steps", () => {
    seedShots();
    const store = useStoryboardStore.getState();
    const before =
      useStoryboardStore.getState().history[BOARD]?.past.length ?? 0;
    store.selectShot(BOARD, "s1");
    store.setShotStatus(BOARD, "s1", "keyframe_generating");
    const after =
      useStoryboardStore.getState().history[BOARD]?.past.length ?? 0;
    expect(after).toBe(before);
  });

  it("folds rapid edits to one shot field into a single undo step", () => {
    seedShots();
    const store = useStoryboardStore.getState();
    store.updateShot(BOARD, "s0", { action: "a" });
    store.updateShot(BOARD, "s0", { action: "ab" });
    store.updateShot(BOARD, "s0", { action: "abc" });

    store.undo(BOARD);
    expect(board()?.shots.find((s) => s.id === "s0")?.action).toBe("shot 0");
  });

  it("removeBoard drops the board's history", () => {
    seedShots();
    expect(
      useStoryboardStore.getState().history[BOARD]?.past.length
    ).toBeGreaterThan(0);
    useStoryboardStore.getState().removeBoard(BOARD);
    expect(useStoryboardStore.getState().history[BOARD]).toBeUndefined();
  });
});

describe("removeBoard cleanup", () => {
  it("clears a lingering server revision even when no board exists", () => {
    const store = useStoryboardStore.getState();
    // Autosave can set the CAS token before loadBoard ever runs.
    store.setServerRevision(BOARD, "rev-1");
    expect(useStoryboardStore.getState().serverRevisions[BOARD]).toBe("rev-1");

    store.removeBoard(BOARD);
    expect(useStoryboardStore.getState().serverRevisions[BOARD]).toBeUndefined();
  });
});

describe("undo selection safety", () => {
  it("clears activeShotId when undo removes the selected shot", () => {
    const store = useStoryboardStore.getState();
    store.ensureBoard(BOARD);
    // upsertShot is tracked, so its checkpoint predates the shot's existence.
    store.upsertShot(BOARD, {
      type: "shot",
      id: "s0",
      index: 0,
      action: "shot 0",
      status: "planned"
    });
    store.selectShot(BOARD, "s0");
    expect(useStoryboardStore.getState().boards[BOARD]?.activeShotId).toBe("s0");

    // Undo the creation of the selected shot: the selection must not dangle.
    store.undo(BOARD);
    const board = useStoryboardStore.getState().boards[BOARD];
    expect(board?.shots).toHaveLength(0);
    expect(board?.activeShotId).toBeNull();
  });
});
