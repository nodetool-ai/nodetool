import { renderHook, waitFor } from "@testing-library/react";
import type { DocumentLoadState } from "../../../stores/documentSync";
import { handleDocumentResourceChange } from "../../../stores/documentSync";
import { act } from "react";
import { trpc, trpcClient } from "../../../trpc/client";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useConflictStore } from "../../../stores/ConflictStore";
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
  setupStage: "done",
  genre: "",
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
  ReturnType<typeof renderHook<DocumentLoadState, unknown>>
> => {
  const rendered = renderHook(() => useStoryboardServerSync("board-1"));
  await waitFor(() =>
    expect(useStoryboardStore.getState().serverRevisions["board-1"]).toBe(
      "rev-1"
    )
  );
  return rendered;
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

describe("useStoryboardServerSync — external changes merge into a dirty draft", () => {
  const shot = (
    id: string,
    index: number,
    action: string
  ): Record<string, unknown> => ({
    type: "shot",
    id,
    index,
    action,
    status: "planned"
  });

  const docWith = (shots: Record<string, unknown>[]) => ({
    ...emptyDocument,
    shots
  });

  const serverResponse = (
    document: unknown,
    updatedAt = "rev-1"
  ): Record<string, unknown> => ({
    id: "board-1",
    name: "Saved board",
    document,
    timelineId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt
  });

  const conflictsFor = (): string[] =>
    (useConflictStore.getState().byKey["storyboard:board-1"]?.conflicts ?? []).map(
      (c) => c.unit.id
    );

  beforeEach(() => {
    useConflictStore.setState({ byKey: {} });
  });

  it("merges an untouched agent write while shot text is dirty — no conflict", async () => {
    getQuery.mockResolvedValue(
      serverResponse(docWith([shot("s1", 0, "One"), shot("s2", 1, "Two"), shot("s3", 2, "Three")]))
    );
    const rendered = await mountLoaded();

    // The user rewrites shot 3's action; the draft is now dirty.
    act(() =>
      useStoryboardStore
        .getState()
        .updateShot("board-1", "s3", { action: "Three — draft" })
    );
    const historyLenBefore =
      useStoryboardStore.getState().history["board-1"]?.past.length ?? 0;
    expect(useConflictStore.getState().byKey["storyboard:board-1"]).toBeUndefined();

    // The agent lands a keyframe on shot 2 and the board is saved elsewhere.
    getQuery.mockResolvedValue(
      serverResponse(
        docWith([
          shot("s1", 0, "One"),
          {
            ...shot("s2", 1, "Two"),
            status: "keyframe_ready"
          },
          shot("s3", 2, "Three")
        ]),
        "rev-9"
      )
    );
    await act(async () => {
      handleDocumentResourceChange("storyboard", {
        event: "updated",
        id: "board-1",
        updatedAt: "rev-9",
        ops: [{ tool: "update_shot", input: { target: "s2" } }]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const shots = useStoryboardStore.getState().boards["board-1"]?.shots ?? [];
    expect(shots.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(shots.find((s) => s.id === "s2")?.status).toBe("keyframe_ready");
    expect(shots.find((s) => s.id === "s3")?.action).toBe("Three — draft");
    expect(conflictsFor()).toEqual([]);
    // The merged external change never enters the undo stack: the only
    // checkpoint is the user's own edit from before the merge.
    expect(useStoryboardStore.getState().history["board-1"]?.past ?? []).toHaveLength(
      historyLenBefore
    );
    // The revision rolled, so the next autosave saves the merged board.
    expect(useStoryboardStore.getState().serverRevisions["board-1"]).toBe("rev-9");

    rendered.unmount();
    useConflictStore.getState().clear("storyboard:board-1");
  });

  it("keeps the draft text and lists a conflict when the same shot is rewritten", async () => {
    getQuery.mockResolvedValue(
      serverResponse(docWith([shot("s1", 0, "One"), shot("s3", 1, "Three")]))
    );
    const rendered = await mountLoaded();

    act(() =>
      useStoryboardStore
        .getState()
        .updateShot("board-1", "s3", { action: "Three — draft" })
    );

    getQuery.mockResolvedValue(
      serverResponse(
        docWith([shot("s1", 0, "One"), shot("s3", 1, "Three — rewritten by agent")]),
        "rev-9"
      )
    );
    await act(async () => {
      handleDocumentResourceChange("storyboard", {
        event: "updated",
        id: "board-1",
        updatedAt: "rev-9",
        ops: [{ tool: "update_shot", input: { target: "s3" } }]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const state = useStoryboardStore.getState();
    expect(
      state.boards["board-1"]?.shots.find((s) => s.id === "s3")?.action
    ).toBe("Three — draft");
    expect(conflictsFor()).toEqual(["s3"]);

    // Accepting the external value is an undoable user edit.
    act(() => useConflictStore.getState().accept("storyboard:board-1", "s3"));
    expect(conflictsFor()).toEqual([]);
    expect(
      useStoryboardStore.getState().boards["board-1"]?.shots.find((s) => s.id === "s3")
        ?.action
    ).toBe("Three — rewritten by agent");
    expect(
      useStoryboardStore.getState().history["board-1"]?.past.length ?? 0
    ).toBeGreaterThan(0);

    rendered.unmount();
    useConflictStore.getState().clear("storyboard:board-1");
  });

  it("treats a write with no ops as a whole-document replacement offer", async () => {
    getQuery.mockResolvedValue(serverResponse(docWith([shot("s1", 0, "One")])));
    const rendered = await mountLoaded();

    act(() =>
      useStoryboardStore.getState().updateShot("board-1", "s1", { action: "draft" })
    );

    getQuery.mockResolvedValue(
      serverResponse(docWith([shot("s1", 0, "One"), shot("s2", 1, "From CLI")]), "rev-9")
    );
    await act(async () => {
      handleDocumentResourceChange("storyboard", {
        event: "updated",
        id: "board-1",
        updatedAt: "rev-9"
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // A dirty draft keeps everything and lists one conflict.
    expect(
      useStoryboardStore.getState().boards["board-1"]?.shots.map((s) => s.action)
    ).toEqual(["draft"]);
    expect(conflictsFor()).toEqual(["document"]);

    rendered.unmount();
    useConflictStore.getState().clear("storyboard:board-1");
  });

  it("attributes a render write that names the shot by id, not target", async () => {
    getQuery.mockResolvedValue(
      serverResponse(docWith([shot("s1", 0, "One"), shot("s2", 1, "Two")]))
    );
    const rendered = await mountLoaded();

    act(() =>
      useStoryboardStore.getState().updateShot("board-1", "s2", { action: "Two — draft" })
    );

    // The render path emits { id }, the editor ops { target } — both must
    // attribute.
    getQuery.mockResolvedValue(
      serverResponse(
        docWith([
          shot("s1", 0, "One"),
          { ...shot("s2", 1, "Two"), status: "render_ready" }
        ]),
        "rev-9"
      )
    );
    await act(async () => {
      handleDocumentResourceChange("storyboard", {
        event: "updated",
        id: "board-1",
        updatedAt: "rev-9",
        ops: [{ tool: "update_shot", input: { id: "s2" } }]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(conflictsFor()).toEqual(["s2"]);
    expect(
      useStoryboardStore
        .getState()
        .boards["board-1"]?.shots.find((s) => s.id === "s2")?.action
    ).toBe("Two — draft");

    rendered.unmount();
    useConflictStore.getState().clear("storyboard:board-1");
  });

  it("takes a second external write to the same shot after a first merge", async () => {
    getQuery.mockResolvedValue(
      serverResponse(
        docWith([shot("s1", 0, "One"), shot("s2", 1, "Two"), shot("s3", 2, "Three")])
      )
    );
    const rendered = await mountLoaded();

    // The user is still editing shot 3.
    act(() =>
      useStoryboardStore
        .getState()
        .updateShot("board-1", "s3", { action: "Three — draft" })
    );

    // First agent write on shot 2.
    getQuery.mockResolvedValue(
      serverResponse(
        docWith([
          shot("s1", 0, "One"),
          shot("s2", 1, "Two — agent 1"),
          shot("s3", 2, "Three")
        ]),
        "rev-9"
      )
    );
    await act(async () => {
      handleDocumentResourceChange("storyboard", {
        event: "updated",
        id: "board-1",
        updatedAt: "rev-9",
        ops: [{ tool: "update_shot", input: { target: "s2" } }]
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(conflictsFor()).toEqual([]);

    // Second agent write on the same shot. The base must have rolled to the
    // server copy, or this reads as "both changed" and is refused.
    getQuery.mockResolvedValue(
      serverResponse(
        docWith([
          shot("s1", 0, "One"),
          shot("s2", 1, "Two — agent 2"),
          shot("s3", 2, "Three")
        ]),
        "rev-10"
      )
    );
    await act(async () => {
      handleDocumentResourceChange("storyboard", {
        event: "updated",
        id: "board-1",
        updatedAt: "rev-10",
        ops: [{ tool: "update_shot", input: { target: "s2" } }]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const shots = useStoryboardStore.getState().boards["board-1"]?.shots ?? [];
    expect(shots.find((s) => s.id === "s2")?.action).toBe("Two — agent 2");
    expect(shots.find((s) => s.id === "s3")?.action).toBe("Three — draft");
    expect(conflictsFor()).toEqual([]);
    expect(useStoryboardStore.getState().serverRevisions["board-1"]).toBe("rev-10");

    rendered.unmount();
    useConflictStore.getState().clear("storyboard:board-1");
  });

  it("keeps a refused still on offer through the rest of a render batch", async () => {
    // A batch render is one write per shot. Each merge used to replace the
    // banner's whole list, so the offer carrying shot 1's still vanished when
    // shot 2's write landed — and the base rolled past the refusal, so nothing
    // ever offered it again. The still was unreachable from the UI.
    const still = (id: string) => ({
      type: "image",
      asset_id: id,
      uri: `asset://${id}.png`
    });
    const rendered_ = await (async () => {
      getQuery.mockResolvedValue(
        serverResponse(docWith([shot("s1", 0, "One"), shot("s2", 1, "Two")]))
      );
      return mountLoaded();
    })();

    // The user is rewriting shot 1 while the batch runs.
    act(() =>
      useStoryboardStore
        .getState()
        .updateShot("board-1", "s1", { action: "One — draft" })
    );

    getQuery.mockResolvedValue(
      serverResponse(
        docWith([
          { ...shot("s1", 0, "One"), status: "keyframe_ready", keyframe: still("a1") },
          shot("s2", 1, "Two")
        ]),
        "rev-9"
      )
    );
    await act(async () => {
      handleDocumentResourceChange("storyboard", {
        event: "updated",
        id: "board-1",
        updatedAt: "rev-9",
        ops: [{ tool: "update_shot", input: { id: "s1" } }]
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(conflictsFor()).toEqual(["s1"]);

    // Shot 2's render lands before the user answers the banner.
    getQuery.mockResolvedValue(
      serverResponse(
        docWith([
          { ...shot("s1", 0, "One"), status: "keyframe_ready", keyframe: still("a1") },
          { ...shot("s2", 1, "Two"), status: "keyframe_ready", keyframe: still("a2") }
        ]),
        "rev-10"
      )
    );
    await act(async () => {
      handleDocumentResourceChange("storyboard", {
        event: "updated",
        id: "board-1",
        updatedAt: "rev-10",
        ops: [{ tool: "update_shot", input: { id: "s2" } }]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const shotsAfter = useStoryboardStore.getState().boards["board-1"]?.shots ?? [];
    // Shot 2 was untouched by the draft, so its still merged straight in.
    expect(shotsAfter.find((s) => s.id === "s2")?.keyframe).toEqual(still("a2"));
    // Shot 1's still is still on offer, and taking it works.
    expect(conflictsFor()).toContain("s1");
    act(() => useConflictStore.getState().accept("storyboard:board-1", "s1"));
    expect(
      useStoryboardStore
        .getState()
        .boards["board-1"]?.shots.find((s) => s.id === "s1")?.keyframe
    ).toEqual(still("a1"));

    rendered_.unmount();
    useConflictStore.getState().clear("storyboard:board-1");
  });

  it("re-offers a refused shot on the next write that touches it", async () => {
    // The merge base must not roll past a refusal. When it did, the next
    // write naming the same shot read its server value as unchanged, so the
    // draft won in silence and the refused value became unreachable.
    getQuery.mockResolvedValue(serverResponse(docWith([shot("s1", 0, "One")])));
    const rendered = await mountLoaded();

    act(() =>
      useStoryboardStore
        .getState()
        .updateShot("board-1", "s1", { action: "One — draft" })
    );

    const rendered_s1 = docWith([
      {
        ...shot("s1", 0, "One"),
        status: "keyframe_ready",
        keyframe: { type: "image", asset_id: "a1", uri: "asset://a1.png" }
      }
    ]);
    const deliver = async (updatedAt: string) => {
      getQuery.mockResolvedValue(serverResponse(rendered_s1, updatedAt));
      await act(async () => {
        handleDocumentResourceChange("storyboard", {
          event: "updated",
          id: "board-1",
          updatedAt,
          ops: [{ tool: "update_shot", input: { id: "s1" } }]
        });
        await Promise.resolve();
        await Promise.resolve();
      });
    };

    await deliver("rev-9");
    expect(conflictsFor()).toEqual(["s1"]);
    // The user reads the banner and keeps their own line for now.
    act(() => useConflictStore.getState().discard("storyboard:board-1", "s1"));
    expect(conflictsFor()).toEqual([]);

    // The shot is written again, with the same content the draft refused.
    await deliver("rev-10");
    expect(conflictsFor()).toEqual(["s1"]);
    act(() => useConflictStore.getState().accept("storyboard:board-1", "s1"));
    expect(
      useStoryboardStore
        .getState()
        .boards["board-1"]?.shots.find((s) => s.id === "s1")?.keyframe
    ).toEqual({ type: "image", asset_id: "a1", uri: "asset://a1.png" });

    rendered.unmount();
    useConflictStore.getState().clear("storyboard:board-1");
  });

  it("renumbers merged shots so index always equals position", async () => {
    getQuery.mockResolvedValue(
      serverResponse(docWith([shot("s1", 0, "One"), shot("s2", 1, "Two")]))
    );
    const rendered = await mountLoaded();

    act(() =>
      useStoryboardStore.getState().updateShot("board-1", "s1", { action: "One — draft" })
    );

    // The server inserted a new shot in the middle; the draft's dirty first
    // shot keeps its slot and everything after it shifts.
    getQuery.mockResolvedValue(
      serverResponse(
        docWith([
          shot("s1", 0, "One"),
          shot("s-new", 1, "Inserted"),
          shot("s2", 2, "Two")
        ]),
        "rev-9"
      )
    );
    await act(async () => {
      handleDocumentResourceChange("storyboard", {
        event: "updated",
        id: "board-1",
        updatedAt: "rev-9",
        ops: [{ tool: "add_shot", input: {} }]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const shots = useStoryboardStore.getState().boards["board-1"]?.shots ?? [];
    expect(shots.map((s) => [s.id, s.index])).toEqual([
      ["s1", 0],
      ["s-new", 1],
      ["s2", 2]
    ]);
    expect(shots.find((s) => s.id === "s1")?.action).toBe("One — draft");

    rendered.unmount();
    useConflictStore.getState().clear("storyboard:board-1");
  });
});

describe("useStoryboardServerSync — notices that arrive during an in-flight save", () => {
  const shot = (id: string, index: number, action: string) => ({
    type: "shot",
    id,
    index,
    action,
    status: "planned"
  });

  const response = (
    shots: ReturnType<typeof shot>[],
    updatedAt: string
  ): Record<string, unknown> => ({
    id: "board-1",
    name: "Saved board",
    document: { ...emptyDocument, shots },
    timelineId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt
  });

  const conflicts = () =>
    useConflictStore.getState().byKey["storyboard:board-1"]?.conflicts ?? [];

  /** Mount, load, and hold the next save open so notices land mid-flight. */
  const mountWithHeldSave = async (
    shots: ReturnType<typeof shot>[]
  ): Promise<{
    rendered: ReturnType<typeof renderHook>;
    settle: {
      resolve: (value: unknown) => void;
      reject: (error: unknown) => void;
    };
  }> => {
    getQuery.mockResolvedValue(response(shots, "rev-1"));
    const rendered = renderHook(() => useStoryboardServerSync("board-1"));
    await waitFor(() =>
      expect(useStoryboardStore.getState().serverRevisions["board-1"]).toBe(
        "rev-1"
      )
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

  const shotsNow = () =>
    useStoryboardStore.getState().boards["board-1"]?.shots ?? [];

  beforeEach(() => {
    useConflictStore.setState({ byKey: {} });
  });

  afterEach(() => {
    useConflictStore.getState().clear("storyboard:board-1");
  });

  it("keeps the draft when an external write lands mid-save and the CAS fails", async () => {
    const { rendered, settle } = await mountWithHeldSave([
      shot("s1", 0, "One"),
      shot("s2", 1, "Two")
    ]);

    act(() =>
      useStoryboardStore
        .getState()
        .updateShot("board-1", "s2", { action: "Two — draft" })
    );
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1), {
      timeout: 3000
    });

    // The agent rewrites shot 1 while our save is in flight.
    getQuery.mockResolvedValue(
      response([shot("s1", 0, "One — agent"), shot("s2", 1, "Two")], "rev-9")
    );
    act(() => {
      handleDocumentResourceChange("storyboard", {
        event: "updated",
        id: "board-1",
        updatedAt: "rev-9",
        ops: [{ tool: "update_shot", input: { target: "s1" } }]
      });
    });
    // Our save then loses the CAS to that write.
    await act(async () => {
      settle.reject(new Error("Storyboard was modified since last read"));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(useStoryboardStore.getState().serverRevisions["board-1"]).toBe(
        "rev-9"
      )
    );

    expect(shotsNow().find((s) => s.id === "s2")?.action).toBe("Two — draft");
    expect(shotsNow().find((s) => s.id === "s1")?.action).toBe("One — agent");
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
    const { rendered, settle } = await mountWithHeldSave([shot("s1", 0, "One")]);

    act(() =>
      useStoryboardStore
        .getState()
        .updateShot("board-1", "s1", { action: "One — draft" })
    );
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1), {
      timeout: 3000
    });

    // Another tab autosaved the whole document: no ops to attribute.
    getQuery.mockResolvedValue(
      response([shot("s1", 0, "One — other tab")], "rev-9")
    );
    act(() => {
      handleDocumentResourceChange("storyboard", {
        event: "updated",
        id: "board-1",
        updatedAt: "rev-9"
      });
    });
    await act(async () => {
      settle.reject(new Error("Storyboard was modified since last read"));
      await Promise.resolve();
    });

    await waitFor(() => expect(conflicts()).toHaveLength(1));
    expect(conflicts()[0]).toMatchObject({ reason: "replaced" });
    expect(shotsNow()[0]?.action).toBe("One — draft");

    rendered.unmount();
  });

  it("ignores our own save echo that arrives before its response", async () => {
    const { rendered, settle } = await mountWithHeldSave([shot("s1", 0, "One")]);

    act(() =>
      useStoryboardStore
        .getState()
        .updateShot("board-1", "s1", { action: "One — draft" })
    );
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1), {
      timeout: 3000
    });

    // The broadcast of our own write overtakes its response, and the user
    // keeps typing meanwhile.
    act(() => {
      handleDocumentResourceChange("storyboard", {
        event: "updated",
        id: "board-1",
        updatedAt: "rev-2"
      });
    });
    act(() =>
      useStoryboardStore
        .getState()
        .updateShot("board-1", "s1", { action: "One — draft!" })
    );
    await act(async () => {
      settle.resolve({
        id: "board-1",
        name: "Saved board",
        document: emptyDocument,
        timelineId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "rev-2"
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(conflicts()).toEqual([]);
    // No merge fetch: the only get was the initial load.
    expect(getQuery).toHaveBeenCalledTimes(1);
    expect(shotsNow()[0]?.action).toBe("One — draft!");

    rendered.unmount();
  });
});
