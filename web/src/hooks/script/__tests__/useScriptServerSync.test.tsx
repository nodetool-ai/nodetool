import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { trpc, trpcClient } from "../../../trpc/client";
import { useScriptStore } from "../../../stores/script/ScriptStore";
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

  it("marks the script saved after an autosave lands", async () => {
    renderHook(() => useScriptServerSync("script-1"));

    await waitFor(() =>
      expect(useScriptStore.getState().serverRevisions["script-1"]).toBe("rev-1")
    );
    act(() => useScriptStore.getState().setTitle("script-1", "Unsaved title"));

    // The status transition rides the 750ms autosave debounce, so give waitFor
    // headroom over its 1000ms default to stay stable under CI load.
    await waitFor(
      () =>
        expect(useScriptStore.getState().saveStatus["script-1"]).toBe("saved"),
      { timeout: 3000 }
    );
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

  it("reloads and flags a conflict when the server copy moved on", async () => {
    updateMutate.mockRejectedValueOnce(
      new Error("Script was modified since last read")
    );
    renderHook(() => useScriptServerSync("script-1"));

    await waitFor(() =>
      expect(useScriptStore.getState().serverRevisions["script-1"]).toBe("rev-1")
    );
    act(() => useScriptStore.getState().setTitle("script-1", "Unsaved title"));

    await waitFor(
      () =>
        expect(useScriptStore.getState().saveStatus["script-1"]).toBe(
          "reloaded"
        ),
      { timeout: 3000 }
    );
    // The server copy is reloaded after the conflict.
    expect(getQuery).toHaveBeenCalledTimes(2);
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
});
