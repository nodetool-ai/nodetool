/**
 * @jest-environment node
 */
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import {
  listOpenStoryboardIds,
  setStoryboardAgentHandler,
  type StoryboardAgentHandler,
  type StoryboardShotNode,
  type StoryboardSnapshot
} from "../../../components/storyboard/storyboardAgentBridge";
import "../builtin/storyboard";

const shotNode = (
  overrides: Partial<StoryboardShotNode> = {}
): StoryboardShotNode => ({
  id: "shot-1",
  index: 0,
  slug: "Opening",
  action: "A lighthouse at dusk",
  status: "planned",
  hasKeyframe: false,
  hasClip: false,
  ...overrides
});

const snapshot = (): StoryboardSnapshot => ({
  boardId: "board-1",
  title: "My film",
  brief: "A short film",
  style: "noir",
  aspectRatio: "16:9",
  hasScreenplay: true,
  selectedShotId: null,
  shots: [shotNode()]
});

const createMockHandler = (): jest.Mocked<StoryboardAgentHandler> => ({
  getSnapshot: jest.fn(),
  setScreenplay: jest.fn(),
  addShot: jest.fn(),
  updateShot: jest.fn(),
  generateKeyframe: jest.fn(),
  generateClip: jest.fn(),
  reviseShot: jest.fn(),
  selectShot: jest.fn(),
  assembleTimeline: jest.fn()
});

// The storyboard tools never touch the workflow state, so a bare stub satisfies ctx.
const ctx = { getState: () => ({}) as FrontendToolState };

const BOARD_ID = "board-1";

afterEach(() => {
  for (const id of listOpenStoryboardIds()) {
    setStoryboardAgentHandler(id, null);
  }
});

describe("ui_storyboard_* tools", () => {
  it("registers all storyboard tools in the manifest", () => {
    const names = FrontendToolRegistry.getManifest().map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "ui_storyboard_get_state",
        "ui_storyboard_set_screenplay",
        "ui_storyboard_add_shot",
        "ui_storyboard_update_shot",
        "ui_storyboard_generate_keyframe",
        "ui_storyboard_generate_clip",
        "ui_storyboard_revise_shot",
        "ui_storyboard_assemble_timeline",
        "ui_storyboard_select_shot"
      ])
    );
  });

  it("exposes add_shot's parameter schema with action required", () => {
    const tool = FrontendToolRegistry.getManifest().find(
      (t) => t.name === "ui_storyboard_add_shot"
    );
    expect(tool).toBeDefined();
    const schema = tool?.parameters as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.type).toBe("object");
    expect(schema.properties).toHaveProperty("action");
    expect(schema.properties).toHaveProperty("storyboard_id");
    expect(schema.required).toContain("action");
    expect(schema.required).toContain("storyboard_id");
  });

  it("rejects with a descriptive error when the storyboard is not open", async () => {
    await expect(
      FrontendToolRegistry.call(
        "ui_storyboard_get_state",
        { storyboard_id: "missing" },
        "tc-1",
        ctx
      )
    ).rejects.toThrow(
      'No storyboard "missing" is open. No storyboards are currently open.'
    );
  });

  it("returns the storyboard snapshot through the handler", async () => {
    const handler = createMockHandler();
    handler.getSnapshot.mockReturnValue(snapshot());
    setStoryboardAgentHandler(BOARD_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_storyboard_get_state",
      { storyboard_id: BOARD_ID },
      "tc-2",
      ctx
    )) as { ok: boolean } & StoryboardSnapshot;

    expect(handler.getSnapshot).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.shots).toHaveLength(1);
    expect(result.shots[0].action).toBe("A lighthouse at dusk");
  });

  it("adds a shot via the handler", async () => {
    const handler = createMockHandler();
    handler.addShot.mockReturnValue(shotNode({ action: "wide desert" }));
    setStoryboardAgentHandler(BOARD_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_storyboard_add_shot",
      {
        storyboard_id: BOARD_ID,
        action: "wide desert",
        camera: { framing: "wide" }
      },
      "tc-3",
      ctx
    )) as { ok: boolean; shot: StoryboardShotNode };

    expect(handler.addShot).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "wide desert",
        camera: { framing: "wide" }
      })
    );
    expect(result.ok).toBe(true);
    expect(result.shot.action).toBe("wide desert");
  });

  it("generates a keyframe through the handler", async () => {
    const handler = createMockHandler();
    handler.generateKeyframe.mockResolvedValue(
      shotNode({ status: "keyframe_generating" })
    );
    setStoryboardAgentHandler(BOARD_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_storyboard_generate_keyframe",
      { storyboard_id: BOARD_ID, target: "selected" },
      "tc-4",
      ctx
    )) as { ok: boolean; shot: StoryboardShotNode };

    expect(handler.generateKeyframe).toHaveBeenCalledWith("selected");
    expect(result.shot.status).toBe("keyframe_generating");
  });

  it("revises a shot through the handler with (target, instruction)", async () => {
    const handler = createMockHandler();
    handler.reviseShot.mockResolvedValue(
      shotNode({ status: "clip_generating", hasClip: true })
    );
    setStoryboardAgentHandler(BOARD_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_storyboard_revise_shot",
      {
        storyboard_id: BOARD_ID,
        target: "0",
        instruction: "make it darker, add rain"
      },
      "tc-revise",
      ctx
    )) as { ok: boolean; shot: StoryboardShotNode };

    expect(handler.reviseShot).toHaveBeenCalledWith(
      "0",
      "make it darker, add rain"
    );
    expect(result.ok).toBe(true);
    expect(result.shot.status).toBe("clip_generating");
  });

  it("assembles the board into a timeline through the handler", async () => {
    const handler = createMockHandler();
    handler.assembleTimeline.mockResolvedValue({
      sequenceId: "seq-1",
      clipCount: 3,
      skippedShotIds: ["shot-9"]
    });
    setStoryboardAgentHandler(BOARD_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_storyboard_assemble_timeline",
      { storyboard_id: BOARD_ID },
      "tc-assemble",
      ctx
    )) as {
      ok: boolean;
      sequenceId: string;
      clipCount: number;
      skippedShotIds: string[];
    };

    expect(handler.assembleTimeline).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.sequenceId).toBe("seq-1");
    expect(result.clipCount).toBe(3);
    expect(result.skippedShotIds).toEqual(["shot-9"]);
  });

  it("rejects an invalid shot status during validation", async () => {
    setStoryboardAgentHandler(BOARD_ID, createMockHandler());
    await expect(
      FrontendToolRegistry.call(
        "ui_storyboard_update_shot",
        { storyboard_id: BOARD_ID, target: "0", status: "not-a-status" },
        "tc-5",
        ctx
      )
    ).rejects.toThrow();
  });

  it("selects a shot (and clears with null) through the handler", async () => {
    const handler = createMockHandler();
    handler.selectShot.mockReturnValue(null);
    setStoryboardAgentHandler(BOARD_ID, handler);

    await FrontendToolRegistry.call(
      "ui_storyboard_select_shot",
      { storyboard_id: BOARD_ID, target: null },
      "tc-6",
      ctx
    );

    expect(handler.selectShot).toHaveBeenCalledWith(null);
  });
});
