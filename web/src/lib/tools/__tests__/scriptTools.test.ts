/**
 * @jest-environment node
 */
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import {
  listOpenScriptIds,
  setScriptAgentHandler,
  type ScriptAgentHandler,
  type ScriptLineNode,
  type ScriptSnapshot,
  type ScriptSpeakerNode
} from "../../../components/script/scriptAgentBridge";
import "../builtin/script";

const lineNode = (overrides: Partial<ScriptLineNode> = {}): ScriptLineNode => ({
  id: "line-1",
  index: 0,
  sectionId: "sec-1",
  speakerId: null,
  speakerName: null,
  text: "Hello there.",
  status: "draft",
  takeCount: 0,
  currentTakeDurationMs: null,
  ...overrides
});

const speakerNode = (
  overrides: Partial<ScriptSpeakerNode> = {}
): ScriptSpeakerNode => ({
  id: "spk-1",
  name: "Narrator",
  voice: null,
  ...overrides
});

const snapshot = (): ScriptSnapshot => ({
  scriptId: "script-1",
  title: "My script",
  cast: [speakerNode()],
  lines: [lineNode()],
  hasTimeline: false,
  timelineId: null
});

const createMockHandler = (): jest.Mocked<ScriptAgentHandler> => ({
  getSnapshot: jest.fn(),
  addSpeaker: jest.fn(),
  setSpeakerVoice: jest.fn(),
  addLine: jest.fn(),
  setLineText: jest.fn(),
  setLineSpeaker: jest.fn(),
  voiceLine: jest.fn(),
  voiceAll: jest.fn(),
  sendToTimeline: jest.fn(),
  exportSubtitles: jest.fn()
});

// The script tools never touch the workflow state, so a bare stub satisfies ctx.
const ctx = { getState: () => ({}) as FrontendToolState };

const SCRIPT_ID = "script-1";

afterEach(() => {
  for (const id of listOpenScriptIds()) {
    setScriptAgentHandler(id, null);
  }
});

describe("ui_script_* tools", () => {
  it("registers all script tools in the manifest", () => {
    const names = FrontendToolRegistry.getManifest().map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "ui_script_get_state",
        "ui_script_add_speaker",
        "ui_script_set_speaker_voice",
        "ui_script_add_line",
        "ui_script_set_line_text",
        "ui_script_set_speaker",
        "ui_script_voice_line",
        "ui_script_voice_all",
        "ui_script_send_to_timeline",
        "ui_script_export_subtitles"
      ])
    );
  });

  it("exposes add_line's parameter schema with text required", () => {
    const tool = FrontendToolRegistry.getManifest().find(
      (t) => t.name === "ui_script_add_line"
    );
    expect(tool).toBeDefined();
    const schema = tool?.parameters as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.type).toBe("object");
    expect(schema.properties).toHaveProperty("text");
    expect(schema.properties).toHaveProperty("script_id");
    expect(schema.required).toContain("text");
    expect(schema.required).toContain("script_id");
  });

  it("rejects with a descriptive error when the script is not open", async () => {
    await expect(
      FrontendToolRegistry.call(
        "ui_script_get_state",
        { script_id: "missing" },
        "tc-1",
        ctx
      )
    ).rejects.toThrow(
      'No script "missing" is open. No scripts are currently open.'
    );
  });

  it("returns the script snapshot through the handler", async () => {
    const handler = createMockHandler();
    handler.getSnapshot.mockReturnValue(snapshot());
    setScriptAgentHandler(SCRIPT_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_script_get_state",
      { script_id: SCRIPT_ID },
      "tc-2",
      ctx
    )) as { ok: boolean } & ScriptSnapshot;

    expect(handler.getSnapshot).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].text).toBe("Hello there.");
  });

  it("adds a line via the handler", async () => {
    const handler = createMockHandler();
    handler.addLine.mockReturnValue(lineNode({ text: "A new line." }));
    setScriptAgentHandler(SCRIPT_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_script_add_line",
      { script_id: SCRIPT_ID, text: "A new line.", speakerId: "spk-1" },
      "tc-3",
      ctx
    )) as { ok: boolean; line: ScriptLineNode };

    expect(handler.addLine).toHaveBeenCalledWith(
      expect.objectContaining({ text: "A new line.", speakerId: "spk-1" })
    );
    expect(result.ok).toBe(true);
    expect(result.line.text).toBe("A new line.");
  });

  it("adds a speaker with a voice through the handler", async () => {
    const handler = createMockHandler();
    handler.addSpeaker.mockReturnValue(
      speakerNode({
        name: "Host",
        voice: { provider: "elevenlabs", model: "eleven_v3", voice: "rachel" }
      })
    );
    setScriptAgentHandler(SCRIPT_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_script_add_speaker",
      {
        script_id: SCRIPT_ID,
        name: "Host",
        voice: { provider: "elevenlabs", model: "eleven_v3", voice: "rachel" }
      },
      "tc-spk",
      ctx
    )) as { ok: boolean; speaker: ScriptSpeakerNode };

    expect(handler.addSpeaker).toHaveBeenCalledWith("Host", {
      provider: "elevenlabs",
      model: "eleven_v3",
      voice: "rachel"
    });
    expect(result.speaker.name).toBe("Host");
  });

  it("voices a single line through the handler", async () => {
    const handler = createMockHandler();
    handler.voiceLine.mockResolvedValue(
      lineNode({ status: "voiced", takeCount: 1, currentTakeDurationMs: 1200 })
    );
    setScriptAgentHandler(SCRIPT_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_script_voice_line",
      { script_id: SCRIPT_ID, target: "0" },
      "tc-4",
      ctx
    )) as { ok: boolean; line: ScriptLineNode };

    expect(handler.voiceLine).toHaveBeenCalledWith("0");
    expect(result.line.status).toBe("voiced");
  });

  it("voices all lines through the handler", async () => {
    const handler = createMockHandler();
    handler.voiceAll.mockResolvedValue({ voiced: 4 });
    setScriptAgentHandler(SCRIPT_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_script_voice_all",
      { script_id: SCRIPT_ID },
      "tc-all",
      ctx
    )) as { ok: boolean; voiced: number };

    expect(handler.voiceAll).toHaveBeenCalled();
    expect(result.voiced).toBe(4);
  });

  it("sends the script to a timeline through the handler", async () => {
    const handler = createMockHandler();
    handler.sendToTimeline.mockResolvedValue({
      sequenceId: "seq-1",
      clipCount: 3,
      skippedLineIds: ["line-9"],
      reassembled: false
    });
    setScriptAgentHandler(SCRIPT_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_script_send_to_timeline",
      { script_id: SCRIPT_ID },
      "tc-send",
      ctx
    )) as {
      ok: boolean;
      sequenceId: string;
      clipCount: number;
      skippedLineIds: string[];
      reassembled: boolean;
    };

    expect(handler.sendToTimeline).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.sequenceId).toBe("seq-1");
    expect(result.clipCount).toBe(3);
    expect(result.skippedLineIds).toEqual(["line-9"]);
  });

  it("exports subtitles through the handler", async () => {
    const handler = createMockHandler();
    handler.exportSubtitles.mockReturnValue({
      text: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHi.\n",
      format: "vtt",
      cueCount: 1
    });
    setScriptAgentHandler(SCRIPT_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_script_export_subtitles",
      { script_id: SCRIPT_ID, format: "vtt", granularity: "word" },
      "tc-subs",
      ctx
    )) as { ok: boolean; text: string; format: string; cueCount: number };

    expect(handler.exportSubtitles).toHaveBeenCalledWith({
      format: "vtt",
      granularity: "word"
    });
    expect(result.ok).toBe(true);
    expect(result.format).toBe("vtt");
    expect(result.cueCount).toBe(1);
  });

  it("clears a line's speaker with null through the handler", async () => {
    const handler = createMockHandler();
    handler.setLineSpeaker.mockReturnValue(lineNode({ speakerId: null }));
    setScriptAgentHandler(SCRIPT_ID, handler);

    await FrontendToolRegistry.call(
      "ui_script_set_speaker",
      { script_id: SCRIPT_ID, target: "0", speakerId: null },
      "tc-6",
      ctx
    );

    expect(handler.setLineSpeaker).toHaveBeenCalledWith("0", null);
  });
});
