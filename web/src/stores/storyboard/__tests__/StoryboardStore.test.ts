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
