/**
 * @jest-environment node
 *
 * PRD § 8.7 criterion 7: every criterion also passes through the § 8.6 tools.
 * These are the browser half — the headless half is
 * `packages/agents/tests/timeline-video-flow.test.ts`.
 */
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import {
  setTimelineAgentHandler,
  listOpenTimelineSequenceIds,
  type TimelineAgentHandler
} from "../../../components/timeline/timelineAgentBridge";
import "../builtin/timeline";

const SEQ_ID = "seq-1";
const ctx = { getState: () => ({}) as FrontendToolState };

const handler = () => {
  const setup = {
    stage: "review" as const,
    brief: "a paper boat",
    format: "ad-15",
    beats: [{ id: "b1", prompt: "the kerb", duration_ms: 3000 }]
  };
  return {
    setSetup: jest.fn(() => setup),
    planBeats: jest.fn(async () => setup.beats),
    updateBeat: jest.fn(() => setup.beats[0]),
    removeBeat: jest.fn(() => setup.beats[0]),
    generateFromBeats: jest.fn(async () => ({
      videoClipIds: ["c1"],
      voiceoverClipIds: [],
      musicClipId: null,
      startedClipIds: ["c1"]
    }))
  };
};

const register = (partial: Partial<TimelineAgentHandler>) =>
  setTimelineAgentHandler(SEQ_ID, partial as TimelineAgentHandler);

let callSeq = 0;
const call = (name: string, args: Record<string, unknown>) =>
  FrontendToolRegistry.call(
    name,
    { timeline_id: SEQ_ID, ...args },
    `tc-${++callSeq}`,
    ctx
  );

afterEach(() => {
  for (const id of listOpenTimelineSequenceIds()) {
    setTimelineAgentHandler(id, null);
  }
});

describe("guided video flow tools", () => {
  it("registers all four", () => {
    const names = FrontendToolRegistry.getManifest().map((t) => t.name);
    for (const name of [
      "ui_timeline_set_setup",
      "ui_timeline_plan_beats",
      "ui_timeline_update_beat",
      "ui_timeline_generate_from_beats"
    ]) {
      expect(names).toContain(name);
    }
  });

  it("writes the brief, format and stage", async () => {
    const stub = handler();
    register(stub);
    const result = await call("ui_timeline_set_setup", {
      stage: "format",
      brief: "a paper boat",
      format: "ad-15"
    });
    expect(stub.setSetup).toHaveBeenCalledWith({
      stage: "format",
      brief: "a paper boat",
      format: "ad-15"
    });
    expect(result).toMatchObject({ ok: true });
  });

  it("reports that planning created no clip and started no job (criterion 3)", async () => {
    const stub = handler();
    register(stub);
    const result = (await call("ui_timeline_plan_beats", {})) as {
      clipsCreated: number;
      jobsStarted: number;
      beats: unknown[];
    };
    expect(result.clipsCreated).toBe(0);
    expect(result.jobsStarted).toBe(0);
    expect(result.beats).toHaveLength(1);
    expect(stub.generateFromBeats).not.toHaveBeenCalled();
  });

  it("takes a written plan and passes it through", async () => {
    const stub = handler();
    register(stub);
    await call("ui_timeline_plan_beats", {
      beats: [{ prompt: "the kerb", durationMs: 3000 }]
    });
    expect(stub.planBeats).toHaveBeenCalledWith({
      beats: [{ prompt: "the kerb", durationMs: 3000 }]
    });
  });

  it("edits one beat by id or position", async () => {
    const stub = handler();
    register(stub);
    await call("ui_timeline_update_beat", { beat: "1", durationMs: 2000 });
    expect(stub.updateBeat).toHaveBeenCalledWith("1", { durationMs: 2000 });
  });

  it("clears a transition with an explicit null", async () => {
    const stub = handler();
    register(stub);
    await call("ui_timeline_update_beat", { beat: "b1", transition: null });
    expect(stub.updateBeat).toHaveBeenCalledWith("b1", { transition: null });
  });

  // F20: the review tells a creator to drop a beat, so there is an op that
  // does it — and headless parity (PRD § 6.5) says a tool reaches it too.
  it("removes one beat by id or position and names what went", async () => {
    const stub = handler();
    register(stub);
    const result = await call("ui_timeline_remove_beat", { beat: "1" });
    expect(stub.removeBeat).toHaveBeenCalledWith("1");
    expect(result).toMatchObject({ ok: true, removed: { id: "b1" } });
  });

  // F17: silence the creator chose and a line they have not written are
  // different states, so the tool can say the first one.
  it("writes a deliberate no-voiceover onto the setup", async () => {
    const stub = handler();
    register(stub);
    await call("ui_timeline_set_setup", { voiceover: false });
    expect(stub.setSetup).toHaveBeenCalledWith({ voiceover: false });
  });

  it("generates from the plan and reports what it made", async () => {
    const stub = handler();
    register(stub);
    const result = await call("ui_timeline_generate_from_beats", {
      model: "nodetool/kling-turbo",
      voice: "alloy"
    });
    expect(stub.generateFromBeats).toHaveBeenCalledWith({
      model: "nodetool/kling-turbo",
      voice: "alloy"
    });
    expect(result).toMatchObject({
      ok: true,
      videoClipIds: ["c1"],
      startedClipIds: ["c1"]
    });
  });

  it("says which sequences are open when none matches", async () => {
    await expect(
      FrontendToolRegistry.call(
        "ui_timeline_set_setup",
        { timeline_id: "nope", stage: "idea" },
        "tc-missing",
        ctx
      )
    ).rejects.toThrow('No timeline sequence "nope" is open');
  });
});
