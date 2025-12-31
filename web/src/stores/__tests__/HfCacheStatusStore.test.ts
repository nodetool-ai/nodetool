import { act } from "@testing-library/react";
import { useHfCacheStatusStore } from "../HfCacheStatusStore";

// Mock the checkHfCacheStatus API
jest.mock("../../serverState/checkHfCacheStatus", () => ({
  checkHfCacheStatus: jest.fn()
}));

import { checkHfCacheStatus } from "../../serverState/checkHfCacheStatus";
const mockCheckHfCacheStatus = checkHfCacheStatus as jest.MockedFunction<typeof checkHfCacheStatus>;

describe("HfCacheStatusStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useHfCacheStatusStore.setState({
      statuses: {},
      pending: {},
      version: 0
    });
    jest.clearAllMocks();
  });

  describe("initial state", () => {
    it("has empty statuses", () => {
      const { statuses } = useHfCacheStatusStore.getState();
      expect(statuses).toEqual({});
    });

    it("has empty pending", () => {
      const { pending } = useHfCacheStatusStore.getState();
      expect(pending).toEqual({});
    });

    it("has version 0", () => {
      const { version } = useHfCacheStatusStore.getState();
      expect(version).toBe(0);
    });
  });

  describe("setStatuses", () => {
    it("sets status results", () => {
      const results = [
        { key: "model/a", downloaded: true },
        { key: "model/b", downloaded: false }
      ];

      act(() => {
        useHfCacheStatusStore.getState().setStatuses(results);
      });

      const { statuses } = useHfCacheStatusStore.getState();
      expect(statuses["model/a"]).toBe(true);
      expect(statuses["model/b"]).toBe(false);
    });

    it("does not change state for empty results", () => {
      const stateBefore = useHfCacheStatusStore.getState();

      act(() => {
        useHfCacheStatusStore.getState().setStatuses([]);
      });

      const stateAfter = useHfCacheStatusStore.getState();
      expect(stateBefore).toBe(stateAfter);
    });

    it("merges with existing statuses", () => {
      useHfCacheStatusStore.setState({
        statuses: { existing: true }
      });

      act(() => {
        useHfCacheStatusStore.getState().setStatuses([
          { key: "new", downloaded: false }
        ]);
      });

      const { statuses } = useHfCacheStatusStore.getState();
      expect(statuses.existing).toBe(true);
      expect(statuses.new).toBe(false);
    });

    it("updates existing status", () => {
      useHfCacheStatusStore.setState({
        statuses: { "model/a": false }
      });

      act(() => {
        useHfCacheStatusStore.getState().setStatuses([
          { key: "model/a", downloaded: true }
        ]);
      });

      const { statuses } = useHfCacheStatusStore.getState();
      expect(statuses["model/a"]).toBe(true);
    });
  });

  describe("markPending", () => {
    it("marks keys as pending", () => {
      act(() => {
        useHfCacheStatusStore.getState().markPending(["key1", "key2"]);
      });

      const { pending } = useHfCacheStatusStore.getState();
      expect(pending.key1).toBe(true);
      expect(pending.key2).toBe(true);
    });

    it("does not change state for empty keys", () => {
      const stateBefore = useHfCacheStatusStore.getState();

      act(() => {
        useHfCacheStatusStore.getState().markPending([]);
      });

      const stateAfter = useHfCacheStatusStore.getState();
      expect(stateBefore).toBe(stateAfter);
    });
  });

  describe("clearPending", () => {
    it("clears pending keys", () => {
      useHfCacheStatusStore.setState({
        pending: { key1: true, key2: true, key3: true }
      });

      act(() => {
        useHfCacheStatusStore.getState().clearPending(["key1", "key2"]);
      });

      const { pending } = useHfCacheStatusStore.getState();
      expect(pending.key1).toBeUndefined();
      expect(pending.key2).toBeUndefined();
      expect(pending.key3).toBe(true);
    });

    it("does not change state for empty keys", () => {
      const stateBefore = useHfCacheStatusStore.getState();

      act(() => {
        useHfCacheStatusStore.getState().clearPending([]);
      });

      const stateAfter = useHfCacheStatusStore.getState();
      expect(stateBefore).toBe(stateAfter);
    });
  });

  describe("invalidate", () => {
    it("clears all statuses and pending when no keys provided", () => {
      useHfCacheStatusStore.setState({
        statuses: { a: true, b: false },
        pending: { c: true },
        version: 5
      });

      act(() => {
        useHfCacheStatusStore.getState().invalidate();
      });

      const { statuses, pending, version } = useHfCacheStatusStore.getState();
      expect(statuses).toEqual({});
      expect(pending).toEqual({});
      expect(version).toBe(6);
    });

    it("clears specific keys and increments version", () => {
      useHfCacheStatusStore.setState({
        statuses: { "org/model/file": true, "other/model": false },
        pending: { "org/model/file": true },
        version: 0
      });

      act(() => {
        useHfCacheStatusStore.getState().invalidate(["org/model/file"]);
      });

      const { statuses, pending, version } = useHfCacheStatusStore.getState();
      expect(statuses["org/model/file"]).toBeUndefined();
      expect(statuses["other/model"]).toBe(false);
      expect(pending["org/model/file"]).toBeUndefined();
      expect(version).toBe(1);
    });

    it("invalidates related keys by repo prefix", () => {
      useHfCacheStatusStore.setState({
        statuses: {
          "org/repo": true,
          "org/repo/file1": true,
          "org/repo/file2": false,
          "org/other-repo": true
        },
        version: 0
      });

      act(() => {
        useHfCacheStatusStore.getState().invalidate(["org/repo/file1"]);
      });

      const { statuses } = useHfCacheStatusStore.getState();
      // All org/repo related keys should be invalidated
      expect(statuses["org/repo"]).toBeUndefined();
      expect(statuses["org/repo/file1"]).toBeUndefined();
      expect(statuses["org/repo/file2"]).toBeUndefined();
      // Other repos should not be affected
      expect(statuses["org/other-repo"]).toBe(true);
    });

    it("clears all when empty array provided", () => {
      useHfCacheStatusStore.setState({
        statuses: { a: true },
        pending: { b: true },
        version: 0
      });

      act(() => {
        useHfCacheStatusStore.getState().invalidate([]);
      });

      const { statuses, pending, version } = useHfCacheStatusStore.getState();
      expect(statuses).toEqual({});
      expect(pending).toEqual({});
      expect(version).toBe(1);
    });
  });

  describe("ensureStatuses", () => {
    it("does nothing for empty items", async () => {
      await act(async () => {
        await useHfCacheStatusStore.getState().ensureStatuses([]);
      });

      expect(mockCheckHfCacheStatus).not.toHaveBeenCalled();
    });

    it("does not fetch already known statuses", async () => {
      useHfCacheStatusStore.setState({
        statuses: { "known/model": true }
      });

      await act(async () => {
        await useHfCacheStatusStore.getState().ensureStatuses([
          { key: "known/model", repo_id: "known/model" }
        ]);
      });

      expect(mockCheckHfCacheStatus).not.toHaveBeenCalled();
    });

    it("does not fetch pending statuses", async () => {
      useHfCacheStatusStore.setState({
        pending: { "pending/model": true }
      });

      await act(async () => {
        await useHfCacheStatusStore.getState().ensureStatuses([
          { key: "pending/model", repo_id: "pending/model" }
        ]);
      });

      expect(mockCheckHfCacheStatus).not.toHaveBeenCalled();
    });

    it("fetches unknown statuses and updates store", async () => {
      mockCheckHfCacheStatus.mockResolvedValueOnce([
        { key: "new/model", downloaded: true }
      ]);

      await act(async () => {
        await useHfCacheStatusStore.getState().ensureStatuses([
          { key: "new/model", repo_id: "new/model" }
        ]);
      });

      expect(mockCheckHfCacheStatus).toHaveBeenCalledWith([
        { key: "new/model", repo_id: "new/model" }
      ]);

      const { statuses, pending } = useHfCacheStatusStore.getState();
      expect(statuses["new/model"]).toBe(true);
      expect(pending["new/model"]).toBeUndefined();
    });

    it("handles API errors gracefully", async () => {
      mockCheckHfCacheStatus.mockRejectedValueOnce(new Error("Network error"));

      await act(async () => {
        await useHfCacheStatusStore.getState().ensureStatuses([
          { key: "error/model", repo_id: "error/model" }
        ]);
      });

      const { statuses, pending } = useHfCacheStatusStore.getState();
      // On error, status defaults to false
      expect(statuses["error/model"]).toBe(false);
      // Pending should be cleared
      expect(pending["error/model"]).toBeUndefined();
    });

    it("marks items as pending during fetch", async () => {
      let resolvePromise: (value: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockCheckHfCacheStatus.mockReturnValueOnce(pendingPromise as any);

      const fetchPromise = useHfCacheStatusStore.getState().ensureStatuses([
        { key: "fetching/model", repo_id: "fetching/model" }
      ]);

      // Check pending state
      expect(useHfCacheStatusStore.getState().pending["fetching/model"]).toBe(true);

      resolvePromise!([{ key: "fetching/model", downloaded: true }]);
      await fetchPromise;

      // Pending should be cleared after completion
      expect(useHfCacheStatusStore.getState().pending["fetching/model"]).toBeUndefined();
    });

    it("only fetches items that need checking", async () => {
      useHfCacheStatusStore.setState({
        statuses: { "known/model": true },
        pending: { "pending/model": true }
      });

      mockCheckHfCacheStatus.mockResolvedValueOnce([
        { key: "new/model", downloaded: false }
      ]);

      await act(async () => {
        await useHfCacheStatusStore.getState().ensureStatuses([
          { key: "known/model", repo_id: "known/model" },
          { key: "pending/model", repo_id: "pending/model" },
          { key: "new/model", repo_id: "new/model" }
        ]);
      });

      // Only the new/model should have been requested
      expect(mockCheckHfCacheStatus).toHaveBeenCalledWith([
        { key: "new/model", repo_id: "new/model" }
      ]);
    });
  });
});
