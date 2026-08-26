import { renderHook, waitFor } from "@testing-library/react";
import type { DocumentLoadState } from "../../../stores/documentSync";
import { handleDocumentResourceChange } from "../../../stores/documentSync";
import { act } from "react";
import { trpc, trpcClient } from "../../../trpc/client";
import {
  emptyJsScriptDocument,
  useJsScriptStore
} from "../../../stores/jsScript/JsScriptStore";
import { useConflictStore } from "../../../stores/ConflictStore";
import { useJsScriptServerSync } from "../useJsScriptServerSync";
import { flushJsScriptSave } from "../jsScriptSaveRegistry";

jest.mock("../../../trpc/client", () => ({
  trpc: { useUtils: jest.fn() },
  trpcClient: {
    jsScripts: {
      get: { query: jest.fn() },
      create: { mutate: jest.fn() },
      update: { mutate: jest.fn() }
    }
  }
}));

const getQuery = trpcClient.jsScripts.get.query as jest.Mock;
const createMutate = trpcClient.jsScripts.create.mutate as jest.Mock;
const updateMutate = trpcClient.jsScripts.update.mutate as jest.Mock;

const serverScript = (updatedAt: string) => ({
  id: "js-1",
  projectId: "default",
  name: "Saved script",
  document: emptyJsScriptDocument(),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt
});

beforeEach(() => {
  jest.clearAllMocks();
  useJsScriptStore.setState({
    scripts: {},
    serverRevisions: {},
    saveStatus: {},
    lastRun: {},
    lastTest: {},
    running: {},
    history: {}
  });
  (trpc.useUtils as jest.Mock).mockReturnValue({
    jsScripts: { list: { invalidate: jest.fn() } }
  });
  getQuery.mockResolvedValue(serverScript("rev-1"));
  createMutate.mockResolvedValue(serverScript("rev-1"));
  updateMutate.mockResolvedValue(serverScript("rev-2"));
});

const loaded = async (): Promise<void> => {
  await waitFor(() =>
    expect(useJsScriptStore.getState().serverRevisions["js-1"]).toBe("rev-1")
  );
};

/** Mount the hook and wait for the initial load to record a server revision. */
const mountLoaded = async (): Promise<
  ReturnType<typeof renderHook<DocumentLoadState, unknown>>
> => {
  const rendered = renderHook(() => useJsScriptServerSync("js-1"));
  await loaded();
  return rendered;
};

describe("useJsScriptServerSync", () => {
  it("loads the server document into the store on mount", async () => {
    renderHook(() => useJsScriptServerSync("js-1"));
    await loaded();
    expect(useJsScriptStore.getState().scripts["js-1"]?.name).toBe(
      "Saved script"
    );
  });

  it("creates the script when the server does not know it yet", async () => {
    getQuery.mockRejectedValueOnce(new Error("JS script not found"));
    renderHook(() => useJsScriptServerSync("js-1"));
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "js-1" })
    );
  });

  it("flags 'unsaved' immediately on edit, before the debounced save fires", async () => {
    renderHook(() => useJsScriptServerSync("js-1"));
    await loaded();
    act(() => useJsScriptStore.getState().setCode("js-1", "emit('a', 1)"));

    expect(useJsScriptStore.getState().saveStatus["js-1"]).toBe("unsaved");
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("autosaves with the CAS token and advances the revision", async () => {
    renderHook(() => useJsScriptServerSync("js-1"));
    await loaded();
    act(() => useJsScriptStore.getState().setCode("js-1", "emit('a', 1)"));

    // The debounce rides the 750ms timer, so give waitFor headroom over its
    // 1000ms default to stay stable under CI load.
    await waitFor(
      () => {
        expect(updateMutate).toHaveBeenCalledTimes(1);
        expect(useJsScriptStore.getState().serverRevisions["js-1"]).toBe(
          "rev-2"
        );
      },
      { timeout: 3000 }
    );
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "js-1", baseUpdatedAt: "rev-1" })
    );
    expect(useJsScriptStore.getState().saveStatus["js-1"]).toBe("saved");
  });

  it("flushes a dirty script when its tab unmounts before the debounce fires", async () => {
    const { unmount } = renderHook(() => useJsScriptServerSync("js-1"));
    await loaded();
    act(() => useJsScriptStore.getState().setName("js-1", "Renamed"));
    unmount();

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Renamed" })
    );
  });

  it("reloads the server copy when the save loses a CAS conflict", async () => {
    updateMutate.mockRejectedValueOnce(
      new Error("JS script was modified since last read")
    );
    getQuery
      .mockResolvedValueOnce(serverScript("rev-1"))
      .mockResolvedValueOnce({
        ...serverScript("rev-9"),
        name: "Won the race"
      });

    renderHook(() => useJsScriptServerSync("js-1"));
    await loaded();
    act(() => useJsScriptStore.getState().setCode("js-1", "emit('a', 1)"));

    await waitFor(
      () =>
        expect(useJsScriptStore.getState().saveStatus["js-1"]).toBe("reloaded"),
      { timeout: 3000 }
    );
    expect(useJsScriptStore.getState().scripts["js-1"]?.name).toBe(
      "Won the race"
    );
    expect(useJsScriptStore.getState().serverRevisions["js-1"]).toBe("rev-9");
  });

  it("flags an error status when an autosave fails for another reason", async () => {
    updateMutate.mockRejectedValueOnce(new Error("network down"));
    renderHook(() => useJsScriptServerSync("js-1"));
    await loaded();
    act(() => useJsScriptStore.getState().setCode("js-1", "emit('a', 1)"));

    await waitFor(
      () => expect(useJsScriptStore.getState().saveStatus["js-1"]).toBe("error"),
      { timeout: 3000 }
    );
  });
});

describe("flushJsScriptSave", () => {
  it("resolves ok with a null revision when no saver is registered", async () => {
    await expect(flushJsScriptSave("unknown-script")).resolves.toEqual({
      ok: true,
      updatedAt: null
    });
  });

  it("saves a pending edit immediately and reports the new revision", async () => {
    const rendered = await mountLoaded();

    act(() =>
      useJsScriptStore.getState().setCode("js-1", "await output('n', 1)")
    );
    expect(updateMutate).not.toHaveBeenCalled();

    const result = await flushJsScriptSave("js-1");
    expect(result).toEqual({ ok: true, updatedAt: "rev-2" });
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "js-1", baseUpdatedAt: "rev-1" })
    );
    rendered.unmount();
  });

  it("reports the current revision when nothing is dirty", async () => {
    const rendered = await mountLoaded();

    await expect(flushJsScriptSave("js-1")).resolves.toEqual({
      ok: true,
      updatedAt: "rev-1"
    });
    expect(updateMutate).not.toHaveBeenCalled();
    rendered.unmount();
  });

  it("resolves not-ok with the message when the save is rejected", async () => {
    updateMutate.mockRejectedValue(
      new Error("Invalid input: document.code is required")
    );
    const rendered = await mountLoaded();

    act(() => useJsScriptStore.getState().setCode("js-1", "bad"));
    const result = await flushJsScriptSave("js-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/document\.code/);
    }
    rendered.unmount();
  });

  it("does not launch overlapping saves for concurrent flushes", async () => {
    const rendered = await mountLoaded();

    let resolveSave: (value: { updatedAt: string }) => void = () => {};
    updateMutate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve as (value: { updatedAt: string }) => void;
        })
    );

    act(() =>
      useJsScriptStore.getState().setCode("js-1", "await output('n', 1)")
    );
    const first = flushJsScriptSave("js-1");
    const second = flushJsScriptSave("js-1");
    await act(async () => {
      await Promise.resolve();
      resolveSave({ updatedAt: "rev-2" });
      await Promise.resolve();
    });

    await expect(first).resolves.toEqual({ ok: true, updatedAt: "rev-2" });
    await expect(second).resolves.toEqual({ ok: true, updatedAt: "rev-2" });
    expect(updateMutate).toHaveBeenCalledTimes(1);
    rendered.unmount();
  });

  it("stops answering for a script whose hook unmounted", async () => {
    const rendered = await mountLoaded();
    rendered.unmount();

    await expect(flushJsScriptSave("js-1")).resolves.toEqual({
      ok: true,
      updatedAt: null
    });
  });
});

describe("useJsScriptServerSync merge", () => {
  const withCodeAndTests = (
    code: string,
    tests: { name: string }[]
  ): Record<string, unknown> => {
    const doc = emptyJsScriptDocument();
    doc.code = code;
    doc.tests = tests as never;
    return { ...doc } as Record<string, unknown>;
  };

  beforeEach(() => {
    useConflictStore.setState({ byKey: {} });
  });

  afterEach(() => {
    useConflictStore.getState().clear("jsscript:js-1");
  });

  it("merges external set_tests into a dirty body — code kept, no conflict", async () => {
    getQuery.mockResolvedValue({
      ...serverScript("rev-1"),
      document: withCodeAndTests("return 1;", [])
    });
    renderHook(() => useJsScriptServerSync("js-1"));
    await loaded();

    // The user edits the body; the draft is dirty.
    act(() => useJsScriptStore.getState().setCode("js-1", "return 2; // draft"));

    // An agent saved new tests alongside the old code.
    getQuery.mockResolvedValue({
      ...serverScript("rev-9"),
      document: withCodeAndTests("return 1;", [
        { name: "adds-one" }
      ] as never)
    });

    await act(async () => {
      handleDocumentResourceChange("jsscript", {
        event: "updated",
        id: "js-1",
        updatedAt: "rev-9",
        ops: [{ tool: "set_tests", input: {} }]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const entry = useJsScriptStore.getState().scripts["js-1"];
    expect(entry?.name).toBe("Saved script");
    expect(entry?.document.code).toBe("return 2; // draft");
    expect(entry?.document.tests).toHaveLength(1);
    expect(entry?.document.tests[0]?.name).toBe("adds-one");
    expect(
      useConflictStore.getState().byKey["jsscript:js-1"]
    ).toBeUndefined();
    // The revision rolled so autosave persists the merged document.
    expect(useJsScriptStore.getState().serverRevisions["js-1"]).toBe("rev-9");
  });

  it("keeps the dirty code and lists one conflict when the body was rewritten", async () => {
    getQuery.mockResolvedValue({
      ...serverScript("rev-1"),
      document: withCodeAndTests("return 1;", [])
    });
    renderHook(() => useJsScriptServerSync("js-1"));
    await loaded();

    act(() => useJsScriptStore.getState().setCode("js-1", "return 2; // draft"));

    getQuery.mockResolvedValue({
      ...serverScript("rev-9"),
      document: withCodeAndTests("return 'agent';", [])
    });

    await act(async () => {
      handleDocumentResourceChange("jsscript", {
        event: "updated",
        id: "js-1",
        updatedAt: "rev-9",
        ops: [{ tool: "set_code", input: {} }]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      useJsScriptStore.getState().scripts["js-1"]?.document.code
    ).toBe("return 2; // draft");
    const conflicts =
      useConflictStore.getState().byKey["jsscript:js-1"]?.conflicts ?? [];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      reason: "edited",
      unit: { kind: "field", id: "code" },
      external: "return 'agent';",
      draft: "return 2; // draft"
    });
  });

  it("accepts a whole-document replacement with the server's own name", async () => {
    getQuery.mockResolvedValue({
      ...serverScript("rev-1"),
      document: withCodeAndTests("return 1;", [])
    });
    renderHook(() => useJsScriptServerSync("js-1"));
    await loaded();

    act(() => useJsScriptStore.getState().setCode("js-1", "return 2; // draft"));

    // Another tab saved a rename and a new body, attaching no ops.
    getQuery.mockResolvedValue({
      ...serverScript("rev-9"),
      name: "Renamed elsewhere",
      document: withCodeAndTests("return 'other tab';", [])
    });

    await act(async () => {
      handleDocumentResourceChange("jsscript", {
        event: "updated",
        id: "js-1",
        updatedAt: "rev-9"
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const conflicts =
      useConflictStore.getState().byKey["jsscript:js-1"]?.conflicts ?? [];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toBe("replaced");

    act(() =>
      useConflictStore
        .getState()
        .accept("jsscript:js-1", conflicts[0].unit.id)
    );

    const entry = useJsScriptStore.getState().scripts["js-1"];
    // Accept takes the server ENTRY: its rename came with its body.
    expect(entry?.name).toBe("Renamed elsewhere");
    expect(entry?.document.code).toBe("return 'other tab';");
  });

  it("rolls the store's CAS token when an unattributed write lands mid-save", async () => {
    let resolveSave: (value: { updatedAt: string }) => void = () => {};
    updateMutate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve as (value: { updatedAt: string }) => void;
        })
    );

    renderHook(() => useJsScriptServerSync("js-1"));
    await loaded();
    act(() => useJsScriptStore.getState().setCode("js-1", "return 2;"));

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1), {
      timeout: 3000
    });

    // A no-ops notice arrives while that save is still in flight.
    await act(async () => {
      handleDocumentResourceChange("jsscript", {
        event: "updated",
        id: "js-1",
        updatedAt: "rev-42"
      });
      await Promise.resolve();
    });

    // The token the next save reads lives in the store, not only in the ref.
    expect(useJsScriptStore.getState().serverRevisions["js-1"]).toBe("rev-42");
    await act(async () => {
      resolveSave({ updatedAt: "rev-2" });
      await Promise.resolve();
    });
  });

  it("saves the merged document with the rolled token after a merge", async () => {
    getQuery.mockResolvedValue({
      ...serverScript("rev-1"),
      document: withCodeAndTests("return 1;", [])
    });
    renderHook(() => useJsScriptServerSync("js-1"));
    await loaded();

    act(() => useJsScriptStore.getState().setCode("js-1", "return 2; // draft"));

    getQuery.mockResolvedValue({
      ...serverScript("rev-9"),
      name: "Renamed elsewhere",
      document: withCodeAndTests("return 1;", [{ name: "adds-one" }] as never)
    });

    await act(async () => {
      handleDocumentResourceChange("jsscript", {
        event: "updated",
        id: "js-1",
        updatedAt: "rev-9",
        ops: [{ tool: "set_tests", input: {} }]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await flushJsScriptSave("js-1");
    });

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "js-1",
        baseUpdatedAt: "rev-9",
        name: "Renamed elsewhere",
        document: expect.objectContaining({ code: "return 2; // draft" })
      })
    );
  });
});
