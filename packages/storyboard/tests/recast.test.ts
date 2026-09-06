import { describe, expect, it } from "vitest";
import type { Entity, Shot } from "@nodetool-ai/protocol";
import type { StoryboardDocument } from "../src/document.js";
import { recastStoryboard } from "../src/recast.js";

const entity = (
  over: Partial<Entity> & { id: string; name: string }
): Entity => ({
  type: "entity",
  kind: "character",
  descriptor: `descriptor of ${over.name}`,
  ...over
});

const shot = (over: Partial<Shot> & { id: string; index: number }): Shot => ({
  type: "shot",
  status: "planned",
  action: "",
  ...over
});

const doc = (
  shots: Shot[],
  over: Partial<StoryboardDocument> = {}
): StoryboardDocument => ({
  screenplay: null,
  shots,
  brief: "",
  style: "",
  entityIds: shots.length ? [] : [],
  aspectRatio: "16:9",
  setupStage: "done",
  genre: "",
  directorModel: null,
  imageModel: null,
  videoModel: null,
  ...over
});

/** A rendered still, so an invalidation has something to take away. */
const still = (assetId: string) => ({
  type: "image" as const,
  asset_id: assetId,
  uri: `asset://${assetId}`
});

const rendered = (s: Shot, assetId: string): Shot => ({
  ...s,
  keyframe: still(assetId),
  keyframe_versions: [still(assetId)],
  status: "keyframe_ready"
});

describe("recastStoryboard targeting", () => {
  const nova = entity({ id: "a1", name: "Nova" });
  const kai = entity({ id: "a2", name: "Kai" });
  const vera = entity({ id: "x1", name: "Vera" });

  it("substitutes the board entity an explicit `replaces` names", () => {
    const template = doc(
      [shot({ id: "s1", index: 0, action: "Nova greets Kai" })],
      { entityIds: ["a1", "a2"] }
    );
    const result = recastStoryboard({
      document: template,
      boardEntities: [nova, kai],
      cast: [{ entity: vera, replaces: "a1" }]
    });
    expect(result.substitutions).toEqual([{ from: nova, to: vera }]);
    expect(result.document.shots[0].action).toBe("Vera greets Kai");
    expect(result.document.entityIds).toEqual(["x1", "a2"]);
  });

  it("accepts a board entity name as the `replaces` target", () => {
    const template = doc([shot({ id: "s1", index: 0, action: "Nova waits" })], {
      entityIds: ["a1"]
    });
    const result = recastStoryboard({
      document: template,
      boardEntities: [nova],
      cast: [{ entity: vera, replaces: "nova" }]
    });
    expect(result.document.shots[0].action).toBe("Vera waits");
  });

  it("replaces the single board entity of the same kind with no `replaces`", () => {
    const bottle = entity({ id: "p1", kind: "prop", name: "Bottle" });
    const can = entity({ id: "p2", kind: "prop", name: "Can" });
    const template = doc(
      [shot({ id: "s1", index: 0, action: "Bottle on a table" })],
      { entityIds: ["a1", "p1"] }
    );
    const result = recastStoryboard({
      document: template,
      boardEntities: [nova, bottle],
      cast: [{ entity: can }]
    });
    expect(result.substitutions).toEqual([{ from: bottle, to: can }]);
    expect(result.document.shots[0].action).toBe("Can on a table");
  });

  it("appends and renames nothing when the kind is ambiguous", () => {
    const template = doc(
      [shot({ id: "s1", index: 0, action: "Nova greets Kai" })],
      { entityIds: ["a1", "a2"] }
    );
    const result = recastStoryboard({
      document: template,
      boardEntities: [nova, kai],
      cast: [{ entity: vera }]
    });
    expect(result.substitutions).toEqual([]);
    expect(result.appended).toEqual([vera]);
    expect(result.document.shots[0].action).toBe("Nova greets Kai");
    expect(result.document.entityIds).toEqual(["a1", "a2", "x1"]);
  });

  it("appends when no board entity has the kind", () => {
    const prop = entity({ id: "p9", kind: "prop", name: "Lantern" });
    const template = doc([shot({ id: "s1", index: 0, action: "Nova waits" })], {
      entityIds: ["a1"]
    });
    const result = recastStoryboard({
      document: template,
      boardEntities: [nova],
      cast: [{ entity: prop }]
    });
    expect(result.substitutions).toEqual([]);
    expect(result.appended).toEqual([prop]);
  });
});

describe("recastStoryboard renaming", () => {
  it("rewrites whole words only — `Nova` must not touch `Novak`", () => {
    const nova = entity({ id: "a1", name: "Nova" });
    const vera = entity({ id: "x1", name: "Vera" });
    const action =
      "Nova and Novak cross the novaculite quarry; NOVA's coat, Nova-red.";
    const template = doc([shot({ id: "s1", index: 0, action })], {
      entityIds: ["a1"]
    });
    const result = recastStoryboard({
      document: template,
      boardEntities: [nova],
      cast: [{ entity: vera, replaces: "a1" }]
    });
    expect(result.document.shots[0].action).toBe(
      "Vera and Novak cross the novaculite quarry; Vera's coat, Vera-red."
    );
    // The naive version this guards against, so the case cannot pass by accident.
    expect(action.replaceAll("Nova", "Vera")).toContain("Verak");
    expect(result.document.shots[0].action).not.toContain("Verak");
    expect(result.document.shots[0].action).not.toContain("veraculite");
  });

  it("rewrites every prompt-bearing field and the slug", () => {
    const nova = entity({ id: "a1", name: "Nova" });
    const vera = entity({ id: "x1", name: "Vera" });
    const template = doc(
      [
        shot({
          id: "s1",
          index: 0,
          slug: "Nova at the door",
          action: "Nova opens it",
          motion: "Nova steps through",
          dialogue: "Nova: come in",
          narration: "Nova had waited all winter"
        })
      ],
      { entityIds: ["a1"] }
    );
    const copy = recastStoryboard({
      document: template,
      boardEntities: [nova],
      cast: [{ entity: vera, replaces: "a1" }]
    }).document.shots[0];
    expect(copy.slug).toBe("Vera at the door");
    expect(copy.action).toBe("Vera opens it");
    expect(copy.motion).toBe("Vera steps through");
    expect(copy.dialogue).toBe("Vera: come in");
    expect(copy.narration).toBe("Vera had waited all winter");
  });

  it("rewrites explicit entity_ids and the screenplay's", () => {
    const nova = entity({ id: "a1", name: "Nova" });
    const kai = entity({ id: "a2", name: "Kai" });
    const vera = entity({ id: "x1", name: "Vera" });
    const shots = [
      shot({
        id: "s1",
        index: 0,
        action: "A quiet street",
        entity_ids: ["a1", "a2"]
      })
    ];
    const template = doc(shots, {
      entityIds: ["a1", "a2"],
      screenplay: {
        type: "screenplay",
        id: "sp1",
        title: "Nova",
        shots,
        entity_ids: ["a1", "a2"]
      }
    });
    const result = recastStoryboard({
      document: template,
      boardEntities: [nova, kai],
      cast: [{ entity: vera, replaces: "a1" }]
    });
    expect(result.document.shots[0].entity_ids).toEqual(["x1", "a2"]);
    expect(result.document.screenplay?.entity_ids).toEqual(["x1", "a2"]);
    expect(result.document.screenplay?.title).toBe("Vera");
    expect(result.document.screenplay?.shots).toBe(result.document.shots);
  });
});

describe("recastStoryboard invalidation", () => {
  const widget = entity({
    id: "p1",
    kind: "prop",
    name: "Widget",
    descriptor: "a red widget"
  });
  const gizmo = entity({
    id: "p2",
    kind: "prop",
    name: "Gizmo",
    descriptor: "a blue gizmo"
  });

  const template = () =>
    doc(
      [
        rendered(
          shot({ id: "s1", index: 0, action: "Widget on a table" }),
          "k1"
        ),
        rendered(shot({ id: "s2", index: 1, action: "A rainy street" }), "k2")
      ],
      { entityIds: ["p1"] }
    );

  it("clears the takes of the shots whose prompt moved, and only those", () => {
    const result = recastStoryboard({
      document: template(),
      boardEntities: [widget],
      cast: [{ entity: gizmo, replaces: "p1" }]
    });
    expect(result.invalidatedShotIds).toEqual(["s1"]);
    expect(result.keptShotIds).toEqual(["s2"]);
    expect(result.document.shots[0].keyframe).toBeUndefined();
    expect(result.document.shots[0].status).toBe("planned");
    // The product-free frame is untouched: same words, same seasoning.
    expect(result.document.shots[1].keyframe?.asset_id).toBe("k2");
    expect(result.document.shots[1].status).toBe("keyframe_ready");
  });

  it("invalidates on a descriptor change alone", () => {
    const restyled = entity({ ...widget, id: "p3", name: "Widget" });
    restyled.descriptor = "a green widget";
    const result = recastStoryboard({
      document: template(),
      boardEntities: [widget],
      cast: [{ entity: restyled, replaces: "p1" }]
    });
    expect(result.document.shots[0].action).toBe("Widget on a table");
    expect(result.invalidatedShotIds).toEqual(["s1"]);
  });

  it("keeps a still whose prompt did not move and clears the clip that did", () => {
    // The shot names its cast explicitly, so the swapped prop seasons neither
    // prompt; the only thing that moves is the word in `motion`, which is a
    // clip input and not a still one.
    const ana = entity({ id: "a1", name: "Ana" });
    const withClip = doc(
      [
        {
          ...shot({
            id: "s1",
            index: 0,
            action: "A rainy street",
            motion: "Widget rolls past",
            entity_ids: ["a1"]
          }),
          keyframe: still("k1"),
          keyframe_versions: [still("k1")],
          clip: { type: "video" as const, asset_id: "c1", uri: "asset://c1" },
          status: "rendered" as const
        }
      ],
      { entityIds: ["a1", "p1"] }
    );
    const result = recastStoryboard({
      document: withClip,
      boardEntities: [ana, widget],
      cast: [{ entity: gizmo, replaces: "p1" }]
    });
    expect(result.document.shots[0].motion).toBe("Gizmo rolls past");
    expect(result.document.shots[0].keyframe?.asset_id).toBe("k1");
    expect(result.document.shots[0].clip).toBeUndefined();
    expect(result.document.shots[0].status).toBe("keyframe_ready");
    expect(result.invalidatedShotIds).toEqual(["s1"]);
  });
});

describe("recastStoryboard lineage", () => {
  const a = entity({ id: "a", name: "Ada" });
  const b = entity({ id: "b", name: "Bo" });
  const x = entity({ id: "x", name: "Xu" });
  const y = entity({ id: "y", name: "Yun" });
  const board = () =>
    doc(
      [
        shot({ id: "s1", index: 0, action: "Ada waits" }),
        shot({ id: "s2", index: 1, action: "Bo waits" })
      ],
      { entityIds: ["a", "b"] }
    );

  it("stamps templateId and the mapping key, and keeps the shot ids", () => {
    const result = recastStoryboard({
      document: board(),
      sourceId: "board-1",
      boardEntities: [a, b],
      cast: [
        { entity: x, replaces: "a" },
        { entity: y, replaces: "b" }
      ]
    });
    expect(result.document.templateId).toBe("board-1");
    expect(result.recastKey).toBe("a>x,b>y");
    expect(result.document.recastKey).toBe("a>x,b>y");
    expect(result.document.shots.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("does not carry the source board's timeline", () => {
    const withTimeline = {
      ...board(),
      timeline_id: "tl-1"
    } as StoryboardDocument;
    const result = recastStoryboard({
      document: withTimeline,
      sourceId: "board-1",
      boardEntities: [a, b],
      cast: [{ entity: x, replaces: "a" }]
    });
    expect(result.document).not.toHaveProperty("timeline_id");
  });

  it("keys on the mapping, not the input order", () => {
    const forward = recastStoryboard({
      document: board(),
      boardEntities: [a, b],
      cast: [
        { entity: x, replaces: "a" },
        { entity: y, replaces: "b" }
      ]
    });
    const reversed = recastStoryboard({
      document: board(),
      boardEntities: [a, b],
      cast: [
        { entity: y, replaces: "b" },
        { entity: x, replaces: "a" }
      ]
    });
    expect(reversed.recastKey).toBe(forward.recastKey);
    expect(reversed.document.shots).toEqual(forward.document.shots);
  });

  it("keys the swapped assignment differently", () => {
    const straight = recastStoryboard({
      document: board(),
      boardEntities: [a, b],
      cast: [
        { entity: x, replaces: "a" },
        { entity: y, replaces: "b" }
      ]
    });
    const swapped = recastStoryboard({
      document: board(),
      boardEntities: [a, b],
      cast: [
        { entity: y, replaces: "a" },
        { entity: x, replaces: "b" }
      ]
    });
    expect(straight.recastKey).toBe("a>x,b>y");
    expect(swapped.recastKey).toBe("a>y,b>x");
    expect(swapped.recastKey).not.toBe(straight.recastKey);
  });

  it("tokens an append with `+`", () => {
    const prop = entity({ id: "p1", kind: "prop", name: "Lantern" });
    const result = recastStoryboard({
      document: board(),
      boardEntities: [a, b],
      cast: [{ entity: x, replaces: "a" }, { entity: prop }]
    });
    expect(result.recastKey).toBe("+p1,a>x");
  });
});

describe("recastStoryboard reuse", () => {
  const nova = entity({ id: "a1", name: "Nova" });
  const vera = entity({ id: "x1", name: "Vera" });

  const template = (shots?: Shot[]) =>
    doc(
      shots ?? [
        shot({ id: "s1", index: 0, action: "Nova enters the hall" }),
        shot({ id: "s2", index: 1, action: "Rain on the window" }),
        shot({ id: "s3", index: 2, action: "Nova sits" })
      ],
      { entityIds: ["a1"] }
    );

  /** The copy a first run made, with every shot rendered. */
  const firstRun = (): StoryboardDocument => {
    const copy = recastStoryboard({
      document: template(),
      sourceId: "board-1",
      boardEntities: [nova],
      cast: [{ entity: vera, replaces: "a1" }]
    }).document;
    return {
      ...copy,
      shots: copy.shots.map((s, i) => rendered(s, `k${i + 1}`))
    };
  };

  it("re-derives every time and keeps the takes it may", () => {
    const existing = firstRun();
    const result = recastStoryboard({
      document: template(),
      sourceId: "board-1",
      boardEntities: [nova],
      cast: [{ entity: vera, replaces: "a1" }],
      existing
    });
    expect(result.invalidatedShotIds).toEqual([]);
    expect(result.keptShotIds).toEqual(["s1", "s2", "s3"]);
    expect(result.document.shots.map((s) => s.keyframe?.asset_id)).toEqual([
      "k1",
      "k2",
      "k3"
    ]);
  });

  it("invalidates exactly the shot whose template action was edited", () => {
    const existing = firstRun();
    const edited = template([
      shot({ id: "s1", index: 0, action: "Nova enters the hall" }),
      shot({ id: "s2", index: 1, action: "Rain on the window" }),
      shot({ id: "s3", index: 2, action: "Nova stands at the window" })
    ]);
    const result = recastStoryboard({
      document: edited,
      sourceId: "board-1",
      boardEntities: [nova],
      cast: [{ entity: vera, replaces: "a1" }],
      existing
    });
    expect(result.invalidatedShotIds).toEqual(["s3"]);
    expect(result.document.shots[2].action).toBe("Vera stands at the window");
    expect(result.document.shots[2].keyframe).toBeUndefined();
    expect(result.document.shots[0].keyframe?.asset_id).toBe("k1");
    expect(result.document.shots[1].keyframe?.asset_id).toBe("k2");
  });

  it("rewrites a renamed destination entity and invalidates only the shots naming it", () => {
    const existing = firstRun();
    const renamed = entity({ id: "x1", name: "Vera Lin" });
    const result = recastStoryboard({
      document: template(),
      sourceId: "board-1",
      boardEntities: [nova],
      cast: [{ entity: renamed, replaces: "a1" }],
      existing
    });
    expect(result.recastKey).toBe("a1>x1");
    expect(result.document.shots[0].action).toBe("Vera Lin enters the hall");
    expect(result.invalidatedShotIds).toEqual(["s1", "s3"]);
    expect(result.keptShotIds).toEqual(["s2"]);
    expect(result.document.shots[1].keyframe?.asset_id).toBe("k2");
  });

  it("adds a shot the template gained and reports one it lost", () => {
    const existing = firstRun();
    const moved = template([
      shot({ id: "s1", index: 0, action: "Nova enters the hall" }),
      shot({ id: "s3", index: 1, action: "Nova sits" }),
      shot({ id: "s4", index: 2, action: "The hall empties" })
    ]);
    const result = recastStoryboard({
      document: moved,
      sourceId: "board-1",
      boardEntities: [nova],
      cast: [{ entity: vera, replaces: "a1" }],
      existing
    });
    expect(result.document.shots.map((s) => s.id)).toEqual(["s1", "s3", "s4"]);
    expect(result.droppedShotIds).toEqual(["s2"]);
    expect(result.document.shots[2].keyframe).toBeUndefined();
    expect(result.document.shots[0].keyframe?.asset_id).toBe("k1");
  });
});
