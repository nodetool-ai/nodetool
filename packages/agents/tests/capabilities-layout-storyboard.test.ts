import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { isRecord } from "@nodetool-ai/protocol";
import {
  Asset,
  Storyboard,
  TimelineSequence,
  initTestDb
} from "@nodetool-ai/models";
import {
  BaseProvider,
  ProcessingContext,
  type Message,
  type ProviderStreamItem,
  type ToolCall
} from "@nodetool-ai/runtime";
import type { TimelineClip } from "@nodetool-ai/timeline";
import {
  finishStoryboard,
  layoutStoryboard
} from "../src/capabilities/finish-storyboard.js";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

type Request = Parameters<BaseProvider["generateMessages"]>[0];
type Turn = (args: Request) => readonly ToolCall[] | Promise<readonly ToolCall[]>;

const call = (name: string, args: Record<string, unknown> = {}): ToolCall => ({
  id: `${name}-${Math.random()}`,
  name,
  args
});

/** Answers each provider turn from a script, and records every request. */
class ScriptedProvider extends BaseProvider {
  readonly requests: Request[] = [];
  constructor(private readonly turns: Turn[]) {
    super("fake");
  }
  override async generateMessage(): Promise<Message> {
    throw new Error("Unused single-turn path.");
  }
  override async *generateMessages(args: Request): AsyncGenerator<ProviderStreamItem> {
    this.requests.push(args);
    const turn = this.turns.shift();
    if (!turn) {
      throw new Error("Unexpected provider turn.");
    }
    for (const request of await turn(args)) {
      yield request;
    }
  }
}

/** The JSON the authoring or review turn received as its first text part. */
function context(args: Request): Record<string, unknown> {
  const user = args.messages.find((message) => message.role === "user");
  const text = Array.isArray(user?.content) && user.content[0].type === "text" ? user.content[0].text : user?.content;
  if (typeof text !== "string") {
    throw new Error("Missing turn context.");
  }
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) {
    throw new Error("Turn context is not an object.");
  }
  return parsed;
}

const clipsOf = (args: Request): TimelineClip[] => {
  const scaffold = context(args)["scaffold"];
  return isRecord(scaffold) && Array.isArray(scaffold["clips"]) ? (scaffold["clips"] as TimelineClip[]) : [];
};

const done: Turn = () => [];
const approve: Turn = (args) => {
  const times = context(args)["frameTimesMs"];
  if (!Array.isArray(times)) {
    throw new Error("Missing frame times.");
  }
  return [
    call("review_finished_cut", {
      passed: true,
      findings: [],
      summary: "Every hold frame reads as one composition.",
      frameReviews: times.map((timeMs) => ({ timeMs, passed: true, findings: [] }))
    })
  ];
};

interface FixtureOptions {
  /** Extra fields merged into the hook shot's elements, by element id. */
  readonly authored?: Record<string, Record<string, unknown>>;
  /** Extra elements added to the hook shot. */
  readonly extra?: readonly Record<string, unknown>[];
  /** Rules written into the hook shot's graphics. */
  readonly reviewRules?: readonly string[];
}

async function fixture(options: FixtureOptions = {}) {
  const product = await Asset.create<Asset>({ user_id: "u1", name: "Product", content_type: "image/png" });
  const canvas = createCanvas(40, 40);
  canvas.getContext("2d").fillStyle = "#FF0000";
  canvas.getContext("2d").fillRect(0, 0, 40, 40);
  const bytes = new Uint8Array(canvas.toBuffer("image/png"));
  const shots = ["hook", "cta"].map((id, index) => ({
    type: "shot",
    id,
    index,
    action: "Exact sale",
    status: "planned",
    duration_seconds: 2,
    production: {
      media_strategy: "still_motion_graphics",
      protected_inputs: [
        { id: "product", kind: "product", asset_id: product.id, allowed_transformations: ["position", "scale", "opacity"] },
        { id: "price", kind: "exact_text", value: "€29", allowed_transformations: ["position", "scale", "opacity"] }
      ]
    },
    graphics: {
      mode: "graphics_first",
      elements: [
        { id: "background", kind: "shape", role: "background" },
        { id: "product", kind: "asset", role: "product", protected_input_id: "product" },
        { id: "price", kind: "text", role: "price", protected_input_id: "price" },
        ...(id === "hook" ? (options.extra ?? []) : [])
      ].map((element) => (id === "hook" ? { ...element, ...options.authored?.[element.id] } : element)),
      ...(id === "hook" && options.reviewRules && { review_rules: options.reviewRules })
    }
  }));
  const board = await Storyboard.create<Storyboard>({
    user_id: "u1",
    project_id: "default",
    name: "Layout",
    document: JSON.stringify({ shots, entityIds: [], aspectRatio: "9:16", screenplay: { motion_design: { direction: "One calm rhythm" } } })
  });
  const ctx = new ProcessingContext({ jobId: "layout-fixture", userId: "u1" });
  vi.spyOn(ctx, "resolveAssetBytes").mockResolvedValue({ bytes, contentType: "image/png" });
  return { board, context: ctx };
}

function runFor(provider: ScriptedProvider, ctx: ProcessingContext) {
  return createCapabilityRun({
    context: ctx,
    gate: UNGATED,
    subAgent: { provider, model: "scripted-vision", parentTools: () => [], forwardMessage: () => undefined }
  });
}

/** Moves the hook's price to the top of the frame and enlarges it. */
const layOut: Turn = (args) => [
  call("edit_timeline", {
    ops: clipsOf(args)
      .filter((clip) => clip.storyboardElementId === "price")
      .map((clip) => ({ op: "set_clip_params", target: clip.id, fontSizePx: 150, transform: { position: { x: 0, y: -700 } } }))
  }),
  call("submit_finished_cut")
];

describe("layout_storyboard", () => {
  beforeEach(() => initTestDb());

  it("composes still frames without motion tools and reviews only the hold frames", async () => {
    const { board, context: ctx } = await fixture();
    const provider = new ScriptedProvider([
      (args) => [
        call("edit_timeline", { ops: [{ op: "animate_clip", target: clipsOf(args)[0].id, animations: [{ role: "in", preset: "fade" }] }] }),
        ...layOut(args)
      ],
      done,
      approve,
      done
    ]);
    const result = (await layoutStoryboard.impl(runFor(provider, ctx), {
      storyboardId: board.id,
      expectedStoryboardRevision: board.revision
    })) as Record<string, unknown>;

    expect(result["error"]).toBeUndefined();
    expect(result["status"]).toBe("laid_out");
    expect(provider.requests[0].tools?.map((tool) => tool.name)).toEqual(["get_timeline", "edit_timeline", "submit_finished_cut"]);
    expect(JSON.stringify(provider.requests[1].messages)).toContain("This finishing operation is unavailable");
    expect(context(provider.requests[2])["frameTimesMs"]).toHaveLength(2);

    const saved = await TimelineSequence.findById(String(result["timelineId"]));
    const doc = saved!.toDocument();
    expect(doc.storyboardMaterializations?.[0].stage).toBe("layout");
    const price = doc.clips.find((clip) => clip.storyboardShotId === "hook" && clip.storyboardElementId === "price");
    expect(price?.transform?.position.y).toBe(-700);
    expect(result["storyboardRevision"]).toBe(board.revision + 1);
  });

  it("reviews accepted edits when the model ends its turn without submitting", async () => {
    // A live model fixed review findings and stopped without calling submit.
    const { board, context: ctx } = await fixture();
    const editOnly: Turn = (args) => layOut(args).filter((request) => request.name === "edit_timeline");
    const provider = new ScriptedProvider([editOnly, done, approve, done]);
    const result = (await layoutStoryboard.impl(runFor(provider, ctx), {
      storyboardId: board.id,
      expectedStoryboardRevision: board.revision
    })) as Record<string, unknown>;
    expect(result["error"]).toBeUndefined();
    expect(provider.requests[2].tools?.map((tool) => tool.name)).toEqual(["review_finished_cut"]);
  });

  it("reminds a model that ends its turn with no edit once, then authors", async () => {
    const { board, context: ctx } = await fixture();
    const provider = new ScriptedProvider([done, layOut, done, approve, done]);
    const result = (await layoutStoryboard.impl(runFor(provider, ctx), {
      storyboardId: board.id,
      expectedStoryboardRevision: board.revision
    })) as Record<string, unknown>;
    expect(result["error"]).toBeUndefined();
    expect(JSON.stringify(provider.requests[1].messages)).toContain("Your turn ended without an edit or a submission");
  });

  it("refuses a model that ends its turn with no edit twice", async () => {
    const { board, context: ctx } = await fixture();
    const result = (await layoutStoryboard.impl(runFor(new ScriptedProvider([done, done]), ctx), {
      storyboardId: board.id,
      expectedStoryboardRevision: board.revision
    })) as Record<string, unknown>;
    expect(result["error"]).toMatch(/did not submit a candidate/);
  });

  it("adds a generated background to the board and above the shot's color background", async () => {
    const { board, context: ctx } = await fixture();
    const background = await Asset.create<Asset>({ user_id: "u1", name: "Generated", content_type: "image/png" });
    const provider = new ScriptedProvider([
      () => [call("generate_decoration", { shotId: "hook", name: "Warm gradient", prompt: "A soft warm gradient, no text", layer: "background" })],
      layOut,
      done,
      approve,
      done
    ]);
    const run = runFor(provider, ctx);
    const invoke = vi.spyOn(run, "invoke").mockResolvedValue({ type: "image", asset_id: background.id });
    const result = (await layoutStoryboard.impl(run, {
      storyboardId: board.id,
      expectedStoryboardRevision: board.revision,
      imageModel: { provider: "fake-images", id: "painter" }
    })) as Record<string, unknown>;

    expect(result["error"]).toBeUndefined();
    expect(result["decorations"]).toBe(1);
    expect(provider.requests[0].tools?.map((tool) => tool.name)).toContain("generate_decoration");
    expect(invoke).toHaveBeenCalledWith("generate_image", expect.objectContaining({ model: { provider: "fake-images", id: "painter" }, prompt: "A soft warm gradient, no text" }));

    const stored = (await Storyboard.findById(board.id))!.toDocument();
    const hook = stored.shots.find((shot) => shot.id === "hook");
    expect(hook?.graphics?.elements).toContainEqual(expect.objectContaining({ id: "decor-warm-gradient", kind: "asset", role: "decorative", asset_id: background.id, origin: "layout_agent" }));

    const doc = (await TimelineSequence.findById(String(result["timelineId"])))!.toDocument();
    const decor = doc.clips.find((clip) => clip.storyboardElementId === "decor-warm-gradient")!;
    const backdrop = doc.clips.find((clip) => clip.storyboardShotId === "hook" && clip.storyboardElementId === "background")!;
    const indexOf = (clip: TimelineClip) => doc.tracks.find((track) => track.id === clip.trackId)!.index;
    expect(indexOf(decor)).toBe(indexOf(backdrop) + 1);
    // A square image covers a 9:16 frame at 16/9 of its contained size.
    expect(decor.transform?.scale.x).toBeCloseTo(16 / 9, 2);
  });

  it("makes the next finish author motion and keep the planned layout", async () => {
    const { board, context: ctx } = await fixture();
    const layout = (await layoutStoryboard.impl(runFor(new ScriptedProvider([layOut, done, approve, done]), ctx), {
      storyboardId: board.id,
      expectedStoryboardRevision: board.revision
    })) as Record<string, unknown>;
    expect(layout["error"]).toBeUndefined();

    const animate: Turn = (args) => [
      call("edit_timeline", {
        ops: clipsOf(args)
          .filter((clip) => clip.storyboardElementId === "price")
          .map((clip) => ({ op: "animate_clip", target: clip.id, animations: [{ role: "in", preset: "fade", durationMs: 600 }] }))
      }),
      call("submit_finished_cut")
    ];
    const provider = new ScriptedProvider([() => [call("submit_finished_cut")], animate, done, approve, done]);
    const finished = (await finishStoryboard.impl(runFor(provider, ctx), {
      storyboardId: board.id,
      expectedStoryboardRevision: layout["storyboardRevision"],
      timelineId: layout["timelineId"],
      expectedTimelineRevision: layout["timelineRevision"],
      strategy: "agentic"
    })) as Record<string, unknown>;

    expect(finished["error"]).toBeUndefined();
    expect(JSON.stringify(provider.requests[1].messages)).toContain("still holds only the planned static layout");
    const doc = (await TimelineSequence.findById(String(finished["timelineId"])))!.toDocument();
    expect(doc.storyboardMaterializations?.[0].stage).toBe("finished");
    const price = doc.clips.find((clip) => clip.storyboardShotId === "hook" && clip.storyboardElementId === "price");
    expect(price?.transform?.position.y).toBe(-700);
    expect(price?.textStyle?.fontSizePx).toBe(150);
  });

  describe("authored placements", () => {
    const element = (args: Request, id: string, shot = "hook"): TimelineClip => {
      const found = clipsOf(args).find((clip) => clip.storyboardShotId === shot && clip.storyboardElementId === id);
      if (!found) {
        throw new Error(`No clip for ${shot}/${id}.`);
      }
      return found;
    };
    const frameWidth = (args: Request): number => Number((context(args)["target"] as Record<string, unknown>)["width"]);
    const shift = (args: Request, id: string, dx: number): ToolCall =>
      call("edit_timeline", {
        ops: [
          {
            op: "set_clip_params",
            target: element(args, id).id,
            transform: { position: { x: (element(args, id).transform?.position.x ?? 0) + dx, y: element(args, id).transform?.position.y ?? 0 } }
          }
        ]
      });
    const run = async (provider: ScriptedProvider, options: FixtureOptions) => {
      const { board, context: ctx } = await fixture(options);
      const result = (await layoutStoryboard.impl(runFor(provider, ctx), {
        storyboardId: board.id,
        expectedStoryboardRevision: board.revision
      })) as Record<string, unknown>;
      return { result, board, ctx };
    };
    const edits = (provider: ScriptedProvider, from: number): string => JSON.stringify(provider.requests[from].messages);

    it("rejects an edit that moves a locked element and names it, the property and the authored value", async () => {
      const provider = new ScriptedProvider([
        (args) => [shift(args, "product", 40)],
        layOut,
        done,
        approve,
        done
      ]);
      const { result } = await run(provider, { authored: { product: { lock: ["position"] } } });
      expect(result["error"]).toBeUndefined();
      const text = edits(provider, 1);
      expect(text).toContain("Authored placement violated on hook/product");
      expect(text).toContain("position.x is locked at the authored value");
      expect(text).toContain("rolledBack");
    });

    it("rejects a changed scale on a locked element", async () => {
      const provider = new ScriptedProvider([
        (args) => [
          call("edit_timeline", {
            ops: [{ op: "set_clip_params", target: element(args, "product").id, transform: { scale: { x: 2, y: 2 } } }]
          })
        ],
        layOut,
        done,
        approve,
        done
      ]);
      const { result } = await run(provider, { authored: { product: { lock: ["scale"] } } });
      expect(result["error"]).toBeUndefined();
      expect(edits(provider, 1)).toContain("scale.x is locked at the authored value");
    });

    it("accepts a move within limits and rejects one beyond them, measured against the scaffold", async () => {
      const provider = new ScriptedProvider([
        (args) => [shift(args, "product", frameWidth(args) * 0.06)],
        // The scaffold in the context is unchanged, so this is 0.12 from it. The step from the previous candidate is 0.06.
        (args) => [shift(args, "product", frameWidth(args) * 0.12)],
        layOut,
        done,
        approve,
        done
      ]);
      const { result } = await run(provider, { authored: { product: { limits: { x: 0.1 } } } });
      expect(result["error"]).toBeUndefined();
      // The first move is applied: the product sits 0.06 of the frame width from the scaffold.
      expect(edits(provider, 1)).toContain('"position":{"x":64.8');
      expect(edits(provider, 2)).toContain("Authored placement violated on hook/product: position.x moved");
      expect(edits(provider, 2)).toContain("The limit is 0.1");
    });

    it("rejects a scale change beyond its limit", async () => {
      const provider = new ScriptedProvider([
        (args) => [
          call("edit_timeline", {
            ops: [{ op: "set_clip_params", target: element(args, "product").id, transform: { scale: { x: (element(args, "product").transform?.scale.x ?? 1) * 1.3, y: (element(args, "product").transform?.scale.y ?? 1) * 1.3 } } }]
          })
        ],
        layOut,
        done,
        approve,
        done
      ]);
      await run(provider, { authored: { product: { limits: { scale: 0.1 } } } });
      expect(edits(provider, 1)).toContain("scale.x changed from the authored");
    });

    it("rejects a group move that shifts a locked child", async () => {
      const provider = new ScriptedProvider([
        (args) => {
          const badge = element(args, "badge");
          return [
            call("edit_timeline", {
              ops: [{ op: "add_group", name: "mover", startMs: badge.startMs, durationMs: badge.durationMs, transform: { position: { x: 90, y: 0 } }, children: [badge.id] }]
            })
          ];
        },
        layOut,
        done,
        approve,
        done
      ]);
      const { result } = await run(provider, {
        extra: [{ id: "badge", kind: "shape", role: "decorative" }],
        authored: { badge: { lock: ["position"] } }
      });
      expect(result["error"]).toBeUndefined();
      expect(edits(provider, 1)).toContain("Authored placement violated on hook/badge: position.x is locked");
    });

    it("lets a locked layer take a fade in the finish phase and rejects a slide", async () => {
      const { board, context: ctx } = await fixture({ authored: { product: { lock: ["position"] } } });
      const layout = (await layoutStoryboard.impl(runFor(new ScriptedProvider([layOut, done, approve, done]), ctx), {
        storyboardId: board.id,
        expectedStoryboardRevision: board.revision
      })) as Record<string, unknown>;
      expect(layout["error"]).toBeUndefined();
      const animate = (preset: string): Turn => (args) => [
        call("edit_timeline", {
          ops: [{ op: "animate_clip", target: element(args, "product").id, animations: [{ role: "in", preset, durationMs: 600 }] }]
        })
      ];
      const provider = new ScriptedProvider([
        animate("slide"),
        (args) => [animate("fade")(args)[0], call("submit_finished_cut")],
        done,
        approve,
        done
      ]);
      const finished = (await finishStoryboard.impl(runFor(provider, ctx), {
        storyboardId: board.id,
        expectedStoryboardRevision: layout["storyboardRevision"],
        timelineId: layout["timelineId"],
        expectedTimelineRevision: layout["timelineRevision"],
        strategy: "agentic"
      })) as Record<string, unknown>;
      expect(finished["error"]).toBeUndefined();
      const text = edits(provider, 0);
      expect(text).toContain("Authored placement violated on hook/product: animation slide would drive");
      expect(text).toContain("A locked layer takes only opacity animations");
      const doc = (await TimelineSequence.findById(String(finished["timelineId"])))!.toDocument();
      const product = doc.clips.find((clip) => clip.storyboardShotId === "hook" && clip.storyboardElementId === "product");
      expect(product?.animations?.map((animation) => animation.preset)).toEqual(["fade"]);
    });

    it("gives the agent each element's authored placement and the reviewer the rules and lock summary", async () => {
      const authored = { frame: { box: [0.1, 0.2, 0.8, 0.4] }, lock: ["position", "scale"], limits: { y: 0.05 } };
      const provider = new ScriptedProvider([layOut, done, approve, done]);
      const { result } = await run(provider, { authored: { product: authored }, reviewRules: ["The price never overlaps the product."] });
      expect(result["error"]).toBeUndefined();
      expect(context(provider.requests[0])["authoredPlacements"]).toEqual([
        { shotId: "hook", elementId: "product", frame: authored.frame, lock: authored.lock, limits: authored.limits }
      ]);
      expect(JSON.stringify(provider.requests[0].messages)).toContain("never change a property listed in its lock");
      const review = context(provider.requests[2]);
      expect(review["reviewRules"]).toEqual([{ shotId: "hook", rules: ["The price never overlaps the product."] }]);
      expect(review["lockedPlacements"]).toBe(
        "These placements are authored and locked: hook/product box [0.1, 0.2, 0.8, 0.4] locked: position, scale. Do not report their position or size as a defect."
      );
    });
  });

  describe("review outcomes", () => {
    /** Authors one distinct price position per round, so each round is a revision. */
    const reviseTo = (y: number): Turn => (args) => [
      call("edit_timeline", {
        ops: clipsOf(args)
          .filter((clip) => clip.storyboardElementId === "price")
          .map((clip) => ({ op: "set_clip_params", target: clip.id, fontSizePx: 150, transform: { position: { x: 0, y } } }))
      }),
      call("submit_finished_cut")
    ];
    /** Fails the frames at the given indexes for one defect. */
    const failFor = (defect: string, ...failing: number[]): Turn => (args) => {
      const times = context(args)["frameTimesMs"] as number[];
      return [
        call("review_finished_cut", {
          passed: false,
          findings: failing.map((index) => `Frame ${index} ${defect}`),
          summary: "Not yet.",
          frameReviews: times.map((timeMs, index) => ({
            timeMs,
            passed: !failing.includes(index),
            findings: failing.includes(index) ? [`Frame ${index} ${defect}`] : []
          }))
        })
      ];
    };
    const failFrames = (...failing: number[]): Turn => failFor("is crowded.", ...failing);
    const layoutRun = async (provider: ScriptedProvider) => {
      const { board, context: ctx } = await fixture();
      const result = (await layoutStoryboard.impl(runFor(provider, ctx), {
        storyboardId: board.id,
        expectedStoryboardRevision: board.revision
      })) as Record<string, unknown>;
      return { result, board, ctx };
    };

    it("saves the best hard-valid candidate as needs_review after three failing rounds", async () => {
      const provider = new ScriptedProvider([
        reviseTo(-700), done, failFrames(0), done,
        reviseTo(-650), done, failFrames(1), done,
        reviseTo(-690), done, failFrames(0, 1), done
      ]);
      const { result, board } = await layoutRun(provider);
      expect(result["error"]).toBeUndefined();
      expect(result["status"]).toBe("needs_review");
      expect(result["findings"]).toEqual(["Frame 1 is crowded."]);
      const doc = (await TimelineSequence.findById(String(result["timelineId"])))!.toDocument();
      expect(doc.storyboardMaterializations?.[0].stage).toBe("layout");
      // The first two candidates tie on one defect and one frame, so the later one wins.
      const price = doc.clips.find((clip) => clip.storyboardShotId === "hook" && clip.storyboardElementId === "price");
      expect(price?.transform?.position.y).toBe(-650);
      expect(result["storyboardRevision"]).toBe(board.revision + 1);
      expect(result["reviews"]).toHaveLength(3);
    });

    it("prefers fewer distinct defects over fewer failing frames", async () => {
      /** Fails the given frames, each with every listed defect. */
      const failWith = (failing: number[], defects: string[]): Turn => (args) => {
        const times = context(args)["frameTimesMs"] as number[];
        return [
          call("review_finished_cut", {
            passed: false,
            findings: defects,
            summary: "Not yet.",
            frameReviews: times.map((timeMs, index) => ({
              timeMs,
              passed: !failing.includes(index),
              findings: failing.includes(index) ? defects : []
            }))
          })
        ];
      };
      const provider = new ScriptedProvider([
        reviseTo(-700), done, failWith([0], ["The logo is missing.", "The CTA text is missing."]), done,
        reviseTo(-650), done, failWith([0, 1], ["The halo shows a hard edge."]), done,
        reviseTo(-690), done, failWith([0], ["The headline crowds the product.", "The price overlaps the product."]), done
      ]);
      const { result } = await layoutRun(provider);
      expect(result["status"]).toBe("needs_review");
      expect(result["findings"]).toEqual(["The halo shows a hard edge."]);
      const doc = (await TimelineSequence.findById(String(result["timelineId"])))!.toDocument();
      const price = doc.clips.find((clip) => clip.storyboardShotId === "hook" && clip.storyboardElementId === "price");
      expect(price?.transform?.position.y).toBe(-650);
    });

    it("stops after two rounds that fail the same frames", async () => {
      const provider = new ScriptedProvider([
        reviseTo(-700), done, failFrames(0), done,
        reviseTo(-650), done, failFrames(0), done
      ]);
      const { result } = await layoutRun(provider);
      expect(result["error"]).toBeUndefined();
      expect(result["status"]).toBe("needs_review");
      expect(result["reviews"]).toHaveLength(2);
    });

    it("stops on a reworded repeat of the same defect", async () => {
      const provider = new ScriptedProvider([
        reviseTo(-700), done, failFor("headline crowds the product image.", 0), done,
        reviseTo(-650), done, failFor("headline still crowds the product image edge.", 0), done
      ]);
      const { result } = await layoutRun(provider);
      expect(result["status"]).toBe("needs_review");
      expect(result["reviews"]).toHaveLength(2);
    });

    it("keeps revising when the same frames fail for a new defect", async () => {
      const provider = new ScriptedProvider([
        reviseTo(-700), done, failFor("headline crowds the product image.", 0), done,
        reviseTo(-650), done, failFor("logo is invisible against the brand background.", 0), done,
        reviseTo(-690), done, failFrames(0), done
      ]);
      const { result } = await layoutRun(provider);
      expect(result["status"]).toBe("needs_review");
      expect(result["reviews"]).toHaveLength(3);
    });

    it("keeps throwing in the finish phase", async () => {
      const { board, context: ctx } = await fixture();
      const layout = (await layoutStoryboard.impl(runFor(new ScriptedProvider([layOut, done, approve, done]), ctx), {
        storyboardId: board.id,
        expectedStoryboardRevision: board.revision
      })) as Record<string, unknown>;
      const animate = (durationMs: number): Turn => (args) => [
        call("edit_timeline", {
          ops: clipsOf(args)
            .filter((clip) => clip.storyboardElementId === "price")
            .map((clip) => ({ op: "animate_clip", target: clip.id, animations: [{ role: "in", preset: "fade", durationMs }] }))
        }),
        call("submit_finished_cut")
      ];
      const provider = new ScriptedProvider([
        animate(600), done, failFrames(0), done,
        animate(700), done, failFrames(0), done
      ]);
      const finished = (await finishStoryboard.impl(runFor(provider, ctx), {
        storyboardId: board.id,
        expectedStoryboardRevision: layout["storyboardRevision"],
        timelineId: layout["timelineId"],
        expectedTimelineRevision: layout["timelineRevision"],
        strategy: "agentic"
      })) as Record<string, unknown>;
      expect(finished["status"]).toBeUndefined();
      expect(finished["error"]).toMatch(/unresolved defects/);
    });
  });
});
