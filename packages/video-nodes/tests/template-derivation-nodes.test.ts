/**
 * The four template-derivation nodes, against the in-memory
 * {@link createFakeContext} from runtime's `testing.ts` with script, timeline
 * and entity model interfaces wired to plain Maps.
 *
 * What each case is here to catch:
 * - every node creates a *new* row and leaves the source untouched (P1)
 * - `FillScript` stamps `templateId` and keeps takes, so a later `VoiceScript`
 *   only re-voices the lines whose text moved — asserted with the real
 *   `needsVoicing`, which protocol's own suite cannot import
 * - `WriteScript` binds a cast entity to a speaker with its id and its voice
 * - `RetargetTimeline` writes the new canvas and reports its crops
 */
import { describe, it, expect } from "vitest";
import {
  createFakeContext,
  FakeProvider,
  type ProcessingContext
} from "@nodetool-ai/runtime";
import { makeClip, makeSequence, makeTrack, needsVoicing } from "@nodetool-ai/timeline";
import type { TimelineSequence } from "@nodetool-ai/timeline";
import type { Entity } from "@nodetool-ai/protocol";
import {
  FillScriptNode,
  WriteScriptNode
} from "../src/nodes/script.js";
import {
  FillTimelineTextNode,
  RetargetTimelineNode
} from "../src/nodes/timeline.js";

const VOICE = { provider: "openai", model: "tts-1", voice: "alloy" };

interface ScriptRow {
  id: string;
  projectId: string;
  name: string;
  document: Record<string, unknown>;
  updatedAt: string;
}

interface Harness {
  context: ProcessingContext;
  scripts: Map<string, ScriptRow>;
  timelines: Map<string, TimelineSequence>;
  entities: Map<string, Entity>;
  cleanup: () => void;
}

function harness(options: { provider?: FakeProvider } = {}): Harness {
  const scripts = new Map<string, ScriptRow>();
  const timelines = new Map<string, TimelineSequence>();
  const entities = new Map<string, Entity>();
  let nextId = 0;
  const mint = (prefix: string) => `${prefix}-${(nextId += 1)}`;

  const fake = createFakeContext(
    options.provider ? { providers: { openai: options.provider } } : {}
  );
  fake.context.setModelInterfaces({
    getScript: async ({ id }) =>
      (scripts.get(id) ?? null) as unknown as { id: string } | null,
    createScript: async ({ name, projectId, document }) => {
      const row: ScriptRow = {
        id: mint("script"),
        projectId: projectId ?? "default",
        name: name ?? "Untitled script",
        document: document as Record<string, unknown>,
        updatedAt: new Date().toISOString()
      };
      scripts.set(row.id, row);
      return { id: row.id };
    },
    getTimelineSequence: async ({ id }) =>
      (timelines.get(id) ?? null) as unknown as { id: string } | null,
    createTimelineSequence: async ({ sequence }) => {
      const seq = sequence as TimelineSequence;
      const row = { ...seq, id: seq.id || mint("seq") };
      timelines.set(row.id, row);
      return { id: row.id };
    },
    getEntity: async ({ id }) => entities.get(id) ?? null
  });

  return {
    context: fake.context,
    scripts,
    timelines,
    entities,
    cleanup: fake.cleanup
  };
}

function templateScript(h: Harness): ScriptRow {
  const row: ScriptRow = {
    id: "script-template",
    projectId: "proj-1",
    name: "Ad read",
    document: {
      cast: [{ id: "spk-1", name: "Narrator", voice: VOICE }],
      sections: [
        {
          id: "sec-1",
          title: "Pitch",
          lines: [
            {
              id: "line-1",
              speakerId: "spk-1",
              text: "Meet the {{name}}, yours for {{price}}.",
              takes: [
                {
                  id: "take-1",
                  assetId: "asset-1",
                  durationMs: 1500,
                  words: [],
                  textSnapshot: "Meet the {{name}}, yours for {{price}}.",
                  voiceSnapshot: VOICE,
                  createdAt: "2026-01-01T00:00:00.000Z"
                }
              ],
              currentTakeId: "take-1"
            },
            {
              id: "line-2",
              speakerId: "spk-1",
              text: "Free shipping, always.",
              takes: [
                {
                  id: "take-2",
                  assetId: "asset-2",
                  durationMs: 1200,
                  words: [],
                  textSnapshot: "Free shipping, always.",
                  voiceSnapshot: VOICE,
                  createdAt: "2026-01-01T00:00:00.000Z"
                }
              ],
              currentTakeId: "take-2"
            }
          ]
        }
      ]
    },
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
  h.scripts.set(row.id, row);
  return row;
}

function templateCut(h: Harness): TimelineSequence {
  const track = makeTrack({ id: "trk-1", name: "Text", type: "overlay" });
  const seq = makeSequence({
    id: "seq-template",
    projectId: "proj-1",
    name: "Launch film",
    width: 1920,
    height: 1080,
    tracks: [track],
    clips: [
      makeClip({
        id: "clip-text",
        trackId: track.id,
        durationMs: 3000,
        mediaType: "text",
        textStyle: {
          text: "{{name}} — {{price}}",
          fontSizePx: 64,
          color: "#ffffff"
        }
      }),
      makeClip({
        id: "clip-shot",
        trackId: track.id,
        durationMs: 4000,
        mediaType: "video",
        currentAssetId: "asset-shot"
      })
    ]
  });
  h.timelines.set(seq.id, seq);
  return seq;
}

describe("nodetool.script.FillScript", () => {
  it("creates a new script stamped with templateId and leaves the source alone", async () => {
    const h = harness();
    const source = templateScript(h);

    const node = Object.assign(new FillScriptNode(), {
      script: { type: "script", id: source.id },
      values: { name: "Aero 9", price: 79 },
      name: ""
    });
    const out = await node.process(h.context);

    expect(out.script.id).not.toBe(source.id);
    const created = h.scripts.get(out.script.id);
    expect(created?.document.templateId).toBe("script-template");
    expect(created?.projectId).toBe("proj-1");
    expect(created?.name).toBe("Ad read");
    // A numeric dict value fills as its text, not as a skipped key.
    const lines = (
      created?.document.sections as { lines: { text: string }[] }[]
    )[0].lines;
    expect(lines[0].text).toBe("Meet the Aero 9, yours for 79.");
    expect(out.filled).toEqual(["name", "price"]);
    expect(out.unresolved).toEqual([]);
    // The template is untouched.
    expect(
      (source.document.sections as { lines: { text: string }[] }[])[0].lines[0]
        .text
    ).toBe("Meet the {{name}}, yours for {{price}}.");
    h.cleanup();
  });

  it("reports an unresolved key and leaves it in the text", async () => {
    const h = harness();
    const source = templateScript(h);

    const out = await Object.assign(new FillScriptNode(), {
      script: { type: "script", id: source.id },
      values: { name: "Aero 9" },
      name: "Aero 9 read"
    }).process(h.context);

    const created = h.scripts.get(out.script.id);
    const lines = (
      created?.document.sections as { lines: { text: string }[] }[]
    )[0].lines;
    expect(lines[0].text).toBe("Meet the Aero 9, yours for {{price}}.");
    expect(out.unresolved).toEqual(["price"]);
    expect(created?.name).toBe("Aero 9 read");
    h.cleanup();
  });

  it("keeps takes, so VoiceScript re-voices only the filled line", async () => {
    const h = harness();
    const source = templateScript(h);

    const out = await Object.assign(new FillScriptNode(), {
      script: { type: "script", id: source.id },
      values: { name: "Aero 9", price: "79" },
      name: ""
    }).process(h.context);

    const created = h.scripts.get(out.script.id);
    const [changed, untouched] = (
      created?.document.sections as {
        lines: Parameters<typeof needsVoicing>[0][];
      }[]
    )[0].lines;
    expect(changed.takes).toHaveLength(1);
    expect(needsVoicing(changed, VOICE)).toBe(true);
    expect(needsVoicing(untouched, VOICE)).toBe(false);
    h.cleanup();
  });

  it("refuses an empty script ref before it writes anything", async () => {
    const h = harness();

    await expect(
      Object.assign(new FillScriptNode(), {
        script: { type: "script", id: null },
        values: {},
        name: ""
      }).process(h.context)
    ).rejects.toThrow(/Script input is empty/);
    expect(h.scripts.size).toBe(0);
    h.cleanup();
  });
});

describe("nodetool.script.WriteScript", () => {
  const writer = () =>
    new FakeProvider({
      toolCalls: [
        {
          id: "call-1",
          name: "script",
          args: {
            speakers: [{ name: "Mara" }],
            sections: [
              {
                title: "Open",
                lines: [
                  { speaker: "Mara", text: "Here is the thing." },
                  { speaker: "Mara", text: "And here is why." }
                ]
              }
            ]
          }
        }
      ]
    });

  const narrator: Entity = {
    type: "entity",
    id: "entity-mara",
    kind: "character",
    name: "Mara",
    descriptor: "a calm narrator in her thirties",
    voice_id: "aoede"
  };

  it("writes a new script and binds the cast entity to its speaker", async () => {
    const h = harness({ provider: writer() });

    const out = await Object.assign(new WriteScriptNode(), {
      model: { type: "language_model", provider: "openai", id: "gpt-test" },
      brief: "Sell the Aero 9 headphones.",
      format: "voiceover",
      cast: [narrator],
      language: "",
      pace: "normal",
      length_seconds: 30,
      voice_provider: "elevenlabs",
      voice_model: "eleven_v3",
      name: ""
    }).process(h.context);

    const created = h.scripts.get(out.script.id);
    const cast = created?.document.cast as {
      name: string;
      entityId?: string;
      voice?: { provider: string; model: string; voice: string };
    }[];
    expect(cast).toHaveLength(1);
    expect(cast[0].name).toBe("Mara");
    expect(cast[0].entityId).toBe("entity-mara");
    expect(cast[0].voice).toEqual({
      provider: "elevenlabs",
      model: "eleven_v3",
      voice: "aoede"
    });
    expect(out.line_count).toBe(2);
    h.cleanup();
  });

  it("binds a leftover cast entity to the format's own speaker by position", async () => {
    const h = harness({
      provider: new FakeProvider({
        toolCalls: [
          {
            id: "call-1",
            name: "script",
            args: {
              speakers: [{ name: "Narrator" }],
              sections: [
                {
                  title: "Open",
                  lines: [{ speaker: "Narrator", text: "One line." }]
                }
              ]
            }
          }
        ]
      })
    });

    const out = await Object.assign(new WriteScriptNode(), {
      model: { type: "language_model", provider: "openai", id: "gpt-test" },
      brief: "Explain the offer.",
      format: "voiceover",
      cast: [narrator],
      language: "de",
      pace: "normal",
      length_seconds: 30,
      voice_provider: "elevenlabs",
      voice_model: "eleven_v3",
      name: "German read"
    }).process(h.context);

    const cast = h.scripts.get(out.script.id)?.document.cast as {
      name: string;
      entityId?: string;
    }[];
    expect(cast[0].name).toBe("Narrator");
    expect(cast[0].entityId).toBe("entity-mara");
    h.cleanup();
  });

  it("leaves a speaker unvoiced rather than writing half a voice binding", async () => {
    const h = harness({ provider: writer() });

    const out = await Object.assign(new WriteScriptNode(), {
      model: { type: "language_model", provider: "openai", id: "gpt-test" },
      brief: "Sell the Aero 9 headphones.",
      format: "voiceover",
      cast: [narrator],
      language: "",
      pace: "normal",
      length_seconds: 30,
      voice_provider: "",
      voice_model: "",
      name: ""
    }).process(h.context);

    const cast = h.scripts.get(out.script.id)?.document.cast as {
      entityId?: string;
      voice?: unknown;
    }[];
    expect(cast[0].entityId).toBe("entity-mara");
    expect(cast[0].voice).toBeUndefined();
    h.cleanup();
  });

  it("fills a bare entity pointer from the library before writing", async () => {
    const h = harness({ provider: writer() });
    h.entities.set(narrator.id, narrator);

    const out = await Object.assign(new WriteScriptNode(), {
      model: { type: "language_model", provider: "openai", id: "gpt-test" },
      brief: "Sell the Aero 9 headphones.",
      format: "voiceover",
      // Descriptor empty: an id and nothing else, as a picker emits it.
      cast: [
        { type: "entity", id: "entity-mara", kind: "character", name: "", descriptor: "" }
      ],
      language: "",
      pace: "normal",
      length_seconds: 30,
      voice_provider: "elevenlabs",
      voice_model: "eleven_v3",
      name: ""
    }).process(h.context);

    const cast = h.scripts.get(out.script.id)?.document.cast as {
      entityId?: string;
      voice?: { voice: string };
    }[];
    expect(cast[0].entityId).toBe("entity-mara");
    expect(cast[0].voice?.voice).toBe("aoede");
    h.cleanup();
  });

  it("refuses a model with no provider before it calls anything", async () => {
    const h = harness({ provider: writer() });

    await expect(
      Object.assign(new WriteScriptNode(), {
        model: { type: "language_model", provider: "", id: "" },
        brief: "Sell the Aero 9.",
        format: "voiceover",
        cast: [],
        language: "",
        pace: "normal",
        length_seconds: 30,
        voice_provider: "",
        voice_model: "",
        name: ""
      }).process(h.context)
    ).rejects.toThrow(/pick a model/);
    expect(h.scripts.size).toBe(0);
    h.cleanup();
  });
});

describe("nodetool.timeline.FillTimelineText", () => {
  it("creates a new sequence stamped with templateId and leaves the source alone", async () => {
    const h = harness();
    const source = templateCut(h);

    const out = await Object.assign(new FillTimelineTextNode(), {
      timeline: { type: "timeline", id: source.id },
      values: { name: "Aero 9", price: "$79" },
      name: ""
    }).process(h.context);

    expect(out.timeline.id).not.toBe(source.id);
    const created = h.timelines.get(out.timeline.id);
    expect(created?.templateId).toBe("seq-template");
    expect(created?.name).toBe("Launch film");
    expect(
      created?.clips.find((c) => c.id === "clip-text")?.textStyle?.text
    ).toBe("Aero 9 — $79");
    expect(
      h.timelines.get(source.id)?.clips.find((c) => c.id === "clip-text")
        ?.textStyle?.text
    ).toBe("{{name}} — {{price}}");
    expect(out.filled).toEqual(["name", "price"]);
    h.cleanup();
  });

  it("reports an unresolved key and leaves it on the frame", async () => {
    const h = harness();
    const source = templateCut(h);

    const out = await Object.assign(new FillTimelineTextNode(), {
      timeline: { type: "timeline", id: source.id },
      values: { name: "Aero 9" },
      name: "Aero 9 cut"
    }).process(h.context);

    expect(
      h.timelines
        .get(out.timeline.id)
        ?.clips.find((c) => c.id === "clip-text")?.textStyle?.text
    ).toBe("Aero 9 — {{price}}");
    expect(out.unresolved).toEqual(["price"]);
    expect(h.timelines.get(out.timeline.id)?.name).toBe("Aero 9 cut");
    h.cleanup();
  });
});

describe("nodetool.timeline.RetargetTimeline", () => {
  it("writes a new sequence on the new canvas and reports the crops", async () => {
    const h = harness();
    const source = templateCut(h);

    const out = await Object.assign(new RetargetTimelineNode(), {
      timeline: { type: "timeline", id: source.id },
      aspect_ratio: "9:16",
      fit: "cover",
      name: ""
    }).process(h.context);

    const created = h.timelines.get(out.timeline.id);
    expect(out.timeline.id).not.toBe(source.id);
    expect({ width: created?.width, height: created?.height }).toEqual({
      width: 1080,
      height: 1920
    });
    expect(created?.templateId).toBe("seq-template");
    expect(created?.name).toBe("Launch film 9:16");
    expect(out.cropped).toEqual(["clip-shot"]);
    // The approved cut keeps its frame and its placements.
    expect(h.timelines.get(source.id)?.width).toBe(1920);
    h.cleanup();
  });

  it("letterboxes under contain and crops nothing", async () => {
    const h = harness();
    const source = templateCut(h);

    const out = await Object.assign(new RetargetTimelineNode(), {
      timeline: { type: "timeline", id: source.id },
      aspect_ratio: "1:1",
      fit: "contain",
      name: "Square"
    }).process(h.context);

    const created = h.timelines.get(out.timeline.id);
    expect(created?.clips.find((c) => c.id === "clip-shot")?.transform?.scale.x).toBe(1);
    expect(out.cropped).toEqual([]);
    expect(created?.name).toBe("Square");
    h.cleanup();
  });
});
