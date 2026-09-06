/**
 * @jest-environment node
 */
import { storyboards } from "@nodetool-ai/protocol/api-schemas";
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import {
  listOpenStoryboardIds,
  setStoryboardAgentHandler,
  type StoryboardAgentHandler,
  type StoryboardShotNode,
  type StoryboardSnapshot
} from "../../../components/storyboard/storyboardAgentBridge";
import { registerStoryboardSaver } from "../../../hooks/storyboard/storyboardSaveRegistry";
import "../builtin/storyboard";

const shotNode = (
  overrides: Partial<StoryboardShotNode> = {}
): StoryboardShotNode => ({
  id: "shot-1",
  index: 0,
  slug: "Opening",
  action: "A lighthouse at dusk",
  status: "planned",
  sceneId: null,
  hasKeyframe: false,
  hasClip: false,
  keyframeVersionCount: 0,
  clipVersionCount: 0,
  staleKeyframe: false,
  staleClip: false,
  ...overrides
});

const snapshot = (): StoryboardSnapshot => ({
  boardId: "board-1",
  title: "My film",
  brief: "A short film",
  style: "noir",
  aspectRatio: "16:9",
  setupStage: "done",
  genre: "",
  scenes: [],
  entityIds: [],
  hasScreenplay: true,
  scriptId: null,
  selectedShotId: null,
  shots: [shotNode()]
});

const createMockHandler = (): jest.Mocked<StoryboardAgentHandler> => ({
  getSnapshot: jest.fn().mockReturnValue(snapshot()),
  setScreenplay: jest.fn(),
  setSetup: jest.fn(),
  direct: jest.fn(),
  setEntityIds: jest.fn(),
  addShot: jest.fn(),
  updateShot: jest.fn(),
  moveShot: jest.fn(),
  duplicateShot: jest.fn(),
  removeShot: jest.fn(),
  updateScene: jest.fn(),
  createScene: jest.fn(),
  mergeScene: jest.fn(),
  setStyle: jest.fn(),
  selectVersion: jest.fn(),
  deleteVersion: jest.fn(),
  addKeyframeVersion: jest.fn(),
  generateKeyframe: jest.fn(),
  generateClip: jest.fn(),
  reviseShot: jest.fn(),
  selectShot: jest.fn(),
  assembleTimeline: jest.fn(),
  extractScript: jest.fn(),
  reprojectShots: jest.fn()
});

// The storyboard tools never touch the workflow state, so a bare stub satisfies ctx.
const ctx = { getState: () => ({}) as FrontendToolState };

const BOARD_ID = "board-1";

afterEach(() => {
  for (const id of listOpenStoryboardIds()) {
    setStoryboardAgentHandler(id, null);
  }
  registerStoryboardSaver(BOARD_ID, null);
});

describe("ui_storyboard_* tools", () => {
  it("registers all storyboard tools in the manifest", () => {
    const names = FrontendToolRegistry.getManifest().map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "ui_storyboard_get_state",
        "ui_storyboard_set_screenplay",
        "ui_storyboard_set_entities",
        "ui_storyboard_add_shot",
        "ui_storyboard_update_shot",
        "ui_storyboard_generate_keyframe",
        "ui_storyboard_generate_clip",
        "ui_storyboard_revise_shot",
        "ui_storyboard_assemble_timeline",
        "ui_storyboard_extract_script",
        "ui_storyboard_relink_script",
        "ui_storyboard_reproject_shots",
        "ui_storyboard_set_duration_source",
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

  it("passes the shot title through add_shot", async () => {
    const handler = createMockHandler();
    handler.addShot.mockReturnValue(shotNode({ slug: "Lighthouse" }));
    setStoryboardAgentHandler(BOARD_ID, handler);

    await FrontendToolRegistry.call(
      "ui_storyboard_add_shot",
      {
        storyboard_id: BOARD_ID,
        action: "wide desert",
        slug: "Lighthouse"
      },
      "tc-slug-add",
      ctx
    );

    expect(handler.addShot).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "Lighthouse" })
    );
  });

  it("passes the shot title and length through update_shot", async () => {
    const handler = createMockHandler();
    handler.updateShot.mockReturnValue(shotNode({ slug: "Lighthouse" }));
    setStoryboardAgentHandler(BOARD_ID, handler);

    await FrontendToolRegistry.call(
      "ui_storyboard_update_shot",
      {
        storyboard_id: BOARD_ID,
        target: "0",
        slug: "Lighthouse",
        durationSeconds: 6
      },
      "tc-slug-update",
      ctx
    );

    expect(handler.updateShot).toHaveBeenCalledWith(
      "0",
      expect.objectContaining({ slug: "Lighthouse", durationSeconds: 6 })
    );
  });

  it("generates a keyframe through the handler", async () => {
    const handler = createMockHandler();
    handler.generateKeyframe.mockResolvedValue({
      shots: [shotNode({ status: "keyframe_generating" })],
      skipped: []
    });
    setStoryboardAgentHandler(BOARD_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_storyboard_generate_keyframe",
      { storyboard_id: BOARD_ID, target: "selected" },
      "tc-4",
      ctx
    )) as { ok: boolean; shot: StoryboardShotNode };

    expect(handler.generateKeyframe).toHaveBeenCalledWith("selected", {
      staleOnly: undefined
    });
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
      skippedShotIds: ["shot-9"],
      skippedLineIds: [],
      reassembled: false
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

  describe("ui_storyboard_set_screenplay", () => {
    it.each(["hasKeyframe", "hasClip"])("refuses to drop a shot with %s when the agent omits its id", async (media) => {
      const handler = createMockHandler();
      handler.getSnapshot.mockReturnValue({
        ...snapshot(),
        shots: [shotNode({ [media]: true })]
      });
      setStoryboardAgentHandler(BOARD_ID, handler);

      await expect(FrontendToolRegistry.call(
        "ui_storyboard_set_screenplay",
        { storyboard_id: BOARD_ID, screenplay: {
          type: "screenplay", title: "Revised", shots: [{ action: "A different prompt" }]
        } },
        "tc-preserve-media",
        ctx
      )).rejects.toThrow("ui_storyboard_update_shot");
      expect(handler.setScreenplay).not.toHaveBeenCalled();
    });

    // The shape an agent actually sent, which the store copied verbatim and the
    // save then rejected: no `type`, no `id`, no `index`, no `status`.
    const agentScreenplay = {
      type: "screenplay",
      title: "Lighthouse Dawn",
      brief: "A keeper's last night",
      style: "noir, high contrast",
      shots: [
        {
          slug: "Lighthouse at dusk",
          action: "A lighthouse against a darkening sky",
          camera: { framing: "wide" },
          motion: "slow push in",
          durationSeconds: 4
        },
        {
          slug: "The light dies",
          action: "The beam flickers out as dawn breaks",
          motion: "static",
          durationSeconds: 6
        }
      ]
    };

    it("normalizes an agent screenplay into a savable one", async () => {
      const handler = createMockHandler();
      handler.setScreenplay.mockReturnValue(snapshot());
      setStoryboardAgentHandler(BOARD_ID, handler);

      await FrontendToolRegistry.call(
        "ui_storyboard_set_screenplay",
        { storyboard_id: BOARD_ID, screenplay: agentScreenplay },
        "tc-sp-1",
        ctx
      );

      const play = handler.setScreenplay.mock.calls[0][0];
      // The exact schema the storyboards.update save validates against.
      expect(() => storyboards.storyboardScreenplay.parse(play)).not.toThrow();
      expect(play.id).toEqual(expect.any(String));
      expect(play.shots).toHaveLength(2);
      play.shots.forEach((shot, index) => {
        expect(shot.type).toBe("shot");
        expect(shot.id).toEqual(expect.any(String));
        expect(shot.index).toBe(index);
        expect(shot.status).toBe("planned");
      });
    });

    it("carries durationSeconds, brief and style through as wire fields", async () => {
      const handler = createMockHandler();
      handler.setScreenplay.mockReturnValue(snapshot());
      setStoryboardAgentHandler(BOARD_ID, handler);

      await FrontendToolRegistry.call(
        "ui_storyboard_set_screenplay",
        { storyboard_id: BOARD_ID, screenplay: agentScreenplay },
        "tc-sp-2",
        ctx
      );

      const play = handler.setScreenplay.mock.calls[0][0];
      expect(play.shots[0].duration_seconds).toBe(4);
      expect(play.shots[1].duration_seconds).toBe(6);
      expect(play.brief).toBe("A keeper's last night");
      expect(play.style_bible).toBe("noir, high contrast");
    });

    it("carries the screenplay's entityIds through as `entity_ids`", async () => {
      const handler = createMockHandler();
      handler.setScreenplay.mockReturnValue(snapshot());
      setStoryboardAgentHandler(BOARD_ID, handler);

      await FrontendToolRegistry.call(
        "ui_storyboard_set_screenplay",
        {
          storyboard_id: BOARD_ID,
          screenplay: {
            ...agentScreenplay,
            entityIds: ["ent-buddy", "ent-winston"],
            shots: [
              { ...agentScreenplay.shots[0], entityIds: ["ent-buddy"] },
              agentScreenplay.shots[1]
            ]
          }
        },
        "tc-sp-entities",
        ctx
      );

      const play = handler.setScreenplay.mock.calls[0][0];
      expect(play.entity_ids).toEqual(["ent-buddy", "ent-winston"]);
      expect(play.shots[0].entity_ids).toEqual(["ent-buddy"]);
      expect(play.shots[1].entity_ids).toBeUndefined();
    });

    it("rejects a shot with no action, naming its position", async () => {
      const handler = createMockHandler();
      setStoryboardAgentHandler(BOARD_ID, handler);

      await expect(
        FrontendToolRegistry.call(
          "ui_storyboard_set_screenplay",
          {
            storyboard_id: BOARD_ID,
            screenplay: {
              type: "screenplay",
              title: "Broken",
              shots: [{ slug: "Opening", camera: { framing: "wide" } }]
            }
          },
          "tc-sp-3",
          ctx
        )
      ).rejects.toThrow(/shots.*0.*action/s);
      expect(handler.setScreenplay).not.toHaveBeenCalled();
    });

    it("reports the revision the save wrote", async () => {
      const handler = createMockHandler();
      handler.setScreenplay.mockReturnValue(snapshot());
      setStoryboardAgentHandler(BOARD_ID, handler);
      registerStoryboardSaver(BOARD_ID, async () => ({
        ok: true,
        updatedAt: "2026-08-13T00:00:00.000Z"
      }));

      const result = (await FrontendToolRegistry.call(
        "ui_storyboard_set_screenplay",
        { storyboard_id: BOARD_ID, screenplay: agentScreenplay },
        "tc-sp-4",
        ctx
      )) as { saved: boolean | null; updatedAt?: string };

      expect(result.saved).toBe(true);
      expect(result.updatedAt).toBe("2026-08-13T00:00:00.000Z");
    });

    it("reports saved: null when the host runs no server sync", async () => {
      const handler = createMockHandler();
      handler.setScreenplay.mockReturnValue(snapshot());
      setStoryboardAgentHandler(BOARD_ID, handler);

      const result = (await FrontendToolRegistry.call(
        "ui_storyboard_set_screenplay",
        { storyboard_id: BOARD_ID, screenplay: agentScreenplay },
        "tc-sp-5",
        ctx
      )) as { saved: boolean | null };

      expect(result.saved).toBeNull();
    });

    it("fails the call when the write cannot persist", async () => {
      const handler = createMockHandler();
      handler.setScreenplay.mockReturnValue(snapshot());
      setStoryboardAgentHandler(BOARD_ID, handler);
      registerStoryboardSaver(BOARD_ID, async () => ({
        ok: false,
        error: "409 revision conflict"
      }));

      await expect(
        FrontendToolRegistry.call(
          "ui_storyboard_set_screenplay",
          { storyboard_id: BOARD_ID, screenplay: agentScreenplay },
          "tc-sp-6",
          ctx
        )
      ).rejects.toThrow("409 revision conflict");
    });

    it("names the required screenplay keys in its parameter schema", () => {
      const tool = FrontendToolRegistry.getManifest().find(
        (t) => t.name === "ui_storyboard_set_screenplay"
      );
      const schema = tool?.parameters as {
        properties?: {
          screenplay?: {
            properties?: Record<string, unknown>;
            required?: string[];
          };
        };
      };
      const screenplay = schema.properties?.screenplay;
      expect(screenplay?.properties).toHaveProperty("type");
      expect(screenplay?.properties).toHaveProperty("shots");
      expect(screenplay?.required).toEqual(
        expect.arrayContaining(["type", "shots"])
      );
    });
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

  describe("ui_storyboard_set_entities", () => {
    it("casts the entities through the handler and reports them back", async () => {
      const handler = createMockHandler();
      handler.setEntityIds.mockReturnValue({
        ...snapshot(),
        entityIds: ["ent-buddy", "ent-coco"]
      });
      setStoryboardAgentHandler(BOARD_ID, handler);

      const result = (await FrontendToolRegistry.call(
        "ui_storyboard_set_entities",
        { storyboard_id: BOARD_ID, entity_ids: ["ent-buddy", "ent-coco"] },
        "tc-ent-1",
        ctx
      )) as { ok: boolean } & StoryboardSnapshot;

      expect(handler.setEntityIds).toHaveBeenCalledWith([
        "ent-buddy",
        "ent-coco"
      ]);
      expect(result.ok).toBe(true);
      expect(result.entityIds).toEqual(["ent-buddy", "ent-coco"]);
    });

    it("clears the cast with an empty array", async () => {
      const handler = createMockHandler();
      handler.setEntityIds.mockReturnValue(snapshot());
      setStoryboardAgentHandler(BOARD_ID, handler);

      await FrontendToolRegistry.call(
        "ui_storyboard_set_entities",
        { storyboard_id: BOARD_ID, entity_ids: [] },
        "tc-ent-2",
        ctx
      );

      expect(handler.setEntityIds).toHaveBeenCalledWith([]);
    });

    it("fails the call when the cast does not persist", async () => {
      const handler = createMockHandler();
      handler.setEntityIds.mockReturnValue(snapshot());
      setStoryboardAgentHandler(BOARD_ID, handler);
      registerStoryboardSaver(BOARD_ID, async () => ({
        ok: false,
        error: "offline"
      }));

      await expect(
        FrontendToolRegistry.call(
          "ui_storyboard_set_entities",
          { storyboard_id: BOARD_ID, entity_ids: ["ent-buddy"] },
          "tc-ent-3",
          ctx
        )
      ).rejects.toThrow(/entity cast.*did not persist: offline/i);
    });
  });

  describe("script link tools", () => {
    it("extracts a script through the handler and reports the link", async () => {
      const handler = createMockHandler();
      handler.extractScript.mockResolvedValue({
        scriptId: "script-9",
        lineCount: 4,
        linkedShotCount: 3,
        created: true
      });
      setStoryboardAgentHandler(BOARD_ID, handler);

      const result = (await FrontendToolRegistry.call(
        "ui_storyboard_extract_script",
        { storyboard_id: BOARD_ID },
        "tc-extract",
        ctx
      )) as { ok: boolean; scriptId: string; created: boolean; url: string };

      expect(handler.extractScript).toHaveBeenCalledWith();
      expect(result.ok).toBe(true);
      expect(result.scriptId).toBe("script-9");
      expect(result.created).toBe(true);
      expect(result.url).toContain("script-9");
    });

    it("fails the extraction when the write cannot persist", async () => {
      const handler = createMockHandler();
      handler.extractScript.mockResolvedValue({
        scriptId: "script-9",
        lineCount: 1,
        linkedShotCount: 1,
        created: true
      });
      setStoryboardAgentHandler(BOARD_ID, handler);
      registerStoryboardSaver(BOARD_ID, async () => ({
        ok: false,
        error: "409 revision conflict"
      }));

      await expect(
        FrontendToolRegistry.call(
          "ui_storyboard_extract_script",
          { storyboard_id: BOARD_ID },
          "tc-extract-2",
          ctx
        )
      ).rejects.toThrow("409 revision conflict");
    });

    it("re-projects onto the linked script with relink", async () => {
      const handler = createMockHandler();
      handler.getSnapshot.mockReturnValue({ ...snapshot(), scriptId: "script-9" });
      handler.extractScript.mockResolvedValue({
        scriptId: "script-9",
        lineCount: 4,
        linkedShotCount: 3,
        created: false
      });
      setStoryboardAgentHandler(BOARD_ID, handler);

      const result = (await FrontendToolRegistry.call(
        "ui_storyboard_relink_script",
        { storyboard_id: BOARD_ID },
        "tc-relink",
        ctx
      )) as { ok: boolean; created: boolean };

      expect(handler.extractScript).toHaveBeenCalledWith({ relink: true });
      expect(result.created).toBe(false);
    });

    it("sets the duration source on every named shot", async () => {
      const handler = createMockHandler();
      handler.updateShot.mockImplementation((target) =>
        shotNode({ id: target, durationSource: "audio" })
      );
      setStoryboardAgentHandler(BOARD_ID, handler);

      const result = (await FrontendToolRegistry.call(
        "ui_storyboard_set_duration_source",
        { storyboard_id: BOARD_ID, targets: ["shot-1", "1"], source: "audio" },
        "tc-dur",
        ctx
      )) as { ok: boolean; shots: StoryboardShotNode[] };

      expect(handler.updateShot.mock.calls).toEqual([
        ["shot-1", { durationSource: "audio" }],
        ["1", { durationSource: "audio" }]
      ]);
      expect(result.shots).toHaveLength(2);
    });

    it("takes a single shot without a list, and pins it to manual", async () => {
      const handler = createMockHandler();
      handler.updateShot.mockReturnValue(
        shotNode({ durationSource: "manual" })
      );
      setStoryboardAgentHandler(BOARD_ID, handler);

      await FrontendToolRegistry.call(
        "ui_storyboard_set_duration_source",
        { storyboard_id: BOARD_ID, targets: "selected", source: "manual" },
        "tc-dur-2",
        ctx
      );

      expect(handler.updateShot).toHaveBeenCalledWith("selected", {
        durationSource: "manual"
      });
    });

    it("refuses to relink a board that links no script", async () => {
      const handler = createMockHandler();
      handler.getSnapshot.mockReturnValue(snapshot());
      setStoryboardAgentHandler(BOARD_ID, handler);

      await expect(
        FrontendToolRegistry.call(
          "ui_storyboard_relink_script",
          { storyboard_id: BOARD_ID },
          "tc-relink-2",
          ctx
        )
      ).rejects.toThrow(/links no script/i);
      expect(handler.extractScript).not.toHaveBeenCalled();
    });

    it("re-projects every drifted shot when no target is named", async () => {
      const handler = createMockHandler();
      handler.reprojectShots.mockResolvedValue({
        scriptId: "script-9",
        reprojectedShotIds: ["shot-1"],
        driftedShotIds: ["shot-1"]
      });
      setStoryboardAgentHandler(BOARD_ID, handler);

      const result = (await FrontendToolRegistry.call(
        "ui_storyboard_reproject_shots",
        { storyboard_id: BOARD_ID },
        "tc-reproject",
        ctx
      )) as { ok: boolean; reprojectedShotIds: string[] };

      expect(handler.reprojectShots).toHaveBeenCalledWith(undefined);
      expect(result.reprojectedShotIds).toEqual(["shot-1"]);
    });

    it("re-projects only the named shots", async () => {
      const handler = createMockHandler();
      handler.reprojectShots.mockResolvedValue({
        scriptId: "script-9",
        reprojectedShotIds: ["shot-1"],
        driftedShotIds: ["shot-1", "shot-2"]
      });
      setStoryboardAgentHandler(BOARD_ID, handler);

      await FrontendToolRegistry.call(
        "ui_storyboard_reproject_shots",
        { storyboard_id: BOARD_ID, targets: ["shot-1"] },
        "tc-reproject-2",
        ctx
      );

      expect(handler.reprojectShots).toHaveBeenCalledWith(["shot-1"]);
    });

    it("fails the re-projection when the board save does not persist", async () => {
      const handler = createMockHandler();
      handler.reprojectShots.mockResolvedValue({
        scriptId: "script-9",
        reprojectedShotIds: ["shot-1"],
        driftedShotIds: ["shot-1"]
      });
      setStoryboardAgentHandler(BOARD_ID, handler);
      registerStoryboardSaver(BOARD_ID, async () => ({
        ok: false,
        error: "409 revision conflict"
      }));

      await expect(
        FrontendToolRegistry.call(
          "ui_storyboard_reproject_shots",
          { storyboard_id: BOARD_ID },
          "tc-reproject-3",
          ctx
        )
      ).rejects.toThrow("409 revision conflict");
    });
  });
});
