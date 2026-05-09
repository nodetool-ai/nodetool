import { act } from "@testing-library/react";
import { useCurrentWorkspaceStore } from "../CurrentWorkspaceStore";

describe("CurrentWorkspaceStore", () => {
  beforeEach(() => {
    act(() => {
      useCurrentWorkspaceStore.getState().setLastUsedWorkspaceId(null);
    });
  });

  describe("initial state", () => {
    it("has null lastUsedWorkspaceId", () => {
      expect(useCurrentWorkspaceStore.getState().lastUsedWorkspaceId).toBeNull();
    });
  });

  describe("setLastUsedWorkspaceId", () => {
    it("stores a workspace id", () => {
      act(() => {
        useCurrentWorkspaceStore.getState().setLastUsedWorkspaceId("ws-abc");
      });
      expect(useCurrentWorkspaceStore.getState().lastUsedWorkspaceId).toBe("ws-abc");
    });

    it("clears workspace id with null", () => {
      act(() => {
        useCurrentWorkspaceStore.getState().setLastUsedWorkspaceId("ws-abc");
        useCurrentWorkspaceStore.getState().setLastUsedWorkspaceId(null);
      });
      expect(useCurrentWorkspaceStore.getState().lastUsedWorkspaceId).toBeNull();
    });

    it("replaces previous value", () => {
      act(() => {
        useCurrentWorkspaceStore.getState().setLastUsedWorkspaceId("ws-1");
        useCurrentWorkspaceStore.getState().setLastUsedWorkspaceId("ws-2");
      });
      expect(useCurrentWorkspaceStore.getState().lastUsedWorkspaceId).toBe("ws-2");
    });
  });
});
