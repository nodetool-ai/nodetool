import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { trpc, trpcClient } from "../../../trpc/client";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { useStoryboardServerSync } from "../useStoryboardServerSync";
import { flushStoryboardSave } from "../storyboardSaveRegistry";

jest.mock("../../../trpc/client", () => ({
  trpc: { useUtils: jest.fn() },
  trpcClient: {
    storyboards: {
      get: { query: jest.fn() },
      create: { mutate: jest.fn() },
      update: { mutate: jest.fn() }
    }
  }
}));

const getQuery = trpcClient.storyboards.get.query as jest.Mock;
const updateMutate = trpcClient.storyboards.update.mutate as jest.Mock;

const emptyDocument = {
  screenplay: null,
  shots: [],
  brief: "",
  style: "",
  entityIds: [],
  aspectRatio: "16:9",
  directorModel: null,
  imageModel: null,
  videoModel: null
};

/** A tRPC input-validation rejection: 400 BAD_REQUEST, never retryable. */
const validationError = (): Error =>
  Object.assign(new Error("Invalid input: shots.0.action is required"), {
    data: { code: "BAD_REQUEST", httpStatus: 400 }
  });

const errorNotifications = (): string[] =>
  useNotificationStore
    .getState()
    .notifications.filter((n) => n.type === "error")
    .map((n) => n.content);

beforeEach(() => {
  jest.clearAllMocks();
  useStoryboardStore.setState({ boards: {}, serverRevisions: {}, history: {} });
  useNotificationStore.setState({ notifications: [] });
  (trpc.useUtils as jest.Mock).mockReturnValue({
    storyboards: { list: { invalidate: jest.fn() } }
  });
  getQuery.mockResolvedValue({
    id: "board-1",
    name: "Saved board",
    document: emptyDocument,
    timelineId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "rev-1"
  });
  updateMutate.mockResolvedValue({
    id: "board-1",
    name: "Unsaved title",
    document: emptyDocument,
    timelineId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "rev-2"
  });
});

/** Mount the hook and wait for the initial load to record a server revision. */
const mountLoaded = async (): Promise<
  ReturnType<typeof renderHook<void, unknown>>
> => {
  const rendered = renderHook(() => useStoryboardServerSync("board-1"));
  await waitFor(() =>
    expect(useStoryboardStore.getState().serverRevisions["board-1"]).toBe(
      "rev-1"
    )
  );
  return rendered as ReturnType<typeof renderHook<void, unknown>>;
};

describe("useStoryboardServerSync — a rejected save must not fail silently", () => {
  it("reports a validation rejection to the user and stops retrying", async () => {
    jest.useFakeTimers();
    try {
      updateMutate.mockRejectedValue(validationError());
      const rendered = renderHook(() => useStoryboardServerSync("board-1"));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(useStoryboardStore.getState().serverRevisions["board-1"]).toBe(
        "rev-1"
      );

      act(() =>
        useStoryboardStore.getState().setTitle("board-1", "Eleven shots")
      );
      await act(async () => {
        jest.advanceTimersByTime(1000);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(updateMutate).toHaveBeenCalledTimes(1);

      // Ten minutes of retry windows: a permanently invalid payload must not
      // be resent, and the user must have been told.
      await act(async () => {
        jest.advanceTimersByTime(600_000);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(updateMutate).toHaveBeenCalledTimes(1);
      expect(errorNotifications().join(" ")).toMatch(/storyboard/i);

      // The local edit stays in the store — nothing is discarded.
      expect(useStoryboardStore.getState().boards["board-1"]?.title).toBe(
        "Eleven shots"
      );
      rendered.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it("bounds the retries of a transient failure and then tells the user", async () => {
    jest.useFakeTimers();
    try {
      updateMutate.mockRejectedValue(new Error("Failed to fetch"));
      const rendered = renderHook(() => useStoryboardServerSync("board-1"));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      act(() => useStoryboardStore.getState().setTitle("board-1", "Dirty"));
      // Drive far past any bounded retry budget.
      for (let i = 0; i < 40; i += 1) {
        await act(async () => {
          jest.advanceTimersByTime(6_000);
          await Promise.resolve();
          await Promise.resolve();
        });
      }

      const attempts = updateMutate.mock.calls.length;
      expect(attempts).toBeGreaterThan(1);
      expect(attempts).toBeLessThanOrEqual(10);
      expect(errorNotifications().join(" ")).toMatch(/storyboard/i);
      rendered.unmount();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("flushStoryboardSave", () => {
  it("resolves ok with a null revision when no saver is registered", async () => {
    await expect(flushStoryboardSave("unknown-board")).resolves.toEqual({
      ok: true,
      updatedAt: null
    });
  });

  it("saves a pending edit immediately and reports the new revision", async () => {
    const rendered = await mountLoaded();

    act(() => useStoryboardStore.getState().setTitle("board-1", "Flushed"));
    // Well inside the debounce window: nothing has been sent yet.
    expect(updateMutate).not.toHaveBeenCalled();

    const result = await flushStoryboardSave("board-1");
    expect(result).toEqual({ ok: true, updatedAt: "rev-2" });
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "board-1", baseUpdatedAt: "rev-1" })
    );
    rendered.unmount();
  });

  it("reports the current revision when nothing is dirty", async () => {
    const rendered = await mountLoaded();

    await expect(flushStoryboardSave("board-1")).resolves.toEqual({
      ok: true,
      updatedAt: "rev-1"
    });
    expect(updateMutate).not.toHaveBeenCalled();
    rendered.unmount();
  });

  it("resolves not-ok with the message when the save is rejected", async () => {
    updateMutate.mockRejectedValue(validationError());
    const rendered = await mountLoaded();

    act(() => useStoryboardStore.getState().setTitle("board-1", "Bad"));
    const result = await flushStoryboardSave("board-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/shots\.0\.action/);
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

    act(() => useStoryboardStore.getState().setTitle("board-1", "Concurrent"));
    const first = flushStoryboardSave("board-1");
    const second = flushStoryboardSave("board-1");
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

  it("stops answering for a board whose hook unmounted", async () => {
    const rendered = await mountLoaded();
    rendered.unmount();

    await expect(flushStoryboardSave("board-1")).resolves.toEqual({
      ok: true,
      updatedAt: null
    });
  });
});
