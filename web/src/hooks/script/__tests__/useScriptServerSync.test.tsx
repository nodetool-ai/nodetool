import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { trpc, trpcClient } from "../../../trpc/client";
import {
  lineStatus,
  useScriptStore
} from "../../../stores/script/ScriptStore";
import { handleDocumentResourceChange } from "../../../stores/documentSync";
import { useConflictStore } from "../../../stores/ConflictStore";
import { useScriptServerSync } from "../useScriptServerSync";

jest.mock("../../../trpc/client", () => ({
  trpc: { useUtils: jest.fn() },
  trpcClient: {
    scripts: {
      get: { query: jest.fn() },
      create: { mutate: jest.fn() },
      update: { mutate: jest.fn() }
    }
  }
}));

const getQuery = trpcClient.scripts.get.query as jest.Mock;
const updateMutate = trpcClient.scripts.update.mutate as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useScriptStore.setState({
    scripts: {},
    serverRevisions: {},
    saveStatus: {},
    voicingLineIds: {}
  });
  (trpc.useUtils as jest.Mock).mockReturnValue({
    scripts: { list: { invalidate: jest.fn() } }
  });
  getQuery.mockResolvedValue({
    id: "script-1",
    name: "Saved script",
    document: { cast: [], sections: [] },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "rev-1"
  });
  updateMutate.mockResolvedValue({
    id: "script-1",
    name: "Unsaved title",
    document: { cast: [], sections: [] },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "rev-2"
  });
});

describe("useScriptServerSync", () => {
  it("flushes a dirty script when its tab unmounts before the debounce fires", async () => {
    const { unmount } = renderHook(() => useScriptServerSync("script-1"));

    await waitFor(() =>
      expect(useScriptStore.getState().serverRevisions["script-1"]).toBe("rev-1")
    );
    act(() => useScriptStore.getState().setTitle("script-1", "Unsaved title"));
    unmount();

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "script-1",
        baseUpdatedAt: "rev-1",
        name: "Unsaved title"
      })
    );
  });

  it("loads the persisted storyboard back-pointer and saves it back", async () => {
    getQuery.mockResolvedValue({
      id: "script-1",
      name: "Saved script",
      document: { cast: [], sections: [] },
      storyboardId: "board-7",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "rev-1"
    });
    const { unmount } = renderHook(() => useScriptServerSync("script-1"));

    await waitFor(() =>
      expect(useScriptStore.getState().serverRevisions["script-1"]).toBe("rev-1")
    );
    // The reload case: the link is on the loaded script, not on session state.
    expect(useScriptStore.getState().scripts["script-1"]?.storyboardId).toBe(
      "board-7"
    );

    act(() => useScriptStore.getState().setTitle("script-1", "Unsaved title"));
    unmount();

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ storyboardId: "board-7" })
    );
  });

  it("marks the script saved after an autosave lands", async () => {
    renderHook(() => useScriptServerSync("script-1"));

    await waitFor(() =>
      expect(useScriptStore.getState().serverRevisions["script-1"]).toBe("rev-1")
    );
    act(() => useScriptStore.getState().setTitle("script-1", "Unsaved title"));

    // The mount load already sets "saved", so assert the autosave actually ran:
    // the update mutation fires and advances the CAS revision to the server's
    // new token. The debounce rides the 750ms timer, so give waitFor headroom
    // over its 1000ms default to stay stable under CI load.
    await waitFor(
      () => {
        expect(updateMutate).toHaveBeenCalledTimes(1);
        expect(useScriptStore.getState().serverRevisions["script-1"]).toBe(
          "rev-2"
        );
      },
      { timeout: 3000 }
    );
    expect(useScriptStore.getState().saveStatus["script-1"]).toBe("saved");
  });

  it("flags 'unsaved' immediately on edit, before the debounced save fires", async () => {
    renderHook(() => useScriptServerSync("script-1"));

    await waitFor(() =>
      expect(useScriptStore.getState().serverRevisions["script-1"]).toBe("rev-1")
    );
    act(() => useScriptStore.getState().setTitle("script-1", "Unsaved title"));

    // Set synchronously by the store subscriber, well before the 750ms save.
    expect(useScriptStore.getState().saveStatus["script-1"]).toBe("unsaved");
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("does not flash 'saved' when edits land during an in-flight save", async () => {
    // Hold the first update in flight so we can edit again mid-save.
    let resolveFirst: (value: { updatedAt: string }) => void = () => {};
    updateMutate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve as (value: { updatedAt: string }) => void;
        })
    );
    renderHook(() => useScriptServerSync("script-1"));

    await waitFor(() =>
      expect(useScriptStore.getState().serverRevisions["script-1"]).toBe("rev-1")
    );
    act(() => useScriptStore.getState().setTitle("script-1", "First"));

    // First save is now in flight.
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1), {
      timeout: 3000
    });
    expect(useScriptStore.getState().saveStatus["script-1"]).toBe("saving");

    // Edit again before the in-flight save resolves.
    act(() => useScriptStore.getState().setTitle("script-1", "Second"));
    expect(useScriptStore.getState().saveStatus["script-1"]).toBe("unsaved");

    // Resolve the first save — status must NOT become "saved" while "Second"
    // is still unsaved.
    await act(async () => {
      resolveFirst({ updatedAt: "rev-2" });
      await Promise.resolve();
    });
    expect(useScriptStore.getState().saveStatus["script-1"]).not.toBe("saved");

    // The follow-up save eventually persists "Second".
    await waitFor(
      () =>
        expect(useScriptStore.getState().saveStatus["script-1"]).toBe("saved"),
      { timeout: 3000 }
    );
    expect(updateMutate).toHaveBeenCalledTimes(2);
  });

  it("flags an error status when an autosave fails", async () => {
    updateMutate.mockRejectedValueOnce(new Error("network down"));
    renderHook(() => useScriptServerSync("script-1"));

    await waitFor(() =>
      expect(useScriptStore.getState().serverRevisions["script-1"]).toBe("rev-1")
    );
    act(() => useScriptStore.getState().setTitle("script-1", "Unsaved title"));

    await waitFor(
      () =>
        expect(useScriptStore.getState().saveStatus["script-1"]).toBe("error"),
      { timeout: 3000 }
    );
  });

  it("flags error (not stuck 'saving') when the CAS-conflict reload fails", async () => {
    updateMutate.mockRejectedValueOnce(
      new Error("Script was modified since last read")
    );
    // Mount load succeeds; the conflict-triggered reload then fails.
    getQuery.mockReset();
    getQuery
      .mockResolvedValueOnce({
        id: "script-1",
        name: "Saved script",
        document: { cast: [], sections: [] },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "rev-1"
      })
      .mockRejectedValueOnce(new Error("network down"));

    renderHook(() => useScriptServerSync("script-1"));

    await waitFor(() =>
      expect(useScriptStore.getState().serverRevisions["script-1"]).toBe("rev-1")
    );
    act(() => useScriptStore.getState().setTitle("script-1", "Unsaved title"));

    await waitFor(
      () =>
        expect(useScriptStore.getState().saveStatus["script-1"]).toBe("error"),
      { timeout: 3000 }
    );
  });

  it("retries the save instead of reloading over the draft after a conflict", async () => {
    updateMutate.mockRejectedValueOnce(
      new Error("Script was modified since last read")
    );
    renderHook(() => useScriptServerSync("script-1"));

    await waitFor(() =>
      expect(useScriptStore.getState().serverRevisions["script-1"]).toBe("rev-1")
    );
    act(() => useScriptStore.getState().setTitle("script-1", "Unsaved title"));

    // The re-read finds the revision this editor already holds, so the save
    // merely raced and is retried — the draft is never replaced.
    await waitFor(
      () => expect(updateMutate).toHaveBeenCalledTimes(2),
      { timeout: 3000 }
    );
    await waitFor(() =>
      expect(useScriptStore.getState().saveStatus["script-1"]).toBe("saved")
    );
    expect(useScriptStore.getState().scripts["script-1"]?.title).toBe(
      "Unsaved title"
    );
  });

  it("does not leave the status stuck on 'saving' when an unmount flush fails", async () => {
    updateMutate.mockRejectedValueOnce(new Error("offline"));
    const { unmount } = renderHook(() => useScriptServerSync("script-1"));

    await waitFor(() =>
      expect(useScriptStore.getState().serverRevisions["script-1"]).toBe("rev-1")
    );
    // Dirty the script, then unmount before the debounce fires so the save runs
    // as the unmount flush — which then fails.
    act(() => useScriptStore.getState().setTitle("script-1", "Unsaved title"));
    unmount();

    await waitFor(
      () =>
        expect(useScriptStore.getState().saveStatus["script-1"]).toBe("error"),
      { timeout: 3000 }
    );
  });

  it("never resends a payload the server rejected as invalid", async () => {
    jest.useFakeTimers();
    try {
      updateMutate.mockRejectedValue(
        Object.assign(new Error("Invalid input: sections is required"), {
          data: { code: "BAD_REQUEST", httpStatus: 400 }
        })
      );
      const { unmount } = renderHook(() => useScriptServerSync("script-1"));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      act(() => useScriptStore.getState().setTitle("script-1", "Rejected"));
      await act(async () => {
        jest.advanceTimersByTime(1000);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(updateMutate).toHaveBeenCalledTimes(1);

      // Ten minutes of retry windows leave the attempt count where it was.
      await act(async () => {
        jest.advanceTimersByTime(600_000);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(updateMutate).toHaveBeenCalledTimes(1);
      expect(useScriptStore.getState().saveStatus["script-1"]).toBe("error");
      unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it("bounds the retries of a transient save failure", async () => {
    jest.useFakeTimers();
    try {
      updateMutate.mockRejectedValue(new Error("Failed to fetch"));
      const { unmount } = renderHook(() => useScriptServerSync("script-1"));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      act(() => useScriptStore.getState().setTitle("script-1", "Offline"));
      for (let i = 0; i < 40; i += 1) {
        await act(async () => {
          jest.advanceTimersByTime(6_000);
          await Promise.resolve();
          await Promise.resolve();
        });
      }

      expect(updateMutate.mock.calls.length).toBeGreaterThan(1);
      expect(updateMutate.mock.calls.length).toBeLessThanOrEqual(10);
      unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it("reconciles a stale error back to saved when the script is reopened", async () => {
    // Seed a stale error left behind by a prior failed save.
    act(() => useScriptStore.getState().setSaveStatus("script-1", "error"));

    renderHook(() => useScriptServerSync("script-1"));

    // A clean load on (re)mount clears the stale error.
    await waitFor(() =>
      expect(useScriptStore.getState().saveStatus["script-1"]).toBe("saved")
    );
  });
});

describe("useScriptServerSync merge", () => {
  const line = (
    id: string,
    text: string,
    takes: { id: string }[] = [],
    currentTakeId: string | null = null
  ): Record<string, unknown> => ({
    id,
    text,
    speakerId: null,
    takes,
    currentTakeId
  });

  beforeEach(() => {
    useConflictStore.setState({ byKey: {} });
  });

  afterEach(() => {
    useConflictStore.getState().clear("script:script-1");
  });

  it("merges server-added takes into lines with dirty text — no conflict", async () => {
    const section = {
      id: "sec-1",
      lines: [line("L1", "One"), line("L2", "Two"), line("L4", "Four")]
    };
    getQuery.mockResolvedValue({
      id: "script-1",
      name: "Saved script",
      document: { cast: [], sections: [section] },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "rev-1"
    });

    const rendered = renderHook(() => useScriptServerSync("script-1"));
    await waitFor(() =>
      expect(useScriptStore.getState().serverRevisions["script-1"]).toBe("rev-1")
    );

    // The user rewrites line 4's text while voice_all runs.
    act(() =>
      useScriptStore
        .getState()
        .patchLine("script-1", "L4", { text: "Four — draft" })
    );
    expect(
      useConflictStore.getState().byKey["script:script-1"]
    ).toBeUndefined();

    // The server now holds a fresh take on every line, L4's text unchanged.
    const take = (id: string, textSnapshot: string) => ({
      id,
      assetId: `asset-${id}`,
      durationMs: 500,
      words: [],
      textSnapshot,
      voiceSnapshot: {},
      createdAt: ""
    });
    getQuery.mockResolvedValue({
      id: "script-1",
      name: "Saved script",
      document: {
        cast: [],
        sections: [
          {
            id: "sec-1",
            lines: [
              line("L1", "One", [take("t1", "One")], "t1"),
              line("L2", "Two", [take("t2", "Two")], "t2"),
              line("L4", "Four", [take("t4", "Four")], "t4")
            ]
          }
        ]
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "rev-9"
    });

    await act(async () => {
      handleDocumentResourceChange("script", {
        event: "updated",
        id: "script-1",
        updatedAt: "rev-9",
        ops: [
          { tool: "append_take", input: { line_id: "L1", take_id: "t1" } },
          { tool: "append_take", input: { line_id: "L2", take_id: "t2" } },
          { tool: "append_take", input: { line_id: "L4", take_id: "t4" } }
        ]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const draft = useScriptStore.getState().scripts["script-1"];
    const lines = draft?.sections[0]?.lines ?? [];
    expect(lines.map((l) => l.id)).toEqual(["L1", "L2", "L4"]);
    // Every line got its take; line 4 keeps the draft text and is stale.
    expect(lines.map((l) => l.takes.length)).toEqual([1, 1, 1]);
    const dirty = lines.find((l) => l.id === "L4");
    expect(dirty?.text).toBe("Four — draft");
    expect(dirty?.currentTakeId).toBe("t4");
    expect(lineStatus(dirty!, null)).toBe("stale");
    // No conflicts: takes and text are separate fields of the unit.
    expect(
      useConflictStore.getState().byKey["script:script-1"]
    ).toBeUndefined();
    // The revision rolled so autosave persists the merged document.
    expect(useScriptStore.getState().serverRevisions["script-1"]).toBe("rev-9");

    rendered.unmount();
  });

  it("takes a second external write to the same line after a first merge", async () => {
    const lines = (l4: string) => [
      line("L4", l4),
      line("L5", "Five")
    ];
    const response = (l4: string, updatedAt: string) => ({
      id: "script-1",
      name: "Saved script",
      document: { cast: [], sections: [{ id: "sec-1", lines: lines(l4) }] },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt
    });

    getQuery.mockResolvedValue(response("Four", "rev-1"));
    const rendered = renderHook(() => useScriptServerSync("script-1"));
    await waitFor(() =>
      expect(useScriptStore.getState().serverRevisions["script-1"]).toBe("rev-1")
    );

    // The user is still editing line 5.
    act(() =>
      useScriptStore
        .getState()
        .patchLine("script-1", "L5", { text: "Five — draft" })
    );

    const externalWrite = async (text: string, rev: string): Promise<void> => {
      getQuery.mockResolvedValue(response(text, rev));
      await act(async () => {
        handleDocumentResourceChange("script", {
          event: "updated",
          id: "script-1",
          updatedAt: rev,
          ops: [{ tool: "set_line_text", input: { line_id: "L4", text } }]
        });
        await Promise.resolve();
        await Promise.resolve();
      });
    };

    await externalWrite("Four — agent 1", "rev-9");
    expect(useConflictStore.getState().byKey["script:script-1"]).toBeUndefined();

    // Second write on the same line: the base must have rolled to the server
    // copy, or this reads as "both changed" and the draft refuses it.
    await externalWrite("Four — agent 2", "rev-10");

    const merged = useScriptStore.getState().scripts["script-1"];
    const mergedLines = merged?.sections[0]?.lines ?? [];
    expect(mergedLines.find((l) => l.id === "L4")?.text).toBe("Four — agent 2");
    expect(mergedLines.find((l) => l.id === "L5")?.text).toBe("Five — draft");
    expect(
      useConflictStore.getState().byKey["script:script-1"]?.conflicts ?? []
    ).toEqual([]);
    expect(useScriptStore.getState().serverRevisions["script-1"]).toBe("rev-10");

    rendered.unmount();
  });

  it("keeps the draft text and lists a conflict when the same line is rewritten", async () => {
    getQuery.mockResolvedValue({
      id: "script-1",
      name: "Saved script",
      document: { cast: [], sections: [{ id: "sec-1", lines: [line("L4", "Four")] }] },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "rev-1"
    });

    const rendered = renderHook(() => useScriptServerSync("script-1"));
    await waitFor(() =>
      expect(useScriptStore.getState().serverRevisions["script-1"]).toBe("rev-1")
    );

    act(() =>
      useScriptStore
        .getState()
        .patchLine("script-1", "L4", { text: "Four — draft" })
    );

    getQuery.mockResolvedValue({
      id: "script-1",
      name: "Saved script",
      document: {
        cast: [],
        sections: [{ id: "sec-1", lines: [line("L4", "Four — agent")] }]
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "rev-9"
    });

    await act(async () => {
      handleDocumentResourceChange("script", {
        event: "updated",
        id: "script-1",
        updatedAt: "rev-9",
        ops: [{ tool: "set_line_text", input: { line_id: "L4", text: "Four — agent" } }]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Draft wins; the refused value is offered.
    expect(
      useScriptStore.getState().scripts["script-1"]?.sections[0]?.lines[0]?.text
    ).toBe("Four — draft");
    const conflicts =
      useConflictStore.getState().byKey["script:script-1"]?.conflicts ?? [];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ reason: "edited" });

    // Accepting is an undoable user edit through patchLine.
    act(() => useConflictStore.getState().accept("script:script-1", conflicts[0].unit.id));
    expect(
      useScriptStore.getState().scripts["script-1"]?.sections[0]?.lines[0]?.text
    ).toBe("Four — agent");
    const historyLen =
      useScriptStore.getState().history["script-1"]?.past.length ?? 0;
    expect(historyLen).toBeGreaterThan(0);

    rendered.unmount();
  });

  it("accepts one line conflict without replacing its siblings' drafts", async () => {
    getQuery.mockResolvedValue({
      id: "script-1",
      name: "Saved script",
      document: {
        cast: [],
        sections: [{ id: "sec-1", lines: [line("L1", "One"), line("L2", "Two")] }]
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "rev-1"
    });

    const rendered = renderHook(() => useScriptServerSync("script-1"));
    await waitFor(() =>
      expect(useScriptStore.getState().serverRevisions["script-1"]).toBe("rev-1")
    );

    // The user rewrites L1 while an agent rewrites BOTH lines.
    act(() =>
      useScriptStore
        .getState()
        .patchLine("script-1", "L1", { text: "One — draft" })
    );

    getQuery.mockResolvedValue({
      id: "script-1",
      name: "Saved script",
      document: {
        cast: [],
        sections: [
          {
            id: "sec-1",
            lines: [line("L1", "One — agent"), line("L2", "Two — agent")]
          }
        ]
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "rev-9"
    });

    await act(async () => {
      handleDocumentResourceChange("script", {
        event: "updated",
        id: "script-1",
        updatedAt: "rev-9",
        ops: [
          { tool: "set_line_text", input: { line_id: "L1" } },
          { tool: "set_line_text", input: { line_id: "L2" } }
        ]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // One conflict, at LINE granularity.
    const conflicts =
      useConflictStore.getState().byKey["script:script-1"]?.conflicts ?? [];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ unit: { kind: "line", id: "L1" } });
    const linesAfterMerge = () =>
      useScriptStore.getState().scripts["script-1"]?.sections[0]?.lines ?? [];
    expect(linesAfterMerge().find((l) => l.id === "L2")?.text).toBe(
      "Two — agent"
    );

    // Accepting the L1 offer must not touch L2 or any other line's state
    // beyond that one line.
    const l2Before = linesAfterMerge().find((l) => l.id === "L2");
    act(() =>
      useConflictStore.getState().accept("script:script-1", conflicts[0].unit.id)
    );
    const linesAfterAccept = linesAfterMerge();
    expect(linesAfterAccept.find((l) => l.id === "L1")?.text).toBe(
      "One — agent"
    );
    expect(linesAfterAccept.find((l) => l.id === "L2")).toBe(l2Before);

    rendered.unmount();
  });
});

describe("useScriptServerSync — notices that arrive during an in-flight save", () => {
  const line = (id: string, text: string): Record<string, unknown> => ({
    id,
    text,
    speakerId: null,
    takes: [],
    currentTakeId: null
  });

  const response = (
    lines: Record<string, unknown>[],
    updatedAt: string
  ): Record<string, unknown> => ({
    id: "script-1",
    name: "Saved script",
    document: { cast: [], sections: [{ id: "sec-1", lines }] },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt
  });

  const conflicts = () =>
    useConflictStore.getState().byKey["script:script-1"]?.conflicts ?? [];

  /** Mount, load, and hold the next save open so notices land mid-flight. */
  const mountWithHeldSave = async (
    lines: Record<string, unknown>[]
  ): Promise<{
    rendered: ReturnType<typeof renderHook>;
    settle: {
      resolve: (value: unknown) => void;
      reject: (error: unknown) => void;
    };
  }> => {
    getQuery.mockResolvedValue(response(lines, "rev-1"));
    const rendered = renderHook(() => useScriptServerSync("script-1"));
    await waitFor(() =>
      expect(useScriptStore.getState().serverRevisions["script-1"]).toBe("rev-1")
    );
    const settle: {
      resolve: (value: unknown) => void;
      reject: (error: unknown) => void;
    } = { resolve: () => {}, reject: () => {} };
    updateMutate.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          settle.resolve = resolve;
          settle.reject = reject;
        })
    );
    return { rendered, settle };
  };

  beforeEach(() => {
    useConflictStore.setState({ byKey: {} });
  });

  afterEach(() => {
    useConflictStore.getState().clear("script:script-1");
  });

  it("keeps the draft when an external write lands mid-save and the CAS fails", async () => {
    const { rendered, settle } = await mountWithHeldSave([
      line("L1", "One"),
      line("L2", "Two")
    ]);

    act(() =>
      useScriptStore.getState().patchLine("script-1", "L2", { text: "Two — draft" })
    );
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1), {
      timeout: 3000
    });

    // The agent rewrites L1 while our save is in flight.
    getQuery.mockResolvedValue(
      response([line("L1", "One — agent"), line("L2", "Two")], "rev-9")
    );
    act(() => {
      handleDocumentResourceChange("script", {
        event: "updated",
        id: "script-1",
        updatedAt: "rev-9",
        ops: [{ tool: "set_line_text", input: { line_id: "L1" } }]
      });
    });
    // Our save then loses the CAS to that write.
    await act(async () => {
      settle.reject(new Error("Script was modified since last read"));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(useScriptStore.getState().serverRevisions["script-1"]).toBe("rev-9")
    );

    const lines =
      useScriptStore.getState().scripts["script-1"]?.sections[0]?.lines ?? [];
    expect(lines.find((l) => l.id === "L2")?.text).toBe("Two — draft");
    expect(lines.find((l) => l.id === "L1")?.text).toBe("One — agent");
    expect(conflicts()).toEqual([]);
    // The draft is saved again on the merged revision, not reloaded over.
    await waitFor(
      () =>
        expect(updateMutate).toHaveBeenLastCalledWith(
          expect.objectContaining({ baseUpdatedAt: "rev-9" })
        ),
      { timeout: 3000 }
    );

    rendered.unmount();
  });

  it("does not swallow a foreign no-ops write that arrives mid-save", async () => {
    const { rendered, settle } = await mountWithHeldSave([line("L1", "One")]);

    act(() =>
      useScriptStore.getState().patchLine("script-1", "L1", { text: "One — draft" })
    );
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1), {
      timeout: 3000
    });

    // Another tab autosaved the whole document: no ops to attribute.
    getQuery.mockResolvedValue(response([line("L1", "One — other tab")], "rev-9"));
    act(() => {
      handleDocumentResourceChange("script", {
        event: "updated",
        id: "script-1",
        updatedAt: "rev-9"
      });
    });
    await act(async () => {
      settle.reject(new Error("Script was modified since last read"));
      await Promise.resolve();
    });

    await waitFor(() => expect(conflicts()).toHaveLength(1));
    expect(conflicts()[0]).toMatchObject({ reason: "replaced" });
    expect(
      useScriptStore.getState().scripts["script-1"]?.sections[0]?.lines[0]?.text
    ).toBe("One — draft");

    rendered.unmount();
  });

  it("ignores our own save echo that arrives before its response", async () => {
    const { rendered, settle } = await mountWithHeldSave([line("L1", "One")]);

    act(() =>
      useScriptStore.getState().patchLine("script-1", "L1", { text: "One — draft" })
    );
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1), {
      timeout: 3000
    });

    // The broadcast of our own write overtakes its response, and the user
    // keeps typing meanwhile.
    act(() => {
      handleDocumentResourceChange("script", {
        event: "updated",
        id: "script-1",
        updatedAt: "rev-2"
      });
    });
    act(() =>
      useScriptStore.getState().patchLine("script-1", "L1", { text: "One — draft!" })
    );
    await act(async () => {
      settle.resolve({
        id: "script-1",
        name: "Saved script",
        document: { cast: [], sections: [] },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "rev-2"
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(conflicts()).toEqual([]);
    // No merge fetch: the only get was the initial load.
    expect(getQuery).toHaveBeenCalledTimes(1);
    expect(
      useScriptStore.getState().scripts["script-1"]?.sections[0]?.lines[0]?.text
    ).toBe("One — draft!");

    rendered.unmount();
  });
});
