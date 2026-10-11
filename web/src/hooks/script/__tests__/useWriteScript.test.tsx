/**
 * @jest-environment jsdom
 *
 * The writer's contract (PRD § 9.7).
 *
 * Criterion 3: one `generate_text` request, cast and lines applied, and no
 * take recorded — the writer plans, step 3 spends.
 * Criterion 4: imported text comes out verbatim, and a rewrite keeps the ids
 * of the lines it retains, so their takes survive.
 */
import { renderHook, act } from "@testing-library/react";

const rpcRequest = jest.fn();
jest.mock("../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => rpcRequest(...(args as [])),
  randomRequestId: () => "req-test"
}));

import { useWriteScript } from "../useWriteScript";
import { readWriterSignature, writerSignature } from "../scriptWriteSignature";
import { useScriptStore } from "../../../stores/script/ScriptStore";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import {
  importedFromSubtitles,
  importedFromText,
  readScriptSource,
  scriptSourcePatch,
  type ImportedScript
} from "../../../lib/script/importedScript";
import { parseSrt } from "../../../lib/script/parseSrt";

const SCRIPT = "script-write";

/** A pasted script, exactly as its author punctuated it. */
const IMPORTED = `We shipped it on a Tuesday.
Eleven people used it that week.
By Friday there were four hundred, and the servers were the ones complaining.`;

const seed = (): void => {
  const store = useScriptStore.getState();
  store.ensureScript(SCRIPT);
  store.setSetup(SCRIPT, {
    stage: "format",
    brief: "How a side project got out of hand",
    format: "voiceover",
    length_seconds: 60
  });
};

beforeEach(() => {
  rpcRequest.mockReset();
  useScriptStore.setState({ scripts: {}, history: {} } as never);
  useGlobalChatStore.setState({
    selectedModel: {
      type: "language_model",
      id: "claude-sonnet-5",
      provider: "anthropic"
    }
  } as never);
  seed();
});

/** Record a source on the document, the way step 1's imports do. */
const setSource = (source: ImportedScript): void => {
  useScriptStore.getState().setSetup(SCRIPT, scriptSourcePatch(source));
};

const scriptNow = () => useScriptStore.getState().getScript(SCRIPT)!;
const linesNow = () => scriptNow().sections.flatMap((section) => section.lines);

const writerAnswer = {
  text: "",
  data: {
    speakers: [{ name: "Narrator" }],
    sections: [
      {
        title: "Open",
        lines: [
          { speaker: "Narrator", text: "It started as a weekend build." },
          { speaker: "Narrator", text: "Then Tuesday happened." }
        ]
      }
    ]
  }
};

describe("writeScript", () => {
  it("writes cast and lines from the brief and records no take", async () => {
    rpcRequest.mockResolvedValue(writerAnswer);
    const { result } = renderHook(() => useWriteScript());

    await act(async () => {
      expect(await result.current.write(SCRIPT)).toBe(true);
    });

    expect(rpcRequest).toHaveBeenCalledTimes(1);
    const [command, payload] = rpcRequest.mock.calls[0] as [
      string,
      Record<string, unknown>
    ];
    expect(command).toBe("generate_text");
    expect(payload.schema_name).toBe("script");
    expect(scriptNow().cast.map((s) => s.name)).toEqual(["Narrator"]);
    expect(linesNow().map((line) => line.text)).toEqual([
      "It started as a weekend build.",
      "Then Tuesday happened."
    ]);
    expect(linesNow().every((line) => line.takes.length === 0)).toBe(true);
    expect(scriptNow().setup?.stage).toBe("review");
  });

  it("records the settings consumed by a pending write", async () => {
    useScriptStore.getState().setSetup(SCRIPT, { length_seconds: 30 });
    const requestedSignature = writerSignature(scriptNow().setup, null);
    let finish = (_answer: typeof writerAnswer): void => {};
    rpcRequest.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const { result } = renderHook(() => useWriteScript());
    let pending: Promise<boolean>;
    act(() => {
      pending = result.current.write(SCRIPT);
    });
    act(() => {
      useScriptStore.getState().setSetup(SCRIPT, {
        length_seconds: 120,
        format: "dialogue"
      });
    });
    await act(async () => {
      finish(writerAnswer);
      expect(await pending).toBe(true);
    });
    expect(readWriterSignature(scriptNow().setup)).toBe(requestedSignature);
    expect(readWriterSignature(scriptNow().setup)).not.toBe(
      writerSignature(scriptNow().setup, null)
    );
    expect(scriptNow().setup?.length_seconds).toBe(120);
  });

  it.each([false, true])(
    "ignores a late result after cancellation (import: %s)",
    async (imported) => {
      if (imported) {
        setSource(importedFromText(IMPORTED));
      }
      const before = scriptNow();
      let finish = (_answer: typeof writerAnswer): void => {};
      rpcRequest.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        })
      );
      const controller = new AbortController();
      const { result } = renderHook(() => useWriteScript());
      let pending: Promise<boolean>;
      act(() => {
        pending = result.current.write(SCRIPT, { signal: controller.signal });
      });
      act(() => {
        controller.abort();
      });
      await act(async () => {
        finish(writerAnswer);
        expect(await pending).toBe(false);
      });
      expect(rpcRequest.mock.calls[0][3].aborted).toBe(true);
      expect(scriptNow()).toEqual(before);
      expect(result.current.writing).toBe(false);
      expect(result.current.error).toBeNull();
    }
  );

  it("cancels a review rewrite without reporting an error", async () => {
    rpcRequest.mockResolvedValue(writerAnswer);
    const { result } = renderHook(() => useWriteScript());
    await act(async () => {
      await result.current.write(SCRIPT);
    });
    setSource(importedFromText(IMPORTED));
    const before = scriptNow();
    rpcRequest.mockImplementation(
      (_command, _payload, _timeout, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        })
    );
    let pending: Promise<boolean>;
    act(() => {
      pending = result.current.write(SCRIPT, { rewrite: true });
    });
    await act(async () => {
      result.current.cancel();
      expect(await pending).toBe(false);
    });
    expect(scriptNow()).toEqual(before);
    expect(result.current.writing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("keeps imported words verbatim, whatever the answer says", async () => {
    setSource(importedFromText(IMPORTED));
    // The attribution call is answered by a model that ignored the schema and
    // sent back its own, tighter prose.
    rpcRequest.mockResolvedValue({
      text: "",
      data: {
        speakers: [{ name: "Founder" }],
        lines: [
          { number: 1, speaker: "Founder", text: "We shipped Tuesday." },
          { number: 2, speaker: "Founder", text: "Eleven users." },
          { number: 3, speaker: "Founder", text: "Then four hundred." }
        ]
      }
    });
    const { result } = renderHook(() => useWriteScript());

    await act(async () => {
      expect(await result.current.write(SCRIPT)).toBe(true);
    });

    expect(linesNow().map((line) => line.text)).toEqual([
      "We shipped it on a Tuesday.",
      "Eleven people used it that week.",
      "By Friday there were four hundred, and the servers were the ones complaining."
    ]);
    expect(scriptNow().cast.map((s) => s.name)).toEqual(["Founder"]);
    // The attribution schema is the reason this holds: it has no text field.
    const [, payload] = rpcRequest.mock.calls[0] as [
      string,
      Record<string, unknown>
    ];
    expect(payload.schema_name).toBe("script_attribution");
  });

  it("applies a Final Draft import with no model call and no writer model", async () => {
    setSource({
      kind: "fdx",
      preserve: "verbatim",
      label: "Final Draft screenplay",
      lines: [
        { text: "Are you coming or not?", speakerName: "SOPHIA" },
        { text: "Give me a minute.", speakerName: "MARCUS", direction: "flat" }
      ],
      speakers: ["SOPHIA", "MARCUS"],
      attributed: true,
      text: "Are you coming or not?\nGive me a minute."
    });
    // No model is selected anywhere: an attributed import needs none (F16).
    useGlobalChatStore.setState({ selectedModel: null } as never);
    const { result } = renderHook(() => useWriteScript());

    await act(async () => {
      expect(await result.current.write(SCRIPT)).toBe(true);
    });

    expect(rpcRequest).not.toHaveBeenCalled();
    expect(linesNow().map((line) => line.text)).toEqual([
      "Are you coming or not?",
      "Give me a minute."
    ]);
    const cast = new Map(scriptNow().cast.map((s) => [s.id, s.name]));
    expect(linesNow().map((line) => cast.get(line.speakerId ?? ""))).toEqual([
      "SOPHIA",
      "MARCUS"
    ]);
  });

  it("gives a screenplay that names nobody one speaker to read it", async () => {
    setSource({
      kind: "fdx",
      preserve: "verbatim",
      label: "Final Draft screenplay",
      lines: [
        { text: "Are you coming or not?", speakerName: "" },
        { text: "Give me a minute.", speakerName: "" }
      ],
      speakers: [],
      attributed: true,
      text: "Are you coming or not?\nGive me a minute."
    });
    const { result } = renderHook(() => useWriteScript());

    await act(async () => {
      expect(await result.current.write(SCRIPT)).toBe(true);
    });

    // With no cast the review asked for a speaker and offered none.
    expect(scriptNow().cast.map((speaker) => speaker.name)).toEqual([
      "Narrator"
    ]);
    const narrator = scriptNow().cast[0].id;
    expect(linesNow().map((line) => line.speakerId)).toEqual([
      narrator,
      narrator
    ]);
  });

  it("keeps the voices picked for an attributed import when it is prepared again", async () => {
    setSource({
      kind: "fdx",
      preserve: "verbatim",
      label: "Final Draft screenplay",
      lines: [
        { text: "Are you coming or not?", speakerName: "SOPHIA" },
        { text: "Give me a minute.", speakerName: "MARCUS" }
      ],
      speakers: ["SOPHIA", "MARCUS"],
      attributed: true,
      text: "Are you coming or not?\nGive me a minute."
    });
    const { result } = renderHook(() => useWriteScript());
    await act(async () => {
      expect(await result.current.write(SCRIPT)).toBe(true);
    });
    const sophia = scriptNow().cast.find((s) => s.name === "SOPHIA")!;
    const voice = { provider: "elevenlabs", model: "eleven_v3", voice: "v-1" };
    useScriptStore.getState().updateSpeaker(SCRIPT, sophia.id, { voice });

    await act(async () => {
      expect(await result.current.write(SCRIPT)).toBe(true);
    });

    const again = scriptNow().cast.find((s) => s.name === "SOPHIA")!;
    expect(again.id).toBe(sophia.id);
    expect(again.voice).toEqual(voice);
    expect(linesNow()[0].speakerId).toBe(sophia.id);
  });

  it("leaves language out of the signature of an attributed import", () => {
    const source: ImportedScript = {
      kind: "fdx",
      preserve: "verbatim",
      label: "Final Draft screenplay",
      lines: [{ text: "Give me a minute.", speakerName: "MARCUS" }],
      speakers: ["MARCUS"],
      attributed: true,
      text: "Give me a minute."
    };
    const setup = scriptNow().setup!;
    expect(writerSignature({ ...setup, language: "de" }, source)).toBe(
      writerSignature({ ...setup, language: "fr" }, source)
    );
    // Text that goes to a model still counts the language.
    expect(writerSignature({ ...setup, language: "de" }, null)).not.toBe(
      writerSignature({ ...setup, language: "fr" }, null)
    );
  });

  it("turns an SRT's cues into lines that carry their timings", async () => {
    const srt = [
      "1",
      "00:00:00,500 --> 00:00:03,250",
      "A tide clock has one hand.",
      "",
      "2",
      "00:00:03,250 --> 00:00:07,000",
      "It goes round once a lunar day.",
      ""
    ].join("\n");
    setSource(importedFromSubtitles(parseSrt(srt)));
    const { result } = renderHook(() => useWriteScript());

    await act(async () => {
      expect(await result.current.write(SCRIPT)).toBe(true);
    });

    expect(rpcRequest).not.toHaveBeenCalled();
    expect(linesNow().map((line) => line.text)).toEqual([
      "A tide clock has one hand.",
      "It goes round once a lunar day."
    ]);
    expect(linesNow().map((line) => line.targetDurationMs)).toEqual([
      2750, 3750
    ]);
    expect(scriptNow().cast.map((speaker) => speaker.name)).toEqual([
      "Narrator"
    ]);
  });

  // CI caught this and an isolated run did not: the id prefix came from
  // `Date.now()` alone, so two writes inside one millisecond minted the same
  // ids and a rewrite's new line inherited the takes of the line it replaced —
  // audio of words nobody wrote. Freezing the clock makes the fast runner's
  // accident deterministic.
  it("gives a rewrite its own line ids even within one millisecond", async () => {
    const frozen = jest
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-01-01T00:00:00.000Z").getTime());
    try {
      const { result } = renderHook(() => useWriteScript());

      rpcRequest.mockResolvedValue(writerAnswer);
      await act(async () => {
        expect(await result.current.write(SCRIPT)).toBe(true);
      });
      const first = linesNow().map((line) => line.id);
      expect(first).toHaveLength(2);

      await act(async () => {
        expect(await result.current.write(SCRIPT, { rewrite: true })).toBe(
          true
        );
      });
      const second = linesNow().map((line) => line.id);

      // The rewrite returns lines with no ids, so every one is new. None may
      // reuse an id from the pass before it.
      for (const id of second) {
        expect(first).not.toContain(id);
      }
    } finally {
      frozen.mockRestore();
    }
  });

  it("keeps the takes of a line a rewrite retained", async () => {
    rpcRequest.mockResolvedValue(writerAnswer);
    const { result } = renderHook(() => useWriteScript());
    await act(async () => {
      await result.current.write(SCRIPT);
    });

    const [kept, dropped] = linesNow();
    useScriptStore.getState().appendTake(SCRIPT, kept.id, {
      id: "take-1",
      assetId: "asset-1",
      durationMs: 1200,
      words: [],
      textSnapshot: kept.text,
      voiceSnapshot: null,
      createdAt: "2026-01-01T00:00:00.000Z"
    });

    rpcRequest.mockResolvedValue({
      text: "",
      data: {
        speakers: [{ name: "Narrator" }],
        sections: [
          {
            title: "Open",
            lines: [
              {
                id: kept.id,
                speaker: "Narrator",
                text: "It started as a weekend build."
              },
              { speaker: "Narrator", text: "A brand new line." }
            ]
          }
        ]
      }
    });

    await act(async () => {
      expect(await result.current.write(SCRIPT, { rewrite: true })).toBe(true);
    });

    const after = linesNow();
    expect(after[0].id).toBe(kept.id);
    expect(after[0].takes).toHaveLength(1);
    expect(after[1].id).not.toBe(dropped.id);
    expect(after[1].takes).toHaveLength(0);
    // The rewrite is shown the script it is rewriting, ids included.
    const [, payload] = rpcRequest.mock.calls[1] as [
      string,
      Record<string, unknown>
    ];
    expect(String(payload.prompt)).toContain(`[${kept.id}] Narrator:`);
  });

  it("gives the source up on an explicit rewrite, keeping the review's edits", async () => {
    setSource(importedFromText(IMPORTED));
    rpcRequest.mockResolvedValue({
      text: "",
      data: {
        speakers: [{ name: "Founder" }],
        lines: IMPORTED.split("\n").map((_, index) => ({
          number: index + 1,
          speaker: "Founder"
        }))
      }
    });
    const { result } = renderHook(() => useWriteScript());
    await act(async () => {
      await result.current.write(SCRIPT);
    });

    // The creator fixes a line in the review, then asks for a rewrite.
    const [first] = linesNow();
    useScriptStore.getState().patchLine(SCRIPT, first.id, {
      text: "We shipped it on a Wednesday."
    });
    rpcRequest.mockResolvedValue(writerAnswer);

    await act(async () => {
      expect(await result.current.write(SCRIPT, { rewrite: true })).toBe(true);
    });

    // The writer ran, rather than the import being applied over the edit.
    const [, payload] = rpcRequest.mock.calls[1] as [
      string,
      Record<string, unknown>
    ];
    expect(payload.schema_name).toBe("script");
    expect(String(payload.prompt)).toContain("We shipped it on a Wednesday.");
    expect(linesNow().map((line) => line.text)).toEqual([
      "It started as a weekend build.",
      "Then Tuesday happened."
    ]);
    // The source is given up on the document, so a reload does not bring the
    // old words back on the next write (F3).
    expect(readScriptSource(scriptNow().setup ?? null)).toBeNull();
  });

  it("reports a refused run instead of throwing", async () => {
    rpcRequest.mockRejectedValue(new Error("no credit"));
    const { result } = renderHook(() => useWriteScript());

    await act(async () => {
      expect(await result.current.write(SCRIPT)).toBe(false);
    });
    expect(result.current.error).toBe("no credit");
    expect(linesNow()).toHaveLength(0);
    expect(scriptNow().setup?.stage).toBe("format");
  });

  it("has the reason on errorRef by the time a refused write resolves (F5)", async () => {
    rpcRequest.mockRejectedValue(new Error("no credit"));
    const { result } = renderHook(() => useWriteScript());
    // The render-time snapshot a caller's closure holds while it awaits.
    const { errorRef } = result.current;

    let reason: string | null = null;
    await act(async () => {
      await result.current.write(SCRIPT);
      reason = errorRef.current;
    });
    expect(reason).toBe("no credit");
  });

  it("refuses a script with no brief and no import", async () => {
    useScriptStore.getState().setSetup(SCRIPT, { brief: "" });
    const { result } = renderHook(() => useWriteScript());

    await act(async () => {
      expect(await result.current.write(SCRIPT)).toBe(false);
    });
    expect(rpcRequest).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/brief/i);
  });
});

describe("one write per script", () => {
  // The setup flow and the agent bridge each hold a `useWriteScript`. The
  // agent's `ui_script_write` must lock the flow's steps and refuse a second
  // paid write while the first runs.
  it("shows another caller's write and refuses a second one", async () => {
    let finish = (_answer: typeof writerAnswer): void => {};
    rpcRequest.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const flow = renderHook(() => useWriteScript(SCRIPT));
    const agent = renderHook(() => useWriteScript(SCRIPT));
    let pending: Promise<boolean>;
    act(() => {
      pending = agent.result.current.write(SCRIPT);
    });
    expect(flow.result.current.writing).toBe(true);

    let second = true;
    await act(async () => {
      second = await flow.result.current.write(SCRIPT);
    });
    expect(second).toBe(false);
    expect(flow.result.current.error).toBe(
      "This script is already being written."
    );
    expect(rpcRequest).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish(writerAnswer);
      expect(await pending).toBe(true);
    });
    expect(flow.result.current.writing).toBe(false);
  });
});
