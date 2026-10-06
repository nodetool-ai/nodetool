import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRecord, sandboxCapabilitySpecifier } from "@nodetool-ai/protocol";
import { runCodeBody } from "../src/capabilities/code.js";
import { mountJsScriptSandbox } from "../src/js-script-sandbox.js";
import {
  hasTemporaryImageHandle,
  registerTemporaryImageHandle
} from "../src/tools/image-injection.js";
import { PERMISSION_GATE_CONTEXT_KEY } from "../src/types.js";
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
  loopRequests: Parameters<BaseProvider["generateLoop"]>[0][] = [];
  override async *generateLoop(
    args: Parameters<BaseProvider["generateLoop"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    this.loopRequests.push(args);
    yield* super.generateLoop(args);
  }
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
        startMs: number;
        durationMs: number;
        textStyle?: { fontSizePx?: number };
      }[];
    };
    previousReview: unknown;
    operationContracts: Record<
      string,
      { parameters: { properties?: Record<string, unknown> } }
    >;
  };
}
const done: Turn = () => [];
const craft: Turn = (args) => [
  call("edit_timeline", {
    ops: authorContext(args)
      .scaffold.clips.filter((clip) => clip.storyboardElementId === "price")
      .map((clip) => ({
        op: "set_clip_params",
        target: clip.id,
        fontSizePx: 170
      }))
  }),
  call("submit_finished_cut")
];
function candidateFrameReviews(
  args: Parameters<BaseProvider["generateMessages"]>[0],
  findings: string[] = []
) {
  const user = args.messages.find((message) => message.role === "user");
  const content =
    Array.isArray(user?.content) && user.content[0].type === "text"
      ? user.content[0].text
      : user?.content;
  if (typeof content !== "string") {
    throw new Error("Missing candidate frame context.");
  }
  const parsed: unknown = JSON.parse(content);
  if (!isRecord(parsed) || !Array.isArray(parsed["frameTimesMs"])) {
    throw new Error("Missing candidate frame times.");
  }
  return parsed["frameTimesMs"].map((timeMs, index) => {
    if (typeof timeMs !== "number") {
      throw new Error("Invalid candidate frame time.");
    }
    return {
      timeMs,
      passed: index > 0 || findings.length === 0,
      findings: index === 0 ? findings : []
    };
  });
}
const approve: Turn = (args) => [
  call("review_finished_cut", {
    passed: true,
    findings: [],
    frameReviews: candidateFrameReviews(args),
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
  board: Storyboard,
  expectedTimelineRevision?: number
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
    strategy: "agentic",
    ...(expectedTimelineRevision !== undefined && { expectedTimelineRevision })
  }) as Promise<{
    timelineId?: string;
    error?: string;
    reviews?: FinishedCutReview[];
  }>;
}

describe("finish_storyboard whole-cut agentic finishing", () => {
  beforeEach(() => initTestDb());
  it("limits authoring and visual review to their supplied tool scopes", async () => {
    const { board, context } = await fixture();
    const provider = new FinishingProvider([craft, done, approve, done]);
    const result = await execute(provider, context, board);
    expect(result.error).toBeUndefined();
    expect(provider.loopRequests).toHaveLength(2);
    expect(
      provider.loopRequests.every((args) => args.providedToolsOnly === true)
    ).toBe(true);
    expect(provider.loopRequests[0].tools?.map((tool) => tool.name)).toEqual([
      "get_timeline",
      "edit_timeline",
      "submit_finished_cut"
    ]);
    expect(provider.loopRequests[1].tools?.map((tool) => tool.name)).toEqual([
      "review_finished_cut"
    ]);
  });

  it("refuses to finish a new agentic cut with only an unchanged scaffold", async () => {
    const { board, context } = await fixture();
    const provider = new FinishingProvider([
      () => [
        call("edit_timeline", { ops: [{ op: "get_state" }] }),
        call("submit_finished_cut")
      ],
      done,
      // The reminder turn after the refused submission.
      done
    ]);
    const result = await execute(provider, context, board);
    expect(result.error).toMatch(/author.*layout.*motion/i);
    expect((await Storyboard.findById(board.id))?.timeline_id).toBeFalsy();
    expect(
      provider.requests.some((request) =>
        request.tools?.some((tool) => tool.name === "review_finished_cut")
      )
    ).toBe(false);
  });
  it("requires a real composition change after no-op and metadata edits before accepting a new cut", async () => {
    const { board, context } = await fixture();
    const provider = new FinishingProvider([
      (args) => {
        const price = authorContext(args).scaffold.clips.find(
          (clip) => clip.storyboardElementId === "price"
        )!;
        return [
          call("edit_timeline", {
            ops: [
              {
                op: "set_clip_params",
                target: price.id,
                fontSizePx: price.textStyle?.fontSizePx,
                name: "Editorial price"
              }
            ]
          }),
          call("submit_finished_cut")
        ];
      },
      (args) => {
        expect(JSON.stringify(args.messages)).toContain(
          "unchanged deterministic scaffold"
        );
        return craft(args);
      },
      done,
      approve,
      done
    ]);
    const result = await execute(provider, context, board);
    expect(result.error).toBeUndefined();
    const timeline = (await TimelineSequence.findById(result.timelineId!))!;
    expect(
      timeline
        .toDocument()
        .clips.filter((clip) => clip.storyboardElementId === "price")
        .every((clip) => clip.textStyle?.fontSizePx === 170)
    ).toBe(true);
  });
  it("accepts an authored transition as the only first-pass finishing change", async () => {
    const { board, context } = await fixture();
    const provider = new FinishingProvider([
      (args) => {
        const accent = authorContext(args).scaffold.clips.find(
          (clip) =>
            clip.storyboardElementId === "accent" &&
            clip.storyboardShotId === "cta"
        )!;
        return [
          call("edit_timeline", {
            ops: [
              {
                op: "set_transition",
                target: accent.id,
                transition: { type: "crossfade", durationMs: 300 }
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
    expect(
      (await TimelineSequence.findById(result.timelineId!))
        ?.toDocument()
        .clips.find(
          (clip) =>
            clip.storyboardElementId === "accent" &&
            clip.storyboardShotId === "cta"
        )?.transitionIn
    ).toMatchObject({ type: "crossfade", durationMs: 300 });
  });
  it("preserves accepted agent-authored typography on an unchanged rerun", async () => {
    const { board, context } = await fixture();
    const first = await execute(
      new FinishingProvider([craft, done, approve, done]),
      context,
      board
    );
    const before = (await TimelineSequence.findById(first.timelineId!))!;
    const latestBoard = (await Storyboard.findById(board.id))!;
    const result = await execute(
      new FinishingProvider([
        () => [call("submit_finished_cut")],
        done,
        approve,
        done
      ]),
      context,
      latestBoard,
      before.revision
    );
    expect(result.error).toBeUndefined();
    expect(
      (await TimelineSequence.findById(before.id))
        ?.toDocument()
        .clips.filter((clip) => clip.storyboardElementId === "price")
        .map((clip) => clip.textStyle?.fontSizePx)
    ).toEqual([170, 170]);
  });
  it("lets a rerun move a layer that no person moved", async () => {
    const { board, context } = await fixture();
    const first = await execute(
      new FinishingProvider([craft, done, approve, done]),
      context,
      board
    );
    const before = (await TimelineSequence.findById(first.timelineId!))!;
    const editResults: string[] = [];
    const move: Turn = (args) => [
      call("edit_timeline", {
        ops: authorContext(args)
          .scaffold.clips.filter((clip) => clip.storyboardElementId === "price")
          .map((clip) => ({
            op: "set_clip_params",
            target: clip.id,
            transform: { position: { y: 300 } }
          }))
      }),
      call("submit_finished_cut")
    ];
    const recordEdit: Turn = (args) => {
      const tool = args.messages.filter((message) => message.role === "tool");
      editResults.push(String(tool[0]?.content));
      return [];
    };
    const result = await execute(
      new FinishingProvider([move, recordEdit, approve, done]),
      context,
      (await Storyboard.findById(board.id))!,
      before.revision
    );
    expect(editResults[0]).not.toMatch(/Manual transform edit/);
    expect(result.error).toBeUndefined();
    const clips = (await TimelineSequence.findById(before.id))!.toTimelineSequence().clips;
    expect(
      clips
        .filter((clip) => clip.storyboardElementId === "price")
        .map((clip) => clip.transform?.position.y)
    ).toEqual([300, 300]);
  });
  it("returns copy that collides with the product to the author before any visual review", async () => {
    const { board, context } = await fixture();
    type Placed = { transform?: { position: { y: number }; scale: { y: number } } };
    const placePrice = (y: (product: Placed) => number): Turn => (args) => {
      const clips = authorContext(args).scaffold.clips as (ReturnType<typeof authorContext>["scaffold"]["clips"][number] & Placed)[];
      return [
        call("edit_timeline", {
          ops: clips
            .filter((clip) => clip.storyboardElementId === "price")
            .map((clip) => ({
              op: "set_clip_params",
              target: clip.id,
              transform: {
                position: {
                  y: y(clips.find((value) => value.storyboardElementId === "product" && value.storyboardShotId === clip.storyboardShotId)!)
                }
              }
            }))
        }),
        call("submit_finished_cut")
      ];
    };
    let revisionContext = "";
    const provider = new FinishingProvider([
      // A square image contain-fits 1080px tall in a 1080×1920 frame, so this straddles its bottom edge.
      placePrice((product) => product.transform!.position.y + 540 * product.transform!.scale.y),
      done,
      (args) => {
        revisionContext = JSON.stringify(authorContext(args).previousReview);
        return placePrice(() => 600)(args);
      },
      done,
      approve,
      done
    ]);
    const result = await execute(provider, context, board);
    expect(result.error).toBeUndefined();
    expect(revisionContext).toContain("layoutDefects");
    expect(revisionContext).toMatch(/Copy \\"€29\\" \(price, \w+\) overlaps product/);
    // The colliding candidate never reached the visual reviewer.
    expect(result.reviews).toHaveLength(1);
    const reviewRequest = provider.requests.find((request) =>
      request.tools?.some((tool) => tool.name === "review_finished_cut")
    );
    expect(JSON.stringify(reviewRequest?.messages)).toContain("HOLD frame for shot hook");
  });

  it("refreshes exact copy and protected color while preserving authored typography and manual product placement", async () => {
    const { board, context } = await fixture();
    const initialBoard = board.toDocument();
    for (const shot of initialBoard.shots) {
      shot.production!.protected_inputs!.push({
        id: "brand",
        kind: "brand_color",
        value: "#0033AA",
        allowed_transformations: ["opacity"]
      });
      shot.graphics!.elements!.find(
        (element) => element.id === "background"
      )!.protected_input_id = "brand";
    }
    board.document = JSON.stringify(initialBoard);
    await board.save();
    const first = await execute(
      new FinishingProvider([craft, done, approve, done]),
      context,
      board
    );
    const before = (await TimelineSequence.findById(first.timelineId!))!;
    const manual = before.toDocument();
    for (const clip of manual.clips.filter(
      (clip) => clip.storyboardElementId === "product"
    ))
      clip.transform!.position.x = 80;
    await TimelineSequence.updateDocumentIfUnchanged(
      before.id,
      before.updated_at,
      manual
    );
    const updated = (await TimelineSequence.findById(before.id))!;
    const latestBoard = (await Storyboard.findById(board.id))!;
    const changed = latestBoard.toDocument();
    const replacement = await Asset.create<Asset>({
      user_id: "u1",
      name: "Updated product input",
      content_type: "image/png"
    });
    for (const shot of changed.shots) {
      shot.production!.protected_inputs!.find(
        (input) => input.id === "product"
      )!.asset_id = replacement.id;
      shot.production!.protected_inputs!.find(
        (input) => input.id === "price"
      )!.value = " €19 ";
      shot.production!.protected_inputs!.find(
        (input) => input.id === "brand"
      )!.value = "#AA3300";
    }
    latestBoard.document = JSON.stringify(changed);
    await latestBoard.save();
    let manualEdits: unknown;
    const result = await execute(
      new FinishingProvider([
        (args) => {
          manualEdits = (
            authorContext(args) as unknown as { manualEdits: unknown }
          ).manualEdits;
          return [call("submit_finished_cut")];
        },
        done,
        approve,
        done
      ]),
      context,
      latestBoard,
      updated.revision
    );
    expect(result.error).toBeUndefined();
    const clips = (await TimelineSequence.findById(before.id))!.toDocument()
      .clips;
    expect(
      clips
        .filter((clip) => clip.storyboardElementId === "price")
        .map((clip) => [clip.textStyle?.fontSizePx, clip.textStyle?.text])
    ).toEqual([
      [170, " €19 "],
      [170, " €19 "]
    ]);
    expect(
      clips
        .filter((clip) => clip.storyboardElementId === "product")
        .map((clip) => clip.transform?.position.x)
    ).toEqual([80, 80]);
    expect(manualEdits).toEqual(
      manual.clips
        .filter((clip) => clip.storyboardElementId === "product")
        .map((clip) => ({ clipId: clip.id, name: clip.name, fields: ["transform"] }))
    );
    expect(
      clips
        .filter((clip) => clip.storyboardElementId === "product")
        .map((clip) => clip.currentAssetId)
    ).toEqual([replacement.id, replacement.id]);
    expect(
      clips
        .filter((clip) => clip.storyboardElementId === "background")
        .map((clip) => clip.shapeStyle?.fill)
    ).toEqual(["#AA3300", "#AA3300"]);
  });
  it.each(["mask", "transition"])(
    "refuses retained forbidden protected %s before provider spend or save",
    async (feature) => {
      const { board, context } = await fixture();
      const first = await execute(
        new FinishingProvider([craft, done, approve, done]),
        context,
        board
      );
      const before = (await TimelineSequence.findById(first.timelineId!))!;
      const manual = before.toDocument();
      const product = manual.clips.find(
        (clip) => clip.storyboardElementId === "product"
      )!;
      if (feature === "mask")
        product.mask = { kind: "ellipse", x: 0, y: 0, width: 0.5, height: 1 };
      else product.transitionIn = { type: "push", durationMs: 300 };
      await TimelineSequence.updateDocumentIfUnchanged(
        before.id,
        before.updated_at,
        manual
      );
      const current = (await TimelineSequence.findById(before.id))!;
      const provider = new FinishingProvider([]);
      const result = await execute(
        provider,
        context,
        (await Storyboard.findById(board.id))!,
        current.revision
      );
      expect(result.error).toMatch(/production requirements/);
      expect(result.error).toContain(
        feature === "mask" ? "mask" : "transitionIn"
      );
      expect(provider.requests).toHaveLength(0);
      expect((await TimelineSequence.findById(before.id))?.revision).toBe(
        current.revision
      );
    }
  );
  it("conflicts instead of overwriting a manually added transition on a rerun", async () => {
    const { board, context } = await fixture();
    const first = await execute(
      new FinishingProvider([craft, done, approve, done]),
      context,
      board
    );
    const before = (await TimelineSequence.findById(first.timelineId!))!;
    const manual = before.toDocument();
    const accent = manual.clips.find(
      (clip) => clip.storyboardElementId === "accent"
    )!;
    accent.transitionIn = { type: "crossfade", durationMs: 300 };
    await TimelineSequence.updateDocumentIfUnchanged(
      before.id,
      before.updated_at,
      manual
    );
    const current = (await TimelineSequence.findById(before.id))!;
    const provider = new FinishingProvider([
      (args) => [
        call("edit_timeline", {
          ops: [
            {
              op: "set_transition",
              target: authorContext(args).scaffold.clips.find(
                (clip) => clip.id === accent.id
              )!.id,
              transition: { type: "zoom", durationMs: 300 }
            }
          ]
        }),
        call("submit_finished_cut")
      ],
      done
    ]);
    const result = await execute(
      provider,
      context,
      (await Storyboard.findById(board.id))!,
      current.revision
    );
    expect(result.error).toMatch(/manually changed.*transitionIn/);
    expect((await TimelineSequence.findById(before.id))?.revision).toBe(
      current.revision
    );
    expect(
      (await TimelineSequence.findById(before.id))
        ?.toDocument()
        .clips.find((clip) => clip.id === accent.id)?.transitionIn
    ).toEqual(accent.transitionIn);
  });
  it.each(["font", "opacity", "animation"])(
    "conflicts before author dispatch for manual %s changes after an accepted finish",
    async (feature) => {
      const { board, context } = await fixture();
      const first = await execute(
        new FinishingProvider([craft, done, approve, done]),
        context,
        board
      );
      const before = (await TimelineSequence.findById(first.timelineId!))!;
      const manual = before.toDocument();
      const price = manual.clips.find(
        (clip) => clip.storyboardElementId === "price"
      )!;
      if (feature === "font") price.textStyle!.fontSizePx = 190;
      else if (feature === "opacity") price.opacity = 0.8;
      else price.animations![0].durationMs = 600;
      await TimelineSequence.updateDocumentIfUnchanged(
        before.id,
        before.updated_at,
        manual
      );
      const current = (await TimelineSequence.findById(before.id))!;
      const provider = new FinishingProvider([craft, done, approve, done]);
      const result = await execute(
        provider,
        context,
        (await Storyboard.findById(board.id))!,
        current.revision
      );
      expect(result).toMatchObject({
        error: expect.any(String),
        validation: expect.arrayContaining([
          expect.objectContaining({ code: "manual_conflict" })
        ])
      });
      expect(provider.requests).toHaveLength(0);
      expect(
        (await TimelineSequence.findById(before.id))?.toDocument()
      ).toEqual(current.toDocument());
      expect((await TimelineSequence.findById(before.id))?.revision).toBe(
        current.revision
      );
    }
  );
  it("preserves manually renamed source layers and tracks on an unchanged agentic rerun", async () => {
    const { board, context } = await fixture();
    const first = await execute(
      new FinishingProvider([craft, done, approve, done]),
      context,
      board
    );
    const before = (await TimelineSequence.findById(first.timelineId!))!;
    const manual = before.toDocument();
    const price = manual.clips.find(
      (clip) => clip.storyboardElementId === "price"
    )!;
    price.name = "Human price";
    manual.tracks.find((track) => track.id === price.trackId)!.name =
      "Human price track";
    await TimelineSequence.updateDocumentIfUnchanged(
      before.id,
      before.updated_at,
      manual
    );
    const current = (await TimelineSequence.findById(before.id))!;
    const provider = new FinishingProvider([
      () => [call("submit_finished_cut")],
      done,
      approve,
      done
    ]);
    const result = await execute(
      provider,
      context,
      (await Storyboard.findById(board.id))!,
      current.revision
    );
    expect(result.error).toBeUndefined();
    const document = (await TimelineSequence.findById(before.id))!.toDocument();
    expect(document.clips.find((clip) => clip.id === price.id)?.name).toBe(
      "Human price"
    );
    expect(
      document.tracks.find((track) => track.id === price.trackId)?.name
    ).toBe("Human price track");
  });
  it("conflicts instead of overwriting a manually renamed source layer", async () => {
    const { board, context } = await fixture();
    const first = await execute(
      new FinishingProvider([craft, done, approve, done]),
      context,
      board
    );
    const before = (await TimelineSequence.findById(first.timelineId!))!;
    const manual = before.toDocument();
    const price = manual.clips.find(
      (clip) => clip.storyboardElementId === "price"
    )!;
    price.name = "Human price";
    await TimelineSequence.updateDocumentIfUnchanged(
      before.id,
      before.updated_at,
      manual
    );
    const current = (await TimelineSequence.findById(before.id))!;
    const provider = new FinishingProvider([
      () => [
        call("edit_timeline", {
          ops: [
            { op: "set_clip_params", target: price.id, name: "Automatic price" }
          ]
        }),
        call("submit_finished_cut")
      ],
      done,
      // The reminder turn after a rejected edit.
      done
    ]);
    const result = await execute(
      provider,
      context,
      (await Storyboard.findById(board.id))!,
      current.revision
    );
    expect(result.error).toMatch(/cannot rename existing Timeline layer/);
    expect(
      (await TimelineSequence.findById(before.id))
        ?.toDocument()
        .clips.find((clip) => clip.id === price.id)?.name
    ).toBe("Human price");
    expect((await TimelineSequence.findById(before.id))?.revision).toBe(
      current.revision
    );
  });
  it("rolls back protected transitions on a rerun and permits a corrected reviewed candidate", async () => {
    const { board, context } = await fixture();
    const first = await execute(
      new FinishingProvider([craft, done, approve, done]),
      context,
      board
    );
    const current = (await TimelineSequence.findById(first.timelineId!))!;
    const original = current.toDocument();
    const product = original.clips.find(
      (clip) => clip.storyboardElementId === "product"
    )!;
    const price = original.clips.find(
      (clip) => clip.storyboardElementId === "price"
    )!;
    let untouched: ReturnType<typeof authorContext>["scaffold"];
    const provider = new FinishingProvider([
      (args) => {
        untouched = authorContext(args).scaffold;
        expect(args.tools?.find((tool) => tool.name === "edit_timeline")?.description)
          .toContain("set_transition is forbidden on every protected layer");
        return [
          call("edit_timeline", {
            ops: [
              {
                op: "set_transition",
                target: product.id,
                transition: { type: "crossfade", durationMs: 300 }
              },
              { op: "set_clip_params", target: price.id, fontSizePx: 999 }
            ]
          })
        ];
      },
      (args) => {
        const response = args.messages
          .filter((message) => message.role === "tool")
          .at(-1)?.content;
        expect(JSON.parse(String(response))).toMatchObject({
          ok: false,
          rolledBack: true,
          error: expect.stringContaining(
            "Transition crossfade has no proven protected transformation policy"
          )
        });
        expect(String(response)).toContain("forbidden_transform");
        return [call("get_timeline")];
      },
      (args) => {
        const response = args.messages
          .filter((message) => message.role === "tool")
          .at(-1)?.content;
        expect(JSON.parse(String(response))).toEqual(untouched);
        return [
          call("edit_timeline", {
            ops: [
              { op: "set_transition", target: product.id, transition: null },
              { op: "set_clip_params", target: price.id, fontSizePx: 180 }
            ]
          }),
          call("submit_finished_cut")
        ];
      },
      done,
      approve,
      done
    ]);
    const result = await execute(
      provider,
      context,
      (await Storyboard.findById(board.id))!,
      current.revision
    );
    expect(result.error).toBeUndefined();
    const produced = (await TimelineSequence.findById(current.id))!;
    expect(produced.revision).toBe(current.revision + 1);
    expect(
      produced.toDocument().clips.find((clip) => clip.id === product.id)
        ?.transitionIn
    ).toBeUndefined();
    expect(
      produced.toDocument().clips.find((clip) => clip.id === price.id)
        ?.textStyle?.fontSizePx
    ).toBe(180);
    expect(result["reviews"]).toEqual(
      expect.arrayContaining([expect.objectContaining({ passed: true })])
    );
  });
  it("rolls back added protected copy with its mixed batch and accepts corrected authoring", async () => {
    const { board, context } = await fixture();
    let original: ReturnType<typeof authorContext>["scaffold"]["clips"][number];
    const provider = new FinishingProvider([
      (args) => {
        original = authorContext(args).scaffold.clips.find(
          (clip) => clip.storyboardElementId === "price"
        )!;
        return [
          call("edit_timeline", {
            ops: [
              { op: "set_clip_params", target: original.id, fontSizePx: 999 },
              {
                op: "add_text_clip",
                name: "duplicate-price",
                text: " €29 ",
                trackId: original.trackId,
                startMs: original.startMs,
                durationMs: original.durationMs
              }
            ]
          })
        ];
      },
      (args) => {
        const response = args.messages
          .filter((message) => message.role === "tool")
          .at(-1)?.content;
        expect(JSON.parse(String(response))).toMatchObject({
          ok: false,
          rolledBack: true,
          error: expect.stringContaining(
            "Additional text must use approved unprotected Storyboard copy"
          )
        });
        expect(String(response)).toContain("set_clip_params");
        return [call("get_timeline")];
      },
      (args) => {
        const response = args.messages
          .filter((message) => message.role === "tool")
          .at(-1)?.content;
        expect(JSON.parse(String(response))).toMatchObject({
          clips: expect.arrayContaining([
            expect.objectContaining({
              id: original.id,
              textStyle: expect.objectContaining({
                fontSizePx: original.textStyle!.fontSizePx
              })
            })
          ])
        });
        expect(String(response)).not.toContain("duplicate-price");
        return craft(args);
      },
      done,
      approve,
      done
    ]);
    const result = await execute(provider, context, board);
    expect(result.error).toBeUndefined();
    const timeline = await TimelineSequence.findById(String(result["timelineId"]));
    expect(
      timeline?.toDocument().clips.some((clip) => clip.name === "duplicate-price")
    ).toBe(false);
    expect(
      timeline?.toDocument().clips.find((clip) => clip.id === original.id)
        ?.textStyle?.fontSizePx
    ).toBe(170);
  });
  it("rolls back forbidden source timing at the edit boundary and accepts a corrected authored candidate", async () => {
    const { board, context } = await fixture();
    let original:
      | ReturnType<typeof authorContext>["scaffold"]["clips"][number]
      | undefined;
    const provider = new FinishingProvider([
      (args) => {
        original = authorContext(args).scaffold.clips.find(
          (clip) => clip.storyboardElementId === "price"
        )!;
        return [
          call("edit_timeline", {
            ops: [
              {
                op: "set_clip_params",
                target: original.id,
                startMs: original.startMs + 100,
                durationMs: original.durationMs - 100,
                fontSizePx: 999
              }
            ]
          })
        ];
      },
      (args) => {
        const response = args.messages
          .filter((message) => message.role === "tool")
          .at(-1)?.content;
        expect(typeof response).toBe("string");
        expect(JSON.parse(String(response))).toMatchObject({
          ok: false,
          rolledBack: true,
          error: expect.stringContaining(
            "preserve the deterministic shot window"
          )
        });
        expect(String(response)).toContain(
          "No changes from this batch were applied"
        );
        return [call("get_timeline")];
      },
      (args) => {
        const response = args.messages
          .filter((message) => message.role === "tool")
          .at(-1)?.content;
        expect(JSON.parse(String(response))).toMatchObject({
          clips: expect.arrayContaining([
            expect.objectContaining({
              id: original!.id,
              startMs: original!.startMs,
              durationMs: original!.durationMs,
              textStyle: expect.objectContaining({
                fontSizePx: original!.textStyle!.fontSizePx
              })
            })
          ])
        });
        return craft(args);
      },
      done,
      approve,
      done
    ]);
    const result = await execute(provider, context, board);
    expect(result.error).toBeUndefined();
    const document = (await TimelineSequence.findById(
      result.timelineId!
    ))!.toDocument();
    expect(
      document.clips.find((clip) => clip.id === original!.id)
    ).toMatchObject({
      startMs: original!.startMs,
      durationMs: original!.durationMs,
      textStyle: { fontSizePx: 170 }
    });
    expect(result.reviews).toEqual([expect.objectContaining({ passed: true })]);
  });
  it("allows an unchanged existing cut to finish after full visual review", async () => {
    const { board, context } = await fixture();
    const initial = (await finishStoryboard.impl(
      createCapabilityRun({ context, gate: UNGATED }),
      {
        storyboardId: board.id,
        expectedStoryboardRevision: board.revision
      }
    )) as { timelineId: string };
    const before = (await TimelineSequence.findById(initial.timelineId))!;
    const latestBoard = (await Storyboard.findById(board.id))!;
    const provider = new FinishingProvider([
      () => [call("submit_finished_cut")],
      done,
      approve,
      done
    ]);
    const result = await finishStoryboard.impl(
      createCapabilityRun({
        context,
        gate: UNGATED,
        subAgent: {
          provider,
          model: "review",
          parentTools: () => [],
          forwardMessage: () => undefined
        }
      }),
      {
        storyboardId: board.id,
        expectedStoryboardRevision: latestBoard.revision,
        expectedTimelineRevision: before.revision,
        strategy: "agentic"
      }
    );
    expect(result).not.toHaveProperty("error");
    expect(
      (await TimelineSequence.findById(before.id))?.toDocument().clips
    ).toEqual(before.toDocument().clips);
  });
  it("authors the full cut through existing ops, reviews real frames, revises a visual defect, then commits editable layers", async () => {
    const { board, context, asset } = await fixture();
    const provider = new FinishingProvider([
      (args) => {
        const data = authorContext(args);
        expect(args.effort).toBe("medium");
        expect(args.thinking).toEqual({ type: "disabled" });
        expect(data.storyboard.shots.map((shot) => shot.id)).toEqual([
          "hook",
          "cta"
        ]);
        expect(data.storyboard.screenplay.motion_design).toBeTruthy();
        const editor = args.tools?.find(
          (tool) => tool.name === "edit_timeline"
        );
        expect(editor?.inputSchema.required).toEqual(["ops"]);
        expect(editor?.inputSchema.properties).not.toHaveProperty(
          "timeline_id"
        );
        expect(editor?.description).not.toContain("add_media_clip");
        expect(
          data.operationContracts.set_clip_params.parameters.properties
        ).toHaveProperty("fontSizePx");
        return [
          call("edit_timeline", {
            ops: [
              { op: "get_state" },
              { op: "list_animation_presets" },
              ...data.scaffold.clips
                .filter((clip) => clip.storyboardElementId === "price")
                .map((clip) => ({
                  op: "set_clip_params",
                  target: clip.id,
                  fontSizePx: 140
                }))
            ]
          }),
          call("submit_finished_cut")
        ];
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
        expect(images.length).toBeGreaterThan(6);
        expect(candidateFrameReviews(args).some((frame) => frame.timeMs === 1850)).toBe(true);
        const holdIndex = candidateFrameReviews(args).findIndex((frame) => frame.timeMs === 1000);
        expect(holdIndex).toBeGreaterThanOrEqual(0);
        const image = images[2 + holdIndex];
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
            frameReviews: candidateFrameReviews(args, [
              "Price is undersized relative to the product. Increase its size on both shots."
            ]),
            summary:
              "The original red product is visible. The small price lacks emphasis."
          })
        ];
      },
      done,
      (args) => {
        const data = authorContext(args);
        expect(data.previousReview).toMatchObject({ passed: false });
        const content = args.messages.find(
          (message) => message.role === "user"
        )?.content;
        expect(
          Array.isArray(content)
            ? content.filter((block) => block.type === "image_url").length
            : 0
        ).toBeGreaterThan(6);
        expect(JSON.stringify(content)).toContain(
          "Previous candidate cut frame"
        );
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
  it("serializes concurrent provider edit callbacks so independent clip changes are both retained", async () => {
    const { board, context } = await fixture();
    class ParallelAuthorProvider extends FinishingProvider {
      authored = false;
      override async *generateLoop(
        args: Parameters<BaseProvider["generateLoop"]>[0]
      ): AsyncGenerator<ProviderStreamItem> {
        if (
          !this.authored &&
          args.tools?.some((tool) => tool.name === "edit_timeline")
        ) {
          this.authored = true;
          const executeTool = args.executeTool;
          if (!executeTool) {
            throw new Error("No draft executor.");
          }
          const prices = authorContext(args).scaffold.clips.filter(
            (clip) => clip.storyboardElementId === "price"
          );
          await Promise.all(
            prices.map((clip, index) =>
              executeTool(
                call("edit_timeline", {
                  ops: [
                    {
                      op: "set_clip_params",
                      target: clip.id,
                      fontSizePx: 170 + index * 10
                    }
                  ]
                })
              )
            )
          );
          await executeTool(call("submit_finished_cut"));
          return;
        }
        yield* super.generateLoop(args);
      }
    }
    const provider = new ParallelAuthorProvider([approve, done]);
    const result = await execute(provider, context, board);
    expect(result.error).toBeUndefined();
    const timeline = result.timelineId
      ? await TimelineSequence.findById(result.timelineId)
      : null;
    expect(
      timeline
        ?.toDocument()
        .clips.filter((clip) => clip.storyboardElementId === "price")
        .map((clip) => clip.textStyle?.fontSizePx)
    ).toEqual([170, 180]);
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
    expect(result.error).toMatch(/requires its exact editable text/);
    expect(result.error).toContain("rolledBack");
    expect((await Storyboard.findById(board.id))?.timeline_id).toBeFalsy();
    expect(
      provider.requests.some((request) =>
        request.tools?.some((tool) => tool.name === "review_finished_cut")
      )
    ).toBe(false);
  });
  it("requires consistent per-frame review verdicts before recording an explicit corrected pass", async () => {
    const { board, context } = await fixture();
    const provider = new FinishingProvider([
      craft,
      done,
      (args) => [
        call("review_finished_cut", {
          passed: false,
          findings: [],
          summary: "All supplied candidate frames are clear and have no defects.",
          frameReviews: candidateFrameReviews(args)
        })
      ],
      (args) => {
        const response = args.messages
          .filter((message) => message.role === "tool")
          .at(-1)?.content;
        expect(String(response)).toContain("consistent");
        return [
          call("review_finished_cut", {
            passed: true,
            findings: [],
            summary: "After explicitly checking every candidate frame, no material visual defect remains.",
            frameReviews: candidateFrameReviews(args)
          })
        ];
      },
      done
    ]);
    const result = await execute(provider, context, board);
    expect(result.error).toBeUndefined();
    expect(result["reviews"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          passed: true,
          findings: [],
          frameReviews: expect.any(Array)
        })
      ])
    );
    expect((await Storyboard.findById(board.id))?.timeline_id).toBe(result.timelineId);
  });
  it.each([
    "missing",
    "duplicate",
    "unknown",
    "overall_pass",
    "frame_pass",
    "findings_mismatch"
  ])("does not record inconsistent %s frame review or persist a candidate", async (mistake) => {
    const { board, context } = await fixture();
    const provider = new FinishingProvider([
      craft,
      done,
      (args) => {
        const frameReviews = candidateFrameReviews(args);
        const findings: string[] = [];
        let passed = true;
        if (mistake === "missing") {
          frameReviews.pop();
        } else if (mistake === "duplicate") {
          frameReviews[1].timeMs = frameReviews[0].timeMs;
        } else if (mistake === "unknown") {
          frameReviews[0].timeMs = -1;
        } else if (mistake === "overall_pass") {
          frameReviews[0].passed = false;
          frameReviews[0].findings = ["Visible price overlaps the product."];
          findings.push(...frameReviews[0].findings);
        } else if (mistake === "frame_pass") {
          frameReviews[0].findings = ["Visible price overlaps the product."];
          findings.push(...frameReviews[0].findings);
          passed = false;
        } else {
          frameReviews[0].passed = false;
          frameReviews[0].findings = ["Visible price overlaps the product."];
          passed = false;
        }
        return [
          call("review_finished_cut", {
            passed,
            findings,
            summary: "Inspect the explicit frame verdicts without inferring approval from this prose.",
            frameReviews
          })
        ];
      },
      (args) => {
        const response = args.messages
          .filter((message) => message.role === "tool")
          .at(-1)?.content;
        expect(JSON.parse(String(response))).toMatchObject({
          ok: false,
          error: expect.stringContaining("Review not recorded"),
          expectedFrameTimesMs: candidateFrameReviews(args).map((frame) => frame.timeMs)
        });
        return [];
      }
    ]);
    const result = await execute(provider, context, board);
    expect(result.error).toMatch(/no explicit visual review/);
    expect((await Storyboard.findById(board.id))?.timeline_id).toBeFalsy();
  });
  it("fails when visual findings are unresolved and the agent submits the unchanged draft", async () => {
    const { board, context } = await fixture();
    const provider = new FinishingProvider([
      craft,
      done,
      (args) => [
        call("review_finished_cut", {
          passed: false,
          findings: ["CTA absent in the closing frame"],
          frameReviews: candidateFrameReviews(args, ["CTA absent in the closing frame"]),
          summary: "Closing frame needs its CTA"
        })
      ],
      done,
      (args) => [
        call("edit_timeline", {
          ops: [
            {
              op: "set_clip_params",
              target: authorContext(args).scaffold.clips[0].id,
              fontSize: 99
            }
          ]
        }),
        call("submit_finished_cut")
      ],
      done
    ]);
    const result = await execute(provider, context, board);
    expect(result.error).toMatch(/did not revise/);
    expect(result.error).toContain("CTA absent in the closing frame");
    expect(result.error).toContain("fontSize");
    expect(result.error).toContain("lastEditResults");
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
        return craft(args);
      },
      done,
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
      error: expect.stringContaining("Produced Timeline violates production requirements"),
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
        craft,
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
  it("keeps manual markers and refuses marker creation/deletion during finishing", async () => {
    const { board, context } = await fixture();
    const ordinary = createCapabilityRun({ context, gate: UNGATED });
    const first = (await finishStoryboard.impl(ordinary, {
      storyboardId: board.id,
      expectedStoryboardRevision: board.revision
    })) as { timelineId: string };
    const timeline = (await TimelineSequence.findById(first.timelineId))!;
    const document = timeline.toDocument();
    document.markers = [
      {
        id: "manual-marker",
        timeMs: 700,
        label: "Human review",
        color: "#FFFFFF"
      }
    ];
    await TimelineSequence.updateDocumentIfUnchanged(
      timeline.id,
      timeline.updated_at,
      document
    );
    const latest = (await TimelineSequence.findById(timeline.id))!;
    const latestBoard = (await Storyboard.findById(board.id))!;
    const provider = new FinishingProvider([
      () => [
        call("edit_timeline", {
          ops: [
            { op: "delete_marker", target: "manual-marker" },
            { op: "add_marker", label: "Duplicate", timeMs: 800 }
          ]
        }),
        call("submit_finished_cut")
      ],
      (args) => {
        expect(
          args.messages.some(
            (message) =>
              typeof message.content === "string" &&
              message.content.includes("unavailable")
          )
        ).toBe(true);
        return [];
      },
      approve,
      done
    ]);
    const run = createCapabilityRun({
      context,
      gate: UNGATED,
      subAgent: {
        provider,
        model: "review",
        parentTools: () => [],
        forwardMessage: () => undefined
      }
    });
    expect(
      await finishStoryboard.impl(run, {
        storyboardId: board.id,
        expectedStoryboardRevision: latestBoard.revision,
        expectedTimelineRevision: latest.revision,
        strategy: "agentic"
      })
    ).not.toHaveProperty("error");
    expect(
      (await TimelineSequence.findById(timeline.id))?.toDocument().markers
    ).toEqual(document.markers);
  });
  it("runs agentic finishing from a normal JS script capability mount with an explicit model and no subAgent runtime", async () => {
    const { board, context } = await fixture();
    const provider = new FinishingProvider([craft, done, approve, done]);
    const resolve = vi.fn(async (id: string) => {
      expect(id).toBe("fake");
      return provider;
    });
    context.setProviderResolver(resolve);
    context.set(PERMISSION_GATE_CONTEXT_KEY, UNGATED);
    const namespace = sandboxCapabilitySpecifier("storyboards");
    const mounted = await mountJsScriptSandbox(
      `import { finish_storyboard } from "${namespace}"; await finish_storyboard(inputs);`,
      context
    );
    if (!mounted.ok || !mounted.capabilities)
      throw new Error("Script capabilities failed to mount.");
    const result = (await mounted.capabilities.call(
      namespace,
      "finish_storyboard",
      [
        {
          storyboardId: board.id,
          expectedStoryboardRevision: board.revision,
          strategy: "agentic",
          model: { provider: "fake", id: "explicit-vision-model" }
        }
      ]
    )) as { timelineId: string; costUsd: number };
    expect(result).not.toHaveProperty("error");
    expect(resolve).toHaveBeenCalledExactlyOnceWith("fake");
    expect(
      provider.requests.every(
        (request) => request.model === "explicit-vision-model"
      )
    ).toBe(true);
    expect(result.costUsd).toBe(0);
    expect(
      (await TimelineSequence.findById(result.timelineId))?.toDocument().clips
        .length
    ).toBeGreaterThan(0);
  });
  it.each(["import", "native toolbelt"])(
    "prevents a late finishing commit when the normal JS script deadline expires through %s",
    async (surface) => {
      const { board, context } = await fixture();
      let markProviderStarted: () => void = () => undefined;
      const providerStarted = new Promise<void>((resolve) => {
        markProviderStarted = resolve;
      });
      let releaseProvider: () => void = () => undefined;
      const providerRelease = new Promise<void>((resolve) => {
        releaseProvider = resolve;
      });
      let markCapabilityCompleted: () => void = () => undefined;
      const capabilityCompleted = new Promise<void>((resolve) => {
        markCapabilityCompleted = resolve;
      });
      const provider = new FinishingProvider([
        async () => {
          markProviderStarted();
          await providerRelease;
          return [call("submit_finished_cut")];
        },
        done,
        approve,
        done
      ]);
      context.setProviderResolver(async () => provider);
      context.set(PERMISSION_GATE_CONTEXT_KEY, UNGATED);
      const original = finishStoryboard.impl;
      let invocationSignal: AbortSignal | undefined;
      const spy = vi.spyOn(finishStoryboard, "impl").mockImplementation(async (run, params) => {
        invocationSignal = run.signal;
        try {
          return await original(run, params);
        } finally {
          markCapabilityCompleted();
        }
      });
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      try {
        const invocation = runCodeBody(context, {
          code:
            surface === "import"
              ? `import { finish_storyboard } from "${sandboxCapabilitySpecifier("storyboards")}"; return await finish_storyboard(inputs);`
              : "return await nodetool.storyboards.finish(inputs);",
          inputs: {
            storyboardId: board.id,
            expectedStoryboardRevision: board.revision,
            strategy: "agentic",
            model: { provider: "fake", id: "vision" }
          },
          secrets: [],
          timeoutSeconds: 2,
          withToolbelt: true
        });
        await providerStarted;
        expect(provider.requests.length).toBeGreaterThan(0);
        expect(invocationSignal?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(2000);
        const result = await invocation;
        expect(result.ok).toBe(false);
        expect(invocationSignal?.aborted).toBe(true);
        releaseProvider();
        await capabilityCompleted;
        expect((await Storyboard.findById(board.id))?.timeline_id).toBeFalsy();
        expect(context.signal.aborted).toBe(false);
      } finally {
        releaseProvider();
        spy.mockRestore();
        vi.useRealTimers();
      }
    },
    12000
  );
  it("keeps caller state, accounting and temporary-handle identity while revoking the finished script signal", async () => {
    const { board, context } = await fixture();
    context.set(PERMISSION_GATE_CONTEXT_KEY, UNGATED);
    const original = finishStoryboard.impl;
    let invocationSignal: AbortSignal | undefined;
    const spy = vi
      .spyOn(finishStoryboard, "impl")
      .mockImplementation(async (run, params) => {
        expect(run.context).toBe(context);
        invocationSignal = run.signal;
        expect(invocationSignal?.aborted).toBe(false);
        run.context.set("finishing-test-state", "shared");
        run.context.trackOperationCost("finishing-test", 0.25);
        registerTemporaryImageHandle(
          run.context,
          "finished-script-capture.png"
        );
        return original(run, params);
      });
    try {
      const result = await runCodeBody(context, {
        code: `import { finish_storyboard } from "${sandboxCapabilitySpecifier("storyboards")}"; return await finish_storyboard(inputs);`,
        inputs: {
          storyboardId: board.id,
          expectedStoryboardRevision: board.revision
        },
        secrets: [],
        timeoutSeconds: 10,
        withToolbelt: true
      });
      expect(result.ok).toBe(true);
      expect(context.get("finishing-test-state")).toBe("shared");
      expect(context.getTotalCost()).toBe(0.25);
      expect(
        hasTemporaryImageHandle(context, "finished-script-capture.png")
      ).toBe(true);
      expect(invocationSignal?.aborted).toBe(true);
      expect(context.signal.aborted).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
  it("revokes an unawaited finishing call after the script returns successfully", async () => {
    const { board, context } = await fixture();
    const provider = new FinishingProvider([craft, done, approve, done]);
    context.setProviderResolver(async () => provider);
    context.set(PERMISSION_GATE_CONTEXT_KEY, UNGATED);
    const result = await runCodeBody(context, {
      code: `import { finish_storyboard } from "${sandboxCapabilitySpecifier("storyboards")}"; finish_storyboard(inputs); return { finished:true };`,
      inputs: {
        storyboardId: board.id,
        expectedStoryboardRevision: board.revision,
        strategy: "agentic",
        model: { provider: "fake", id: "vision" }
      },
      secrets: [],
      timeoutSeconds: 10,
      withToolbelt: true
    });
    expect(result.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(provider.requests).toHaveLength(0);
    expect((await Storyboard.findById(board.id))?.timeline_id).toBeFalsy();
    expect(context.signal.aborted).toBe(false);
  });
  it("fails closed for an invalid explicit model instead of falling back to the session provider", async () => {
    const { board, context } = await fixture();
    const provider = new FinishingProvider([]);
    const run = createCapabilityRun({
      context,
      gate: UNGATED,
      subAgent: {
        provider,
        model: "fallback",
        parentTools: () => [],
        forwardMessage: () => undefined
      }
    });
    const resolve = vi.spyOn(context, "getProvider");
    for (const model of [
      { provider: "fake", id: " " },
      { id: "explicit" },
      "explicit"
    ]) {
      expect(
        await finishStoryboard.impl(run, {
          storyboardId: board.id,
          expectedStoryboardRevision: board.revision,
          strategy: "agentic",
          model
        })
      ).toHaveProperty("error");
    }
    expect(provider.requests).toHaveLength(0);
    expect(resolve).not.toHaveBeenCalled();
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
