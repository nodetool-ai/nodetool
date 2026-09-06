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
import { useScriptStore } from "../../../stores/script/ScriptStore";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import {
  clearScriptImport,
  importedFromSubtitles,
  importedFromText,
  setScriptImport
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
  clearScriptImport(SCRIPT);
  useScriptStore.setState({ scripts: {}, history: {} } as never);
  useGlobalChatStore.setState({
    selectedModel: { type: "language_model", id: "claude-sonnet-5", provider: "anthropic" }
  } as never);
  seed();
});

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

  it("keeps imported words verbatim, whatever the answer says", async () => {
    setScriptImport(SCRIPT, importedFromText(IMPORTED));
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

  it("applies a Final Draft import with no model call at all", async () => {
    setScriptImport(SCRIPT, {
      lines: [
        { text: "Are you coming or not?", speakerName: "SOPHIA" },
        { text: "Give me a minute.", speakerName: "MARCUS", direction: "flat" }
      ],
      speakers: ["SOPHIA", "MARCUS"],
      attributed: true,
      text: "Are you coming or not?\nGive me a minute."
    });
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
    setScriptImport(SCRIPT, importedFromSubtitles(parseSrt(srt)));
    const { result } = renderHook(() => useWriteScript());

    await act(async () => {
      expect(await result.current.write(SCRIPT)).toBe(true);
    });

    expect(rpcRequest).not.toHaveBeenCalled();
    expect(linesNow().map((line) => line.text)).toEqual([
      "A tide clock has one hand.",
      "It goes round once a lunar day."
    ]);
    expect(linesNow().map((line) => line.targetDurationMs)).toEqual([2750, 3750]);
    expect(scriptNow().cast.map((speaker) => speaker.name)).toEqual(["Narrator"]);
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
              { id: kept.id, speaker: "Narrator", text: "It started as a weekend build." },
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

  it("gives the import up on an explicit rewrite, keeping the review's edits", async () => {
    setScriptImport(SCRIPT, importedFromText(IMPORTED));
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
