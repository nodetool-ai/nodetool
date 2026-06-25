import useNodePacksStore from "../NodePacksStore";

type WindowWithApi = { api?: unknown };

const AVAILABLE = [
  {
    name: "NodeTool Base",
    description: "Core nodes",
    repo_id: "nodetool-ai/nodetool-base"
  },
  {
    name: "HuggingFace",
    description: "HF nodes",
    repo_id: "nodetool-ai/nodetool-huggingface"
  }
];

const INSTALLED = [
  {
    name: "NodeTool Base",
    description: "Core nodes",
    version: "1.0.0",
    repo_id: "nodetool-ai/nodetool-base",
    latestVersion: "1.1.0",
    hasUpdate: true
  }
];

const makeApi = () => ({
  listAvailable: jest.fn().mockResolvedValue({ packages: AVAILABLE }),
  listInstalled: jest.fn().mockResolvedValue({ packages: INSTALLED }),
  install: jest.fn().mockResolvedValue({ success: true, message: "ok" }),
  uninstall: jest.fn().mockResolvedValue({ success: true, message: "removed" }),
  update: jest.fn().mockResolvedValue({ success: true, message: "updated" })
});

const reset = () =>
  useNodePacksStore.setState({
    available: true,
    availablePacks: [],
    installed: [],
    busyIds: [],
    consoleLines: [],
    isLoading: false,
    error: null
  });

describe("NodePacksStore", () => {
  let api: ReturnType<typeof makeApi>;
  let restart: jest.Mock;

  beforeEach(() => {
    api = makeApi();
    restart = jest.fn();
    (window as unknown as WindowWithApi).api = {
      packages: api,
      server: { onLog: jest.fn(() => jest.fn()), restart }
    };
    reset();
  });

  afterEach(() => {
    (window as unknown as WindowWithApi).api = undefined;
  });

  it("refresh loads available and installed packs", async () => {
    await useNodePacksStore.getState().refresh();
    const s = useNodePacksStore.getState();
    expect(api.listAvailable).toHaveBeenCalled();
    expect(api.listInstalled).toHaveBeenCalled();
    expect(s.availablePacks).toEqual(AVAILABLE);
    expect(s.installed).toEqual(INSTALLED);
  });

  it("install calls IPC, refreshes, and restarts the server", async () => {
    const ok = await useNodePacksStore
      .getState()
      .install("nodetool-ai/nodetool-huggingface");
    expect(ok).toBe(true);
    expect(api.install).toHaveBeenCalledWith("nodetool-ai/nodetool-huggingface");
    expect(api.listAvailable).toHaveBeenCalled();
    expect(restart).toHaveBeenCalled();
    expect(useNodePacksStore.getState().busyIds).toEqual([]);
  });

  it("uninstall calls IPC without restarting", async () => {
    const ok = await useNodePacksStore
      .getState()
      .uninstall("nodetool-ai/nodetool-base");
    expect(ok).toBe(true);
    expect(api.uninstall).toHaveBeenCalledWith("nodetool-ai/nodetool-base");
    expect(restart).not.toHaveBeenCalled();
  });

  it("update calls IPC and restarts the server", async () => {
    const ok = await useNodePacksStore
      .getState()
      .update("nodetool-ai/nodetool-base");
    expect(ok).toBe(true);
    expect(api.update).toHaveBeenCalledWith("nodetool-ai/nodetool-base");
    expect(restart).toHaveBeenCalled();
  });

  it("surfaces a failure message when install fails", async () => {
    api.install.mockResolvedValueOnce({ success: false, message: "boom" });
    const ok = await useNodePacksStore
      .getState()
      .install("nodetool-ai/nodetool-huggingface");
    expect(ok).toBe(false);
    expect(useNodePacksStore.getState().error).toBe("boom");
    expect(restart).not.toHaveBeenCalled();
  });

  it("is unavailable and no-ops without the Electron IPC", async () => {
    (window as unknown as WindowWithApi).api = undefined;
    await useNodePacksStore.getState().refresh();
    expect(useNodePacksStore.getState().available).toBe(false);
    expect(
      await useNodePacksStore.getState().install("nodetool-ai/nodetool-base")
    ).toBe(false);
  });
});
