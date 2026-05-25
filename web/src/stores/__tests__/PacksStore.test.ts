import { act } from "@testing-library/react";

jest.mock("../../trpc/client", () => {
  const list = jest.fn();
  const getTrust = jest.fn();
  const setTrust = jest.fn();
  const reload = jest.fn();
  return {
    trpcClient: {
      packs: {
        list: { query: list },
        getTrust: { query: getTrust },
        setTrust: { mutate: setTrust },
        reload: { mutate: reload }
      }
    },
    __mocks: { list, getTrust, setTrust, reload }
  };
});

const { __mocks } = require("../../trpc/client") as {
  __mocks: {
    list: jest.Mock;
    getTrust: jest.Mock;
    setTrust: jest.Mock;
    reload: jest.Mock;
  };
};

import usePacksStore from "../PacksStore";

describe("PacksStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePacksStore.setState({
      packs: [],
      trust: { allowlist: [], allowUnlisted: false },
      isLoading: false,
      error: null
    });
  });

  describe("initial state", () => {
    it("has empty packs and default trust", () => {
      const state = usePacksStore.getState();
      expect(state.packs).toEqual([]);
      expect(state.trust).toEqual({ allowlist: [], allowUnlisted: false });
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe("fetch", () => {
    it("loads packs and trust from server", async () => {
      const mockPacks = [
        { name: "my-pack", version: "1.0.0", status: "loaded", registered: ["MyNode"], skippedNodes: [] }
      ];
      const mockTrust = { allowlist: ["my-pack"], allowUnlisted: false };

      __mocks.list.mockResolvedValue({ packs: mockPacks });
      __mocks.getTrust.mockResolvedValue(mockTrust);

      await act(async () => {
        await usePacksStore.getState().fetch();
      });

      const state = usePacksStore.getState();
      expect(state.packs).toEqual(mockPacks);
      expect(state.trust).toEqual(mockTrust);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it("sets error on failure", async () => {
      __mocks.list.mockRejectedValue(new Error("Connection refused"));
      __mocks.getTrust.mockRejectedValue(new Error("Connection refused"));

      await act(async () => {
        await usePacksStore.getState().fetch();
      });

      const state = usePacksStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeTruthy();
    });

    it("sets isLoading while fetching", async () => {
      let resolveList!: (v: unknown) => void;
      __mocks.list.mockReturnValue(new Promise((r) => { resolveList = r; }));
      __mocks.getTrust.mockResolvedValue({ allowlist: [], allowUnlisted: false });

      const fetchPromise = usePacksStore.getState().fetch();
      expect(usePacksStore.getState().isLoading).toBe(true);

      resolveList({ packs: [] });
      await act(async () => { await fetchPromise; });
      expect(usePacksStore.getState().isLoading).toBe(false);
    });
  });

  describe("setTrusted", () => {
    it("adds a pack to the allowlist", async () => {
      usePacksStore.setState({
        trust: { allowlist: ["existing"], allowUnlisted: false }
      });

      __mocks.setTrust.mockResolvedValue({ allowlist: ["existing", "new-pack"], allowUnlisted: false });
      __mocks.reload.mockResolvedValue({ packs: [] });

      await act(async () => {
        await usePacksStore.getState().setTrusted("new-pack", true);
      });

      expect(__mocks.setTrust).toHaveBeenCalledWith({
        allowlist: expect.arrayContaining(["existing", "new-pack"])
      });
      expect(usePacksStore.getState().trust.allowlist).toContain("new-pack");
    });

    it("removes a pack from the allowlist", async () => {
      usePacksStore.setState({
        trust: { allowlist: ["keep", "remove-me"], allowUnlisted: false }
      });

      __mocks.setTrust.mockResolvedValue({ allowlist: ["keep"], allowUnlisted: false });
      __mocks.reload.mockResolvedValue({ packs: [] });

      await act(async () => {
        await usePacksStore.getState().setTrusted("remove-me", false);
      });

      expect(__mocks.setTrust).toHaveBeenCalledWith({
        allowlist: ["keep"]
      });
    });

    it("sets error on failure", async () => {
      __mocks.setTrust.mockRejectedValue(new Error("Server error"));

      await act(async () => {
        await usePacksStore.getState().setTrusted("pkg", true);
      });

      expect(usePacksStore.getState().error).toBeTruthy();
    });
  });

  describe("setAllowUnlisted", () => {
    it("updates allowUnlisted and reloads packs", async () => {
      __mocks.setTrust.mockResolvedValue({ allowlist: [], allowUnlisted: true });
      __mocks.reload.mockResolvedValue({
        packs: [{ name: "unlisted-pack", status: "loaded", registered: [], skippedNodes: [] }]
      });

      await act(async () => {
        await usePacksStore.getState().setAllowUnlisted(true);
      });

      expect(__mocks.setTrust).toHaveBeenCalledWith({ allowUnlisted: true });
      expect(usePacksStore.getState().trust.allowUnlisted).toBe(true);
      expect(usePacksStore.getState().packs).toHaveLength(1);
    });

    it("sets error on failure", async () => {
      __mocks.setTrust.mockRejectedValue(new Error("Forbidden"));

      await act(async () => {
        await usePacksStore.getState().setAllowUnlisted(true);
      });

      expect(usePacksStore.getState().error).toBeTruthy();
    });
  });

  describe("reload", () => {
    it("refreshes packs from server", async () => {
      const mockPacks = [
        { name: "reloaded", status: "loaded", registered: ["Node"], skippedNodes: [] }
      ];
      __mocks.reload.mockResolvedValue({ packs: mockPacks });

      await act(async () => {
        await usePacksStore.getState().reload();
      });

      expect(usePacksStore.getState().packs).toEqual(mockPacks);
      expect(usePacksStore.getState().isLoading).toBe(false);
    });

    it("sets error on failure", async () => {
      __mocks.reload.mockRejectedValue(new Error("Timeout"));

      await act(async () => {
        await usePacksStore.getState().reload();
      });

      expect(usePacksStore.getState().isLoading).toBe(false);
      expect(usePacksStore.getState().error).toBeTruthy();
    });
  });
});
