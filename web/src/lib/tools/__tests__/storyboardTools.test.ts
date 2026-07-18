/**
 * @jest-environment node
 */
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import {
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
  approveShot: jest.fn(),
  generateClip: jest.fn(),
  selectShot: jest.fn()
});

// The storyboard tools never touch the workflow state, so a bare stub satisfies ctx.
const ctx = { getState: () => ({}) as FrontendToolState };

afterEach(() => {
  setStoryboardAgentHandler(null);
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
        "ui_storyboard_approve_shot",
        "ui_storyboard_generate_clip",
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
    expect(schema.required).toContain("action");
  });

  it("rejects with a descriptive error when no storyboard is open", async () => {
    await expect(
      FrontendToolRegistry.call("ui_storyboard_get_state", {}, "tc-1", ctx)
    ).rejects.toThrow("No storyboard is open.");
  });

  it("returns the storyboard snapshot through the handler", async () => {
    const handler = createMockHandler();
    handler.getSnapshot.mockReturnValue(snapshot());
    setStoryboardAgentHandler(handler);

    const result = (await FrontendToolRegistry.call(
      "ui_storyboard_get_state",
      {},
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
    setStoryboardAgentHandler(handler);

    const result = (await FrontendToolRegistry.call(
      "ui_storyboard_add_shot",
      { action: "wide desert", camera: { framing: "wide" } },
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
    setStoryboardAgentHandler(handler);

    const result = (await FrontendToolRegistry.call(
      "ui_storyboard_generate_keyframe",
      { target: "selected" },
      "tc-4",
      ctx
    )) as { ok: boolean; shot: StoryboardShotNode };

    expect(handler.generateKeyframe).toHaveBeenCalledWith("selected");
    expect(result.shot.status).toBe("keyframe_generating");
  });

  it("rejects an invalid shot status during validation", async () => {
    setStoryboardAgentHandler(createMockHandler());
    await expect(
      FrontendToolRegistry.call(
        "ui_storyboard_update_shot",
        { target: "0", status: "not-a-status" },
        "tc-5",
        ctx
      )
    ).rejects.toThrow();
  });

  it("selects a shot (and clears with null) through the handler", async () => {
    const handler = createMockHandler();
    handler.selectShot.mockReturnValue(null);
    setStoryboardAgentHandler(handler);

    await FrontendToolRegistry.call(
      "ui_storyboard_select_shot",
      { target: null },
      "tc-6",
      ctx
    );

    expect(handler.selectShot).toHaveBeenCalledWith(null);
  });
});
