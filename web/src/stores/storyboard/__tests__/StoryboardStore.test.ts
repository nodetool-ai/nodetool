/**
 * @jest-environment node
 *
 * Two things: version-preserving media on shots (every generated still/clip is
 * kept in `keyframe_versions` / `clip_versions`, and the select* actions switch
 * the active one), and the ordering contract of PRD § 7.7.3 — `shot.index` is
 * `0..n-1` and every scene one unbroken run after each structural operation.
 */

import type {
  Entity,
  ImageRef,
  Scene,
  Shot,
  VideoRef
} from "@nodetool-ai/protocol";
import {
  sceneOrder,
  scenesAreContiguous
} from "../../../lib/storyboard/sceneOrder";
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

describe("nudgeShot", () => {
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
    useStoryboardStore.getState().nudgeShot(BOARD, "s0", "down");

    expect(order()).toEqual(["s1", "s0", "s2"]);
    const shots = useStoryboardStore.getState().boards[BOARD]?.shots;
    expect(shots?.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it("moves a shot earlier", () => {
    seedThree();
    useStoryboardStore.getState().nudgeShot(BOARD, "s2", "up");
    expect(order()).toEqual(["s0", "s2", "s1"]);
  });

  it("is a no-op at the ends", () => {
    seedThree();
    const store = useStoryboardStore.getState();
    store.nudgeShot(BOARD, "s0", "up");
    store.nudgeShot(BOARD, "s2", "down");
    expect(order()).toEqual(["s0", "s1", "s2"]);
  });
});

describe("addShot", () => {
  it("appends a blank planned shot at the end and selects it", () => {
    seed();
    const id = useStoryboardStore.getState().addShot(BOARD);

    const board = useStoryboardStore.getState().boards[BOARD];
    expect(id).not.toBeNull();
    expect(board?.shots.map((s) => s.id)).toEqual([SHOT, id]);
    expect(board?.shots[1]).toMatchObject({
      index: 1,
      action: "",
      status: "planned"
    });
    expect(board?.activeShotId).toBe(id);
  });

  it("returns null for a board the store does not carry", () => {
    expect(useStoryboardStore.getState().addShot("no-such-board")).toBeNull();
  });

  it("is one undo step", () => {
    seed();
    const store = useStoryboardStore.getState();
    store.addShot(BOARD);
    store.undo(BOARD);
    expect(
      useStoryboardStore.getState().boards[BOARD]?.shots.map((s) => s.id)
    ).toEqual([SHOT]);
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

  it("selectShot is idempotent, and null clears the selection", () => {
    seedShots();
    const store = useStoryboardStore.getState();
    store.selectShot(BOARD, "s1");
    expect(board()?.activeShotId).toBe("s1");

    // Programmatic re-select (focus jump, agent bridge) must not toggle.
    store.selectShot(BOARD, "s1");
    expect(board()?.activeShotId).toBe("s1");

    store.selectShot(BOARD, null);
    expect(board()?.activeShotId).toBeNull();
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
    expect(
      useStoryboardStore.getState().serverRevisions[BOARD]
    ).toBeUndefined();
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
    expect(useStoryboardStore.getState().boards[BOARD]?.activeShotId).toBe(
      "s0"
    );

    // Undo the creation of the selected shot: the selection must not dangle.
    store.undo(BOARD);
    const board = useStoryboardStore.getState().boards[BOARD];
    expect(board?.shots).toHaveLength(0);
    expect(board?.activeShotId).toBeNull();
  });
});

describe("setScreenplay", () => {
  const play = (extra: Record<string, unknown> = {}) => ({
    type: "shot" as const,
    id: "sp-shot-1",
    index: 0,
    action: "A lighthouse at dusk",
    status: "planned" as const,
    ...extra
  });

  it("keeps rendered stills and takes when a revised screenplay edits another shot", () => {
    const store = useStoryboardStore.getState();
    const screenplay = {
      type: "screenplay" as const,
      id: "sp-1",
      title: "Two shots",
      shots: [play(), play({ id: "sp-shot-2", index: 1, action: "The keeper" })]
    };
    store.setScreenplay(BOARD, screenplay);
    store.setShotKeyframe(BOARD, "sp-shot-1", image(1));
    store.setShotKeyframe(BOARD, "sp-shot-1", image(2));
    store.selectKeyframeVersion(BOARD, "sp-shot-1", 0);
    store.setShotClip(BOARD, "sp-shot-1", video(1));
    store.setShotClip(BOARD, "sp-shot-1", video(2));
    store.selectClipVersion(BOARD, "sp-shot-1", 0);
    store.setShotStatus(BOARD, "sp-shot-1", "rendered");
    const rendered = useStoryboardStore.getState().boards[BOARD]?.shots[0];

    store.setScreenplay(BOARD, {
      ...screenplay,
      shots: [
        screenplay.shots[0],
        { ...screenplay.shots[1], action: "The keeper waves" }
      ]
    });

    const board = useStoryboardStore.getState().boards[BOARD];
    expect(board?.shots[0]).toEqual(rendered);
    expect(board?.shots[1].action).toBe("The keeper waves");
    expect(board?.shots[0].keyframe_versions).toEqual([image(1), image(2)]);
    expect(board?.shots[0].clip_versions).toEqual([video(1), video(2)]);
  });

  it("keeps newer renders and selections over stale screenplay media", () => {
    const store = useStoryboardStore.getState();
    const screenplay = {
      type: "screenplay" as const,
      id: "sp-1",
      title: "One shot",
      shots: [play({ keyframe: image(1), keyframe_versions: [image(1)] })]
    };
    store.setScreenplay(BOARD, screenplay);
    store.setShotKeyframe(BOARD, "sp-shot-1", image(2));
    store.setShotStatus(BOARD, "sp-shot-1", "keyframe_ready");
    store.setScreenplay(BOARD, screenplay);
    const shot = useStoryboardStore.getState().boards[BOARD]?.shots[0];
    expect(shot?.keyframe).toEqual(image(2));
    expect(shot?.keyframe_versions).toEqual([image(1), image(2)]);
    expect(shot?.status).toBe("keyframe_ready");

    store.removeKeyframeVersion(BOARD, "sp-shot-1", 1);
    store.removeKeyframeVersion(BOARD, "sp-shot-1", 0);
    store.setScreenplay(BOARD, screenplay);
    expect(
      useStoryboardStore.getState().boards[BOARD]?.shots[0].keyframe
    ).toBeNull();
  });

  it("retains a render in progress and attaches its result after the screenplay edit", () => {
    const store = useStoryboardStore.getState();
    const screenplay = {
      type: "screenplay" as const,
      id: "sp-1",
      title: "One shot",
      shots: [play()]
    };
    store.setScreenplay(BOARD, screenplay);
    store.setShotStatus(BOARD, "sp-shot-1", "keyframe_generating");
    store.setScreenplay(BOARD, { ...screenplay, title: "New title" });
    expect(useStoryboardStore.getState().boards[BOARD]?.shots[0].status).toBe(
      "keyframe_generating"
    );
    store.setShotKeyframe(BOARD, "sp-shot-1", image(1));
    expect(
      useStoryboardStore.getState().boards[BOARD]?.shots[0].keyframe
    ).toEqual(image(1));
  });

  it("does not transfer media to new shot ids when replacing the screenplay", () => {
    const store = useStoryboardStore.getState();
    seed();
    store.setShotKeyframe(BOARD, SHOT, image(1));
    store.setScreenplay(BOARD, {
      type: "screenplay",
      id: "sp-2",
      title: "New direction",
      shots: [play()]
    });
    expect(useStoryboardStore.getState().boards[BOARD]?.shots).toEqual([
      play()
    ]);
  });

  it("takes brief, style and shots from the screenplay", () => {
    const store = useStoryboardStore.getState();
    store.ensureBoard(BOARD);
    store.setScreenplay(BOARD, {
      type: "screenplay",
      id: "sp-1",
      title: "Lighthouse Dawn",
      brief: "A keeper's last night",
      style_bible: "noir, high contrast",
      shots: [play({ duration_seconds: 4 })]
    });

    const board = useStoryboardStore.getState().boards[BOARD];
    expect(board?.brief).toBe("A keeper's last night");
    expect(board?.style).toBe("noir, high contrast");
    expect(board?.title).toBe("Lighthouse Dawn");
    expect(board?.shots[0].duration_seconds).toBe(4);
  });

  it("casts the screenplay's entity_ids on the board", () => {
    const store = useStoryboardStore.getState();
    store.ensureBoard(BOARD);
    store.setScreenplay(BOARD, {
      type: "screenplay",
      id: "sp-1",
      title: "Four Dogs",
      entity_ids: ["ent-buddy", "ent-winston"],
      shots: [play()]
    });

    // `entityIds` is what seasons each shot prompt — a screenplay that names
    // its cast and leaves the board empty generates the entities out.
    expect(useStoryboardStore.getState().boards[BOARD]?.entityIds).toEqual([
      "ent-buddy",
      "ent-winston"
    ]);
  });

  it("keeps the board's cast when the screenplay names none", () => {
    const store = useStoryboardStore.getState();
    store.ensureBoard(BOARD);
    store.setEntityIds(BOARD, ["ent-buddy"]);
    store.setScreenplay(BOARD, {
      type: "screenplay",
      id: "sp-1",
      title: "T",
      shots: [play()]
    });

    expect(useStoryboardStore.getState().boards[BOARD]?.entityIds).toEqual([
      "ent-buddy"
    ]);
  });

  it("fills an empty brief from the logline but never overwrites one", () => {
    const store = useStoryboardStore.getState();
    store.ensureBoard(BOARD);
    store.setScreenplay(BOARD, {
      type: "screenplay",
      id: "sp-1",
      title: "T",
      logline: "The light goes dark",
      shots: [play()]
    });
    expect(useStoryboardStore.getState().boards[BOARD]?.brief).toBe(
      "The light goes dark"
    );

    store.setBrief(BOARD, "My own brief");
    store.setScreenplay(BOARD, {
      type: "screenplay",
      id: "sp-2",
      title: "T",
      logline: "A different logline",
      shots: [play()]
    });
    expect(useStoryboardStore.getState().boards[BOARD]?.brief).toBe(
      "My own brief"
    );
  });
});

// ── Ordering contract (PRD § 7.7.3) ─────────────────────────────────────────

const SCENE_BOARD = "board-scenes";

const sceneShot = (id: string, index: number, sceneId?: string): Shot => {
  const shot: Shot = {
    type: "shot",
    id,
    index,
    action: `shot ${id}`,
    status: "planned"
  };
  if (sceneId) {
    shot.scene_id = sceneId;
  }
  return shot;
};

const sceneOf = (id: string, slugline: string): Scene => ({
  type: "scene",
  id,
  slugline
});

/** Three scenes, five shots: sc-a [a1 a2], sc-b [b1 b2], sc-c [c1]. */
const seedScenes = (): void => {
  const scenes = [
    sceneOf("sc-a", "INT. FLAT"),
    sceneOf("sc-b", "EXT. STREET"),
    sceneOf("sc-c", "INT. CAR")
  ];
  const shots = [
    sceneShot("a1", 0, "sc-a"),
    sceneShot("a2", 1, "sc-a"),
    sceneShot("b1", 2, "sc-b"),
    sceneShot("b2", 3, "sc-b"),
    sceneShot("c1", 4, "sc-c")
  ];
  useStoryboardStore.getState().loadBoard(SCENE_BOARD, {
    screenplay: {
      type: "screenplay",
      id: "play-1",
      title: "Fixture",
      shots,
      scenes
    },
    shots,
    title: "Fixture",
    brief: "",
    style: "",
    entityIds: [],
    aspectRatio: "16:9",
    setupStage: "done",
    genre: "",
    directorModel: null,
    imageModel: null,
    videoModel: null,
    activeShotId: null,
    timelineId: null
  });
};

/** Three legacy shots with no `scene_id` and no scenes. */
const seedLegacy = (): void => {
  const shots = [sceneShot("s0", 0), sceneShot("s1", 1), sceneShot("s2", 2)];
  useStoryboardStore.getState().loadBoard(SCENE_BOARD, {
    screenplay: null,
    shots,
    title: "Legacy",
    brief: "",
    style: "",
    entityIds: [],
    aspectRatio: "16:9",
    setupStage: "done",
    genre: "",
    directorModel: null,
    imageModel: null,
    videoModel: null,
    activeShotId: null,
    timelineId: null
  });
};

const sceneBoard = () => useStoryboardStore.getState().boards[SCENE_BOARD];

/** The document fields a structural operation is allowed to move. */
const shape = () => ({
  shots: sceneBoard()?.shots.map((s) => ({
    id: s.id,
    index: s.index,
    scene: s.scene_id ?? null
  })),
  scenes: sceneBoard()?.screenplay?.scenes?.map((s) => ({
    id: s.id,
    slugline: s.slugline,
    lighting: s.lighting ?? null
  }))
});

const undoDepth = (): number =>
  useStoryboardStore.getState().history[SCENE_BOARD]?.past.length ?? 0;

/** The ordering invariant: `0..n-1`, and every scene one unbroken run. */
const expectOrdered = (): void => {
  const shots = sceneBoard()?.shots ?? [];
  expect(shots.map((s) => s.index)).toEqual(shots.map((_, i) => i));
  expect(scenesAreContiguous(shots)).toBe(true);
};

afterEach(() => {
  useStoryboardStore.getState().removeBoard(SCENE_BOARD);
});

describe("structural operations", () => {
  const operations: Array<[string, () => void]> = [
    [
      "moveShot",
      () => useStoryboardStore.getState().moveShot(SCENE_BOARD, "a1", "sc-c", 0)
    ],
    [
      "insertShot",
      () => useStoryboardStore.getState().insertShot(SCENE_BOARD, "b1")
    ],
    [
      "duplicateShot",
      () => useStoryboardStore.getState().duplicateShot(SCENE_BOARD, "a1")
    ],
    [
      "removeShot",
      () => useStoryboardStore.getState().removeShot(SCENE_BOARD, "b1")
    ],
    [
      "reorderShots",
      () =>
        useStoryboardStore
          .getState()
          .reorderShots(SCENE_BOARD, ["a2", "a1", "b1", "b2", "c1"])
    ],
    [
      "updateScene",
      () =>
        useStoryboardStore
          .getState()
          .updateScene(SCENE_BOARD, "sc-b", { lighting: "sodium" })
    ],
    [
      "createScene",
      () => useStoryboardStore.getState().createScene(SCENE_BOARD, "sc-a")
    ],
    [
      "mergeSceneIntoPrevious",
      () =>
        useStoryboardStore
          .getState()
          .mergeSceneIntoPrevious(SCENE_BOARD, "sc-b")
    ]
  ];

  it.each(operations)(
    "%s reindexes and keeps scenes contiguous",
    (_name, run) => {
      seedScenes();
      run();
      expectOrdered();
    }
  );

  it.each(operations)("%s is exactly one undo entry", (_name, run) => {
    seedScenes();
    const before = shape();
    expect(undoDepth()).toBe(0);

    run();
    expect(shape()).not.toEqual(before);
    expect(undoDepth()).toBe(1);

    useStoryboardStore.getState().undo(SCENE_BOARD);
    expect(shape()).toEqual(before);
    expect(undoDepth()).toBe(0);
  });
});

describe("moveShot", () => {
  it("moves a shot into another scene at the given position", () => {
    seedScenes();
    useStoryboardStore.getState().moveShot(SCENE_BOARD, "a1", "sc-b", 1);

    expect(sceneBoard()?.shots.map((s) => s.id)).toEqual([
      "a2",
      "b1",
      "a1",
      "b2",
      "c1"
    ]);
    expect(sceneBoard()?.shots.find((s) => s.id === "a1")?.scene_id).toBe(
      "sc-b"
    );
    expectOrdered();
  });

  it("clamps a position past the end of the target scene", () => {
    seedScenes();
    useStoryboardStore.getState().moveShot(SCENE_BOARD, "c1", "sc-a", 99);

    expect(sceneBoard()?.shots.map((s) => s.id)).toEqual([
      "a1",
      "a2",
      "c1",
      "b1",
      "b2"
    ]);
    expectOrdered();
  });

  it("reorders within a scene without touching the others", () => {
    seedScenes();
    useStoryboardStore.getState().moveShot(SCENE_BOARD, "b2", "sc-b", 0);

    expect(sceneBoard()?.shots.map((s) => s.id)).toEqual([
      "a1",
      "a2",
      "b2",
      "b1",
      "c1"
    ]);
  });

  it("drops the scene its last shot leaves", () => {
    seedScenes();
    useStoryboardStore.getState().moveShot(SCENE_BOARD, "c1", "sc-a", 0);

    expect(sceneBoard()?.screenplay?.scenes?.map((s) => s.id)).toEqual([
      "sc-a",
      "sc-b"
    ]);
  });

  it("ignores a shot the board does not carry", () => {
    seedScenes();
    useStoryboardStore.getState().moveShot(SCENE_BOARD, "ghost", "sc-a", 0);
    expect(undoDepth()).toBe(0);
  });
});

describe("legacy boards", () => {
  it("renders unscened shots under the implicit header", () => {
    seedLegacy();
    const groups = sceneOrder(
      sceneBoard()?.shots ?? [],
      sceneBoard()?.screenplay?.scenes
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].sceneId).toBeNull();
    expect(groups[0].shots.map((s) => s.id)).toEqual(["s0", "s1", "s2"]);
  });

  it("assigns every unscened shot to one new scene on the first move", () => {
    seedLegacy();
    useStoryboardStore.getState().moveShot(SCENE_BOARD, "s2", null, 0);

    const shots = sceneBoard()?.shots ?? [];
    const sceneIds = new Set(shots.map((s) => s.scene_id));
    expect(sceneIds.size).toBe(1);
    expect([...sceneIds][0]).toBeDefined();
    expect(sceneBoard()?.screenplay?.scenes).toHaveLength(1);
    expect(shots.map((s) => s.id)).toEqual(["s2", "s0", "s1"]);
    expectOrdered();
  });

  it("assigns them in index order when a new scene is created", () => {
    seedLegacy();
    const created = useStoryboardStore.getState().createScene(SCENE_BOARD);

    const shots = sceneBoard()?.shots ?? [];
    const legacyScene = shots[0].scene_id;
    expect(shots.slice(0, 3).map((s) => s.id)).toEqual(["s0", "s1", "s2"]);
    expect(shots.slice(0, 3).every((s) => s.scene_id === legacyScene)).toBe(
      true
    );
    expect(shots[3].scene_id).toBe(created);
    expect(sceneBoard()?.screenplay?.scenes).toHaveLength(2);
  });

  it("does not materialize a scene for a non-scene operation", () => {
    seedLegacy();
    useStoryboardStore.getState().insertShot(SCENE_BOARD, "s0");

    expect(sceneBoard()?.screenplay).toBeNull();
    expect(sceneBoard()?.shots.every((s) => !s.scene_id)).toBe(true);
  });
});

describe("insertShot", () => {
  it("inserts a blank shot after the source, in its scene", () => {
    seedScenes();
    const id = useStoryboardStore.getState().insertShot(SCENE_BOARD, "b1");

    const shots = sceneBoard()?.shots ?? [];
    expect(shots.map((s) => s.id)).toEqual(["a1", "a2", "b1", id, "b2", "c1"]);
    expect(shots[3]).toMatchObject({
      action: "",
      status: "planned",
      scene_id: "sc-b"
    });
    expect(sceneBoard()?.activeShotId).toBe(id);
  });

  it("appends when no shot is named", () => {
    seedScenes();
    const id = useStoryboardStore.getState().insertShot(SCENE_BOARD);
    expect(sceneBoard()?.shots.at(-1)?.id).toBe(id);
  });
});

describe("duplicateShot", () => {
  it("copies the direction and media but not the script link", () => {
    seedScenes();
    const store = useStoryboardStore.getState();
    store.updateShot(SCENE_BOARD, "a1", {
      dialogue: "Say it again",
      notes: "hold the beat",
      duration_seconds: 4,
      duration_source: "audio",
      entity_ids: ["e-marta"],
      keyframe: image(1),
      keyframe_versions: [image(1), image(2)],
      script_line_ids: ["line-1"],
      script_text_snapshot: "Say it again",
      covered_by: { shot_id: "b1", start_seconds: 0 }
    });

    const id = store.duplicateShot(SCENE_BOARD, "a1");
    const shots = sceneBoard()?.shots ?? [];
    const copy = shots.find((s) => s.id === id);

    expect(shots.map((s) => s.id)).toEqual(["a1", id, "a2", "b1", "b2", "c1"]);
    expect(copy).toMatchObject({
      action: "shot a1",
      dialogue: "Say it again",
      notes: "hold the beat",
      duration_seconds: 4,
      duration_source: "manual",
      entity_ids: ["e-marta"],
      scene_id: "sc-a",
      status: "planned"
    });
    expect(copy?.keyframe).toEqual(image(1));
    expect(copy?.keyframe_versions).toEqual([image(1), image(2)]);
    expect(copy?.script_line_ids).toBeUndefined();
    expect(copy?.script_text_snapshot).toBeUndefined();
    expect(copy?.covered_by).toBeUndefined();
    // The source keeps its link.
    expect(shots.find((s) => s.id === "a1")?.script_line_ids).toEqual([
      "line-1"
    ]);
  });

  it("returns null for a shot the board does not carry", () => {
    seedScenes();
    expect(
      useStoryboardStore.getState().duplicateShot(SCENE_BOARD, "ghost")
    ).toBeNull();
  });
});

describe("reorderShots", () => {
  it("refuses an order that splits a scene", () => {
    seedScenes();
    const before = shape();

    useStoryboardStore
      .getState()
      .reorderShots(SCENE_BOARD, ["a1", "b1", "a2", "b2", "c1"]);

    expect(shape()).toEqual(before);
    expect(undoDepth()).toBe(0);
  });

  it("accepts an order that keeps every scene whole", () => {
    seedScenes();
    useStoryboardStore
      .getState()
      .reorderShots(SCENE_BOARD, ["c1", "b1", "b2", "a1", "a2"]);

    expect(sceneBoard()?.shots.map((s) => s.id)).toEqual([
      "c1",
      "b1",
      "b2",
      "a1",
      "a2"
    ]);
    expectOrdered();
  });
});

describe("scene operations", () => {
  it("updateScene patches the slugline and lighting", () => {
    seedScenes();
    useStoryboardStore
      .getState()
      .updateScene(SCENE_BOARD, "sc-b", {
        slugline: "EXT. PIER",
        lighting: "dusk"
      });

    expect(
      sceneBoard()?.screenplay?.scenes?.find((s) => s.id === "sc-b")
    ).toMatchObject({ slugline: "EXT. PIER", lighting: "dusk" });
  });

  it("updateScene ignores a scene the board does not carry", () => {
    seedScenes();
    useStoryboardStore
      .getState()
      .updateScene(SCENE_BOARD, "sc-gone", { slugline: "X" });
    expect(undoDepth()).toBe(0);
  });

  it("createScene lands after the named scene with one blank shot", () => {
    seedScenes();
    const id = useStoryboardStore.getState().createScene(SCENE_BOARD, "sc-a");

    const shots = sceneBoard()?.shots ?? [];
    expect(shots.map((s) => s.scene_id)).toEqual([
      "sc-a",
      "sc-a",
      id,
      "sc-b",
      "sc-b",
      "sc-c"
    ]);
    expect(shots[2]).toMatchObject({ action: "", status: "planned" });
    expect(sceneBoard()?.activeShotId).toBe(shots[2].id);
    expectOrdered();
  });

  it("mergeSceneIntoPrevious folds shots up and drops the scene", () => {
    seedScenes();
    useStoryboardStore.getState().mergeSceneIntoPrevious(SCENE_BOARD, "sc-b");

    expect(sceneBoard()?.shots.map((s) => s.scene_id)).toEqual([
      "sc-a",
      "sc-a",
      "sc-a",
      "sc-a",
      "sc-c"
    ]);
    expect(sceneBoard()?.screenplay?.scenes?.map((s) => s.id)).toEqual([
      "sc-a",
      "sc-c"
    ]);
    expectOrdered();
  });

  it("mergeSceneIntoPrevious is a no-op on the first scene", () => {
    seedScenes();
    useStoryboardStore.getState().mergeSceneIntoPrevious(SCENE_BOARD, "sc-a");
    expect(undoDepth()).toBe(0);
  });
});

describe("setStylePreset", () => {
  const entity = (
    id: string,
    kind: Entity["kind"],
    descriptor: string
  ): Entity => ({
    type: "entity",
    id,
    kind,
    name: id,
    descriptor
  });

  const ENTITIES: Entity[] = [
    entity("e-marta", "character", "a tall woman"),
    entity("e-pier", "location", "a wooden pier"),
    entity("e-noir", "style", "high-contrast noir"),
    entity("e-comic", "style", "inked comic panels")
  ];

  const seedStyled = (): void => {
    seedScenes();
    const store = useStoryboardStore.getState();
    store.setEntityIds(SCENE_BOARD, ["e-marta", "e-pier", "e-noir"]);
    // a1 excludes the board style; a2 excludes a character.
    store.updateShot(SCENE_BOARD, "a1", { entity_ids: ["e-marta", "e-pier"] });
    store.updateShot(SCENE_BOARD, "a2", { entity_ids: ["e-pier", "e-noir"] });
  };

  it("swaps the style entity and takes its descriptor", () => {
    seedStyled();
    useStoryboardStore
      .getState()
      .setStylePreset(SCENE_BOARD, "e-comic", ENTITIES);

    const board = sceneBoard();
    expect(board?.entityIds).toEqual(["e-marta", "e-pier", "e-comic"]);
    expect(board?.style).toBe("inked comic panels");
  });

  it("leaves character and location selections untouched", () => {
    seedStyled();
    useStoryboardStore
      .getState()
      .setStylePreset(SCENE_BOARD, "e-comic", ENTITIES);

    const shots = sceneBoard()?.shots ?? [];
    // The style exclusion is dropped; the character/location picks stand.
    expect(shots.find((s) => s.id === "a1")?.entity_ids).toEqual([
      "e-marta",
      "e-pier",
      "e-comic"
    ]);
    expect(shots.find((s) => s.id === "a2")?.entity_ids).toEqual([
      "e-pier",
      "e-comic"
    ]);
    // A shot with no explicit list keeps none.
    expect(shots.find((s) => s.id === "b1")?.entity_ids).toBeUndefined();
  });

  it("is one undo entry", () => {
    seedStyled();
    const store = useStoryboardStore.getState();
    const before = {
      entityIds: sceneBoard()?.entityIds,
      style: sceneBoard()?.style,
      a1: sceneBoard()?.shots.find((s) => s.id === "a1")?.entity_ids
    };
    const depth = undoDepth();

    store.setStylePreset(SCENE_BOARD, "e-comic", ENTITIES);
    expect(undoDepth()).toBe(depth + 1);

    store.undo(SCENE_BOARD);
    expect({
      entityIds: sceneBoard()?.entityIds,
      style: sceneBoard()?.style,
      a1: sceneBoard()?.shots.find((s) => s.id === "a1")?.entity_ids
    }).toEqual(before);
  });

  it("ignores an entity that is not a style", () => {
    seedStyled();
    useStoryboardStore
      .getState()
      .setStylePreset(SCENE_BOARD, "e-marta", ENTITIES);
    expect(sceneBoard()?.entityIds).toEqual(["e-marta", "e-pier", "e-noir"]);
  });
});
