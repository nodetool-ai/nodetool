/**
 * Document casts drive the REAL document stores and the REAL assistant fold.
 *
 * These guard three things the tutorial videos depend on:
 *   1. Every document type has a cast — a surface added to the app without one
 *      is a tutorial the harness cannot render.
 *   2. Each cast is well-formed: sorted tracks, nothing past `durationMs`, and
 *      an assistant turn behind every document patch.
 *   3. Replaying through the production stores lands the state each surface
 *      reads — the script's voiced takes, the board's rendered stills, the JS
 *      script's body, the app's widgets, the sketch's layer stack.
 */
import { computeChatStateAt } from "../../chat/chatReplay";
import { useJsScriptStore } from "../../../stores/jsScript/JsScriptStore";
import { useScriptStore } from "../../../stores/script/ScriptStore";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { appAssistantCast } from "../appAssistantCast";
import {
  isDocDemoCast,
  type DocDemoCast,
  type DocSurface
} from "../docCastTypes";
import { disposeDocState, docStateAt, seedDocState } from "../docReplay";
import { docCasts } from "../casts";
import { jsScriptAssistantCast } from "../jsScriptAssistantCast";
import { jsScriptRepairCast } from "../jsScriptRepairCast";
import { scriptAssistantCast } from "../scriptAssistantCast";
import { sketchAssistantCast } from "../sketchAssistantCast";
import { sketchCorrectionCast } from "../sketchCorrectionCast";
import { storyboardAskCast } from "../storyboardAskCast";
import { storyboardAssistantCast } from "../storyboardAssistantCast";

/** Every document type the app can open, per `stores/documentSync.ts`. */
const EXPECTED_SURFACES: DocSurface[] = [
  "sketch",
  "script",
  "storyboard",
  "jsscript",
  "app"
];

const seeded = (cast: DocDemoCast, timeMs: number): void => {
  seedDocState(cast, docStateAt(cast, timeMs));
};

describe("document casts — coverage", () => {
  it("ships a cast for every document type", () => {
    const covered = new Set(docCasts.map((c) => c.surface));
    expect([...covered].sort()).toEqual([...EXPECTED_SURFACES].sort());
  });

  it("gives every cast a unique id", () => {
    const ids = docCasts.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(docCasts.map((c) => [c.id, c] as const))(
    "%s is a well-formed cast",
    (_id, cast) => {
      expect(isDocDemoCast(cast)).toBe(true);

      const times = cast.events.map((e) => e.t);
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(Math.max(...times)).toBeLessThanOrEqual(cast.durationMs);

      const chatTimes = cast.assistant.map((e) => e.t);
      expect(chatTimes).toEqual([...chatTimes].sort((a, b) => a - b));
      expect(Math.max(...chatTimes)).toBeLessThanOrEqual(cast.durationMs);
    }
  );

  it.each(docCasts.map((c) => [c.id, c] as const))(
    "%s shows the assistant that drove every edit",
    (_id, cast) => {
      // A patch with no assistant turn behind it is a document that changed on
      // its own — exactly what these tutorials are not demonstrating.
      for (const event of cast.events) {
        const before = cast.assistant.filter((e) => e.t <= event.t);
        expect(before.length).toBeGreaterThan(0);
      }
      const final = computeChatStateAt(cast.assistant, cast.durationMs);
      expect(final.messages[0]?.role).toBe("user");
      expect(final.messages.at(-1)?.role).toBe("assistant");
      expect(final.messages.at(-1)?.content).toBeTruthy();
      // The dock ends idle: no spinner frozen on the last frame.
      expect(final.runningToolCallId).toBeNull();

      // `toolResult` replaces the whole array, so a later call that lists only
      // itself erases the earlier cards from the transcript. The last frame has
      // to still show every call the assistant made.
      const announced = new Set(
        cast.assistant.flatMap((e) =>
          e.payload.kind === "assistantStart" || e.payload.kind === "toolResult"
            ? (e.payload.toolCalls ?? []).map((c) => c.id)
            : []
        )
      );
      const shown = new Set(
        final.messages.flatMap((m) => (m.tool_calls ?? []).map((c) => c.id))
      );
      expect([...announced].sort()).toEqual([...shown].sort());
    }
  );
});

describe("document casts — the surfaces get their data", () => {
  afterEach(() => {
    for (const cast of docCasts) disposeDocState(cast);
  });

  it("sketch: the vignette layer is added, then dialed in", () => {
    const start = docStateAt(sketchAssistantCast, 0);
    expect(start.document.layers).toHaveLength(1);

    const added = docStateAt(sketchAssistantCast, 6000);
    expect(added.document.layers).toHaveLength(2);
    expect(added.document.layers[1].blendMode).toBe("normal");
    expect(added.document.activeLayerId).toBe("layer-vignette");

    const settled = docStateAt(sketchAssistantCast, 12000);
    expect(settled.document.layers[1].blendMode).toBe("multiply");
    expect(settled.document.layers[1].opacity).toBeCloseTo(0.7);
    expect(settled.document.layers[1].data).toContain("data:image/svg+xml");
  });

  it("sketch: the editor chrome follows the layer the assistant works on", () => {
    // The panel highlights the row being edited, and a patch that touches only
    // the document leaves the chrome where the previous patch put it.
    expect(docStateAt(sketchAssistantCast, 0).editor?.selectedLayerIds).toEqual([
      "layer-base"
    ]);
    expect(
      docStateAt(sketchAssistantCast, 6000).editor?.selectedLayerIds
    ).toEqual(["layer-vignette"]);
    expect(
      docStateAt(sketchAssistantCast, 12000).editor?.selectedLayerIds
    ).toEqual(["layer-vignette"]);
    expect(docStateAt(sketchAssistantCast, 12000).editor?.activeTool).toBe(
      "select"
    );
  });

  it("script: the store gets the cast, the lines, then a take on each line", () => {
    const id = scriptAssistantCast.docId;

    seeded(scriptAssistantCast, 5000);
    expect(useScriptStore.getState().getScript(id)?.cast).toHaveLength(2);
    expect(
      useScriptStore.getState().getScript(id)?.sections[0].lines
    ).toHaveLength(0);

    seeded(scriptAssistantCast, 8000);
    const drafted = useScriptStore.getState().getScript(id);
    expect(drafted?.sections[0].lines).toHaveLength(4);
    expect(drafted?.sections[0].lines.every((l) => l.takes.length === 0)).toBe(
      true
    );

    seeded(scriptAssistantCast, 15000);
    const voiced = useScriptStore.getState().getScript(id);
    expect(
      voiced?.sections[0].lines.every((l) => l.currentTakeId !== null)
    ).toBe(true);
  });

  it("storyboard: shots land first, then one still at a time", () => {
    const id = storyboardAssistantCast.docId;

    seeded(storyboardAssistantCast, 5000);
    const planned = useStoryboardStore.getState().boards[id];
    expect(planned.shots).toHaveLength(6);
    expect(planned.shots.every((s) => s.status === "planned")).toBe(true);
    expect(planned.screenplay?.title).toBe("SCRAPHEART");

    seeded(storyboardAssistantCast, 13500);
    const half = useStoryboardStore.getState().boards[id];
    expect(half.shots.filter((s) => s.keyframe).length).toBe(3);

    seeded(storyboardAssistantCast, 20000);
    const done = useStoryboardStore.getState().boards[id];
    expect(done.shots.every((s) => s.status === "keyframe_ready")).toBe(true);
    expect(done.shots.every((s) => s.keyframe?.uri)).toBe(true);
  });

  it("jsscript: ports, then the body, then the graded test", () => {
    const id = jsScriptAssistantCast.docId;

    seeded(jsScriptAssistantCast, 5000);
    const ported = useJsScriptStore.getState().getScript(id)?.document;
    expect(ported?.inputs.map((p) => p.name)).toEqual(["csv", "column"]);
    expect(ported?.code).toBe("");

    seeded(jsScriptAssistantCast, 10000);
    const coded = useJsScriptStore.getState().getScript(id)?.document;
    expect(coded?.code).toContain('output("total"');
    expect(coded?.code).toContain('import { parse } from "@nodetool-ai/sandbox-csv"');

    seeded(jsScriptAssistantCast, 15000);
    expect(
      useJsScriptStore.getState().getScript(id)?.document.tests
    ).toHaveLength(1);
  });

  it("app: the operation and variable precede the widgets that bind to them", () => {
    const bound = docStateAt(appAssistantCast, 5000);
    expect(bound.document.operations).toHaveLength(1);
    expect(bound.document.variables).toHaveLength(1);
    expect(bound.document.ui.content).toHaveLength(0);

    const built = docStateAt(appAssistantCast, 15000);
    const widgets = built.document.ui.content as {
      type: string;
      props: { binding?: string };
    }[];
    expect(widgets.map((w) => w.type)).toEqual([
      "Heading",
      "TextInput",
      "Button",
      "Text"
    ]);
    // Every binding names something the document declares.
    const bindings = widgets
      .map((w) => w.props.binding)
      .filter((b): b is string => Boolean(b));
    expect(bindings).toContain("var:topic");
    expect(bindings).toContain("op:write/out:headline");
  });

  it("sketch correction: the second ask amends the layer, it does not add one", () => {
    const added = docStateAt(sketchCorrectionCast, 5000);
    expect(added.document.layers).toHaveLength(2);
    expect(added.document.layers[1].blendMode).toBe("normal");

    const settled = docStateAt(sketchCorrectionCast, 8000);
    expect(settled.document.layers[1].opacity).toBeCloseTo(0.85);
    expect(settled.document.layers[1].blendMode).toBe("screen");

    // The correction halves the strength of the layer already there — the
    // stack stays at two, and nothing is regenerated.
    const corrected = docStateAt(sketchCorrectionCast, 16000);
    expect(corrected.document.layers).toHaveLength(2);
    expect(corrected.document.layers[1].id).toBe("layer-warm-wash");
    expect(corrected.document.layers[1].opacity).toBeCloseTo(0.4);
  });

  it("storyboard ask: nothing lands on the board until the question is answered", () => {
    const id = storyboardAskCast.docId;

    // The assistant has asked and is idle. An empty board is the point.
    seeded(storyboardAskCast, 6000);
    const waiting = useStoryboardStore.getState().boards[id];
    expect(waiting.shots).toHaveLength(0);
    expect(waiting.screenplay).toBeNull();
    expect(waiting.aspectRatio).toBe("16:9");

    // The answer picks the format, and the shots arrive planned — still no
    // frame rendered.
    seeded(storyboardAskCast, 15000);
    const boarded = useStoryboardStore.getState().boards[id];
    expect(boarded.shots).toHaveLength(3);
    expect(boarded.aspectRatio).toBe("9:16");
    expect(boarded.shots.every((s) => s.status === "planned")).toBe(true);
    expect(boarded.shots.some((s) => s.keyframe)).toBe(false);
  });

  it("jsscript repair: the case is saved, fails, and the fix turns it green", () => {
    const id = jsScriptRepairCast.docId;

    seeded(jsScriptRepairCast, 2000);
    const before = useJsScriptStore.getState().getScript(id)?.document;
    expect(before?.tests).toHaveLength(1);
    expect(before?.code).toContain("?? 0");

    // The edge case is saved against the body that still breaks on it.
    seeded(jsScriptRepairCast, 6000);
    const red = useJsScriptStore.getState().getScript(id)?.document;
    expect(red?.tests).toHaveLength(2);
    expect(red?.code).toContain("?? 0");

    seeded(jsScriptRepairCast, 16000);
    const green = useJsScriptStore.getState().getScript(id)?.document;
    expect(green?.code).toContain("Number.isFinite");
    expect(green?.code).not.toContain("?? 0");
    expect(green?.tests).toHaveLength(2);
  });

  it("disposeDocState drops the rows the replay wrote", () => {
    seeded(scriptAssistantCast, 15000);
    seeded(storyboardAssistantCast, 20000);
    seeded(jsScriptAssistantCast, 15000);

    for (const cast of docCasts) disposeDocState(cast);

    expect(
      useScriptStore.getState().getScript(scriptAssistantCast.docId)
    ).toBeUndefined();
    expect(
      useStoryboardStore.getState().boards[storyboardAssistantCast.docId]
    ).toBeUndefined();
    expect(
      useJsScriptStore.getState().getScript(jsScriptAssistantCast.docId)
    ).toBeUndefined();
  });
});
