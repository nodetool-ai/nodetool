import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { trpc, trpcClient } from "../../../trpc/client";
import {
  emptyJsScriptDocument,
  useJsScriptStore
} from "../../../stores/jsScript/JsScriptStore";
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
  ReturnType<typeof renderHook<void, unknown>>
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
