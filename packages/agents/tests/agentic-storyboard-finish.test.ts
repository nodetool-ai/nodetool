import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
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
import type { FinishedCutReview } from "../src/capabilities/agentic-storyboard-finish.js";
import { finishStoryboard } from "../src/capabilities/finish-storyboard.js";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

const call = (name: string, args: Record<string, unknown> = {}): ToolCall => ({
  id: `${name}-${Math.random()}`,
  name,
  args
});
type Turn = (
  args: Parameters<BaseProvider["generateMessages"]>[0]
) => Promise<readonly ToolCall[]> | readonly ToolCall[];
class FinishingProvider extends BaseProvider {
  readonly turns: Turn[];
  requests: Parameters<BaseProvider["generateMessages"]>[0][] = [];
  constructor(turns: Turn[]) {
    super("fake");
    this.turns = turns;
  }
  override async generateMessage(): Promise<Message> {
    throw new Error("Unused single-turn path.");
  }
  override async *generateMessages(
    args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
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

function authorContext(args: Parameters<BaseProvider["generateMessages"]>[0]) {
  const user = args.messages.find((message) => message.role === "user");
  const content =
    Array.isArray(user?.content) && user.content[0].type === "text"
      ? user.content[0].text
      : user?.content;
  if (typeof content !== "string") {
    throw new Error("Missing production context.");
  }
  return JSON.parse(content) as {
    storyboard: {
      shots: { id: string }[];
      screenplay: { motion_design: unknown };
    };
    scaffold: {
      clips: {
        id: string;
        storyboardElementId: string;
        storyboardShotId: string;
        trackId: string;
      }[];
    };
    previousReview: unknown;
  };
}
const done: Turn = () => [];
const approve: Turn = () => [
  call("review_finished_cut", {
    passed: true,
    findings: [],
    summary:
      "Both shots show the original red product as a separate image above a dark background. Exact white price is visible and the continuing accent remains aligned."
  })
];

async function fixture() {
  const asset = await Asset.create<Asset>({
    user_id: "u1",
    name: "Exact product",
    content_type: "image/png"
  });
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
        {
          id: "product",
          kind: "product",
          asset_id: asset.id,
          allowed_transformations: ["position", "scale", "opacity"]
        },
        {
          id: "price",
          kind: "exact_text",
          value: " €29 ",
          allowed_transformations: ["position", "scale", "opacity"]
        }
      ]
    },
    graphics: {
      mode: "graphics_first",
      elements: [
        { id: "background", kind: "shape", role: "background" },
        {
          id: "product",
          kind: "asset",
          role: "product",
          protected_input_id: "product"
        },
        {
          id: "price",
          kind: "text",
          role: "price",
          protected_input_id: "price"
        },
        { id: "accent", kind: "shape", role: "decorative" }
      ]
    }
  }));
  const board = await Storyboard.create<Storyboard>({
    user_id: "u1",
    project_id: "default",
    name: "Full cut",
    document: JSON.stringify({
      shots,
      entityIds: [],
      aspectRatio: "9:16",
      screenplay: {
        motion_design: {
          direction: "Carry the horizontal accent through both shots",
          continuities: [{ id: "accent", shot_ids: ["hook", "cta"] }],
          transitions: [
            { from_shot_id: "hook", to_shot_id: "cta", direction: "fade" }
          ]
        }
      }
    })
  });
  const context = new ProcessingContext({
    jobId: "finish-fixture",
    userId: "u1"
  });
  vi.spyOn(context, "resolveAssetBytes").mockResolvedValue({
    bytes,
    contentType: "image/png"
  });
  return { board, context, asset };
}
async function execute(
  provider: FinishingProvider,
  context: ProcessingContext,
  board: Storyboard
) {
  const run = createCapabilityRun({
    context,
    gate: UNGATED,
    subAgent: {
      provider,
      model: "scripted-vision",
      parentTools: () => [],
      forwardMessage: () => undefined
    }
  });
  return finishStoryboard.impl(run, {
    storyboardId: board.id,
    expectedStoryboardRevision: board.revision,
    strategy: "agentic"
  }) as Promise<{
    timelineId?: string;
    error?: string;
    reviews?: FinishedCutReview[];
  }>;
}

describe("whole-cut agentic finishing", () => {
  beforeEach(() => initTestDb());
  it("authors the full cut through existing ops, reviews real frames, revises a visual defect, then commits editable layers", async () => {
    const { board, context, asset } = await fixture();
    const provider = new FinishingProvider([
      (args) => {
        const data = authorContext(args);
        expect(data.storyboard.shots.map((shot) => shot.id)).toEqual([
          "hook",
          "cta"
        ]);
        expect(data.storyboard.screenplay.motion_design).toBeTruthy();
        return [call("submit_finished_cut")];
      },
      done,
      async (args) => {
        expect((await Storyboard.findById(board.id))?.timeline_id).toBeFalsy();
        const content = args.messages.find(
          (message) => message.role === "user"
        )?.content;
        expect(Array.isArray(content)).toBe(true);
        const images = Array.isArray(content)
          ? content.filter((block) => block.type === "image_url")
          : [];
        expect(images).toHaveLength(6);
        const image = images[2];
        if (!image || image.type !== "image_url" || !image.image.uri) {
          throw new Error("Missing rendered image.");
        }
        const decoded = await loadImage(
          Buffer.from(image.image.uri.split(",")[1], "base64")
        );
        expect(decoded.width).toBe(540);
        expect(decoded.height).toBe(960);
        const pixels = createCanvas(540, 960);
        pixels.getContext("2d").drawImage(decoded, 0, 0);
        expect([
          ...pixels.getContext("2d").getImageData(270, 403, 1, 1).data
        ]).toEqual([255, 0, 0, 255]);
        return [
          call("review_finished_cut", {
            passed: false,
            findings: [
              "Price is undersized relative to the product. Increase its size on both shots."
            ],
            summary:
              "The original red product is visible. The small price lacks emphasis."
          })
        ];
      },
      done,
      (args) => {
        const data = authorContext(args);
        expect(data.previousReview).toMatchObject({ passed: false });
        const prices = data.scaffold.clips.filter(
          (clip) => clip.storyboardElementId === "price"
        );
        return [
          call("edit_timeline", {
            ops: prices.map((clip) => ({
              op: "set_clip_params",
              target: clip.id,
              fontSizePx: 150
            }))
          }),
          call("submit_finished_cut")
        ];
      },
      done,
      approve,
      done
    ]);
    const result = await execute(provider, context, board);
    expect(result.error).toBeUndefined();
    expect(result.reviews?.map((review) => review.passed)).toEqual([
      false,
      true
    ]);
    const timeline = await TimelineSequence.findById(result.timelineId!);
    expect(
      timeline
        ?.toDocument()
        .clips.filter((clip) => clip.storyboardElementId === "price")
        .every(
          (clip) =>
            clip.textStyle?.text === " €29 " &&
            clip.textStyle.fontSizePx === 150
        )
    ).toBe(true);
    expect(
      timeline
        ?.toDocument()
        .clips.filter((clip) => clip.storyboardElementId === "product")
        .every(
          (clip) =>
            clip.currentAssetId === asset.id && clip.mediaType === "image"
        )
    ).toBe(true);
    expect(
      timeline
        ?.toDocument()
        .clips.every(
          (clip) =>
            clip.storyboardBoardId === board.id && !!clip.storyboardElementId
        )
    ).toBe(true);
    expect(provider.turns).toHaveLength(0);
    expect(result.reviews?.[0].referenceFrames).toEqual(
      result.reviews?.[1].referenceFrames
    );
    expect(result.reviews?.[0].frames.map((frame) => frame.sha256)).not.toEqual(
      result.reviews?.[1].frames.map((frame) => frame.sha256)
    );
  });
  it("rejects exact text replacement without any write or false visual approval", async () => {
    const { board, context } = await fixture();
    const editPrice: Turn = (args) => {
      const data = authorContext(args);
      const price = data.scaffold.clips.find(
        (clip) => clip.storyboardElementId === "price"
      )!;
      return [
        call("edit_timeline", {
          ops: [
            {
              op: "set_clip_params",
              target: price.id,
              textStyle: { text: "€39" }
            }
          ]
        }),
        call("submit_finished_cut")
      ];
    };
    const provider = new FinishingProvider([
      editPrice,
      done,
      () => [call("submit_finished_cut")],
      done
    ]);
    const result = await execute(provider, context, board);
    expect(result.error).toMatch(/did not revise/);
    expect((await Storyboard.findById(board.id))?.timeline_id).toBeFalsy();
    expect(
      provider.requests.some((request) =>
        request.tools?.some((tool) => tool.name === "review_finished_cut")
      )
    ).toBe(false);
  });
  it("fails when visual findings are unresolved and the agent submits the unchanged draft", async () => {
    const { board, context } = await fixture();
    const provider = new FinishingProvider([
      () => [call("submit_finished_cut")],
      done,
      () => [
        call("review_finished_cut", {
          passed: false,
          findings: ["CTA absent in the closing frame"],
          summary: "Closing frame needs its CTA"
        })
      ],
      done,
      () => [call("submit_finished_cut")],
      done
    ]);
    expect((await execute(provider, context, board)).error).toMatch(
      /did not revise/
    );
    expect((await Storyboard.findById(board.id))?.timeline_id).toBeFalsy();
  });
  it("blocks generation and protected asset replacement before any provider media dispatch", async () => {
    const { board, context, asset } = await fixture();
    const provider = new FinishingProvider([
      (args) => {
        const product = authorContext(args).scaffold.clips.find(
          (clip) => clip.storyboardElementId === "product"
        )!;
        return [
          call("edit_timeline", {
            ops: [
              {
                op: "generatively_edit_clip",
                target: product.id,
                prompt: "Replace the product"
              }
            ]
          }),
          call("edit_timeline", {
            ops: [
              {
                op: "set_clip_params",
                target: product.id,
                currentAssetId: "foreign-source"
              }
            ]
          }),
          call("submit_finished_cut")
        ];
      },
      (args) => {
        const results = args.messages
          .filter((message) => message.role === "tool")
          .map((message) => message.content);
        expect(
          results.some(
            (content) =>
              typeof content === "string" && content.includes("unavailable")
          )
        ).toBe(true);
        expect(
          results.some(
            (content) =>
              typeof content === "string" && content.includes("currentAssetId")
          )
        ).toBe(true);
        return [];
      },
      approve,
      done
    ]);
    const generation = vi.spyOn(provider, "textToVideo");
    const result = await execute(provider, context, board);
    expect(result.error).toBeUndefined();
    expect(
      (await TimelineSequence.findById(result.timelineId!))
        ?.toDocument()
        .clips.filter((clip) => clip.storyboardElementId === "product")
        .every((clip) => clip.currentAssetId === asset.id)
    ).toBe(true);
    expect(generation).not.toHaveBeenCalled();
  });
  it("retains extra semantic layers on rerun and explicitly conflicts after manual edits", async () => {
    const { board, context } = await fixture();
    const provider = new FinishingProvider([
      (args) => {
        const trackId = authorContext(args).scaffold.clips[0].trackId;
        return [
          call("edit_timeline", {
            ops: [
              {
                op: "add_shape_clip",
                name: "sale-accent",
                trackId,
                startMs: 0,
                durationMs: 2000,
                shape: {
                  kind: "ellipse",
                  x: 0.1,
                  y: 0.1,
                  width: 0.1,
                  height: 0.1,
                  fill: "#FFFFFF"
                }
              }
            ]
          }),
          call("submit_finished_cut")
        ];
      },
      done,
      approve,
      done
    ]);
    const first = await execute(provider, context, board);
    expect(first.error).toBeUndefined();
    const saved = (await TimelineSequence.findById(first.timelineId!))!;
    const extra = saved
      .toDocument()
      .clips.find((clip) => clip.storyboardElementId?.startsWith("$agent:"))!;
    expect(extra.storyboardShotId).toBe("hook");
    expect(extra.storyboardElementId).toBe("$agent:shape:sale-accent");
    const latestBoard = (await Storyboard.findById(board.id))!;
    const secondProvider = new FinishingProvider([
      () => [
        call("edit_timeline", {
          ops: [
            {
              op: "add_shape_clip",
              name: "sale-accent",
              trackId: extra.trackId,
              startMs: 0,
              durationMs: 2000,
              shape: {
                kind: "ellipse",
                fill: "#FFFFFF",
                x: 0.1,
                y: 0.1,
                width: 0.1,
                height: 0.1
              }
            }
          ]
        }),
        call("submit_finished_cut")
      ],
      done,
      approve,
      done
    ]);
    const run = createCapabilityRun({
      context,
      gate: UNGATED,
      subAgent: {
        provider: secondProvider,
        model: "scripted-vision",
        parentTools: () => [],
        forwardMessage: () => undefined
      }
    });
    const second = await finishStoryboard.impl(run, {
      storyboardId: board.id,
      expectedStoryboardRevision: latestBoard.revision,
      expectedTimelineRevision: saved.revision,
      strategy: "agentic"
    });
    expect(second).not.toHaveProperty("error");
    const rerun = (await TimelineSequence.findById(saved.id))!;
    expect(
      rerun
        .toDocument()
        .clips.filter((clip) => clip.storyboardElementId?.startsWith("$agent:"))
        .map((clip) => clip.id)
    ).toEqual([extra.id]);
    const document = rerun.toDocument();
    document.clips.find((clip) => clip.id === extra.id)!.opacity = 0.5;
    await TimelineSequence.updateDocumentIfUnchanged(
      rerun.id,
      rerun.updated_at,
      document
    );
    const manual = (await TimelineSequence.findById(saved.id))!;
    const newestBoard = (await Storyboard.findById(board.id))!;
    expect(
      await finishStoryboard.impl(run, {
        storyboardId: board.id,
        expectedStoryboardRevision: newestBoard.revision,
        expectedTimelineRevision: manual.revision,
        strategy: "agentic"
      })
    ).toMatchObject({
      error: "Produced Timeline violates production requirements.",
      validation: expect.arrayContaining([
        expect.objectContaining({ code: "manual_conflict" })
      ])
    });
    expect(
      (await TimelineSequence.findById(saved.id))
        ?.toDocument()
        .clips.find((clip) => clip.id === extra.id)?.opacity
    ).toBe(0.5);
  });
  it("supports editable groups for unprotected graphics with stable provenance", async () => {
    const { board, context } = await fixture();
    const provider = new FinishingProvider([
      (args) => {
        const document = authorContext(args).scaffold;
        const children = document.clips
          .filter(
            (clip) =>
              clip.storyboardShotId === "hook" &&
              ["background", "accent"].includes(clip.storyboardElementId)
          )
          .map((clip) => clip.id);
        return [
          call("edit_timeline", {
            ops: [
              {
                op: "add_group",
                name: "hook-decoration",
                trackId: document.clips[0].trackId,
                startMs: 0,
                durationMs: 2000,
                children
              }
            ]
          }),
          call("submit_finished_cut")
        ];
      },
      done,
      approve,
      done
    ]);
    const result = await execute(provider, context, board);
    expect(result.error).toBeUndefined();
    const clips = (await TimelineSequence.findById(
      result.timelineId!
    ))!.toDocument().clips;
    const group = clips.find(
      (clip) => clip.storyboardElementId === "$agent:group:hook-decoration"
    )!;
    expect(group.mediaType).toBe("group");
    expect(
      clips
        .filter((clip) => clip.parentId === group.id)
        .map((clip) => clip.storyboardElementId)
        .sort()
    ).toEqual(["accent", "background"]);
  });
  it("does not commit a visually approved stale board or a cancelled review", async () => {
    for (const cancel of [false, true]) {
      const { board, context } = await fixture();
      const provider = new FinishingProvider([
        () => [call("submit_finished_cut")],
        done,
        async () => {
          if (cancel) {
            const abort = new AbortController();
            context.signal = abort.signal;
            abort.abort();
          } else {
            const changed = (await Storyboard.findById(board.id))!;
            changed.name = "Concurrent edit";
            await changed.save();
          }
          return approve({ messages: [], model: "unused" });
        },
        done
      ]);
      const result = await execute(provider, context, board);
      expect(result.error).toBeTruthy();
      expect((await Storyboard.findById(board.id))?.timeline_id).toBeFalsy();
    }
  });
  it("fails before dispatch without a session provider or after cancellation", async () => {
    const { board, context } = await fixture();
    const run = createCapabilityRun({ context, gate: UNGATED });
    expect(
      await finishStoryboard.impl(run, {
        storyboardId: board.id,
        expectedStoryboardRevision: board.revision,
        strategy: "agentic"
      })
    ).toHaveProperty("error");
    const abort = new AbortController();
    abort.abort();
    context.signal = abort.signal;
    const provider = new FinishingProvider([]);
    await expect(execute(provider, context, board)).rejects.toThrow();
    expect(provider.requests).toHaveLength(0);
  });
});
