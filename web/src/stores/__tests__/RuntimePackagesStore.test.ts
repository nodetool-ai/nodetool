import useRuntimePackagesStore from "../RuntimePackagesStore";
import { installGlobal } from "../../test-utils/doubles";

const STATUSES = [
  {
    id: "python",
    name: "Python",
    description: "Python 3.11",
    installed: false,
    installing: false
  }
];

const makeApi = () => ({
  getRuntimeStatuses: jest.fn().mockResolvedValue(STATUSES),
  getInstallLocation: jest.fn().mockResolvedValue("/env/nodetool"),
  installRuntime: jest.fn().mockResolvedValue({ success: true, message: "ok" }),
  uninstallRuntime: jest
    .fn()
    .mockResolvedValue({ success: true, message: "removed" }),
  updateRuntime: jest
    .fn()
    .mockResolvedValue({ success: true, message: "updated" }),
  selectInstallLocation: jest.fn().mockResolvedValue("/new/env")
});

const reset = () =>
  useRuntimePackagesStore.setState({
    available: true,
    statuses: [],
    installLocation: null,
    busyIds: [],
    consoleLines: [],
    isLoading: false,
    error: null
  });

describe("RuntimePackagesStore", () => {
  let api: ReturnType<typeof makeApi>;

  beforeEach(() => {
    api = makeApi();
    installGlobal("api", {
      packages: api,
      server: { onLog: jest.fn(() => jest.fn()), restart: jest.fn() }
    });
    reset();
  });

  afterEach(() => {
    installGlobal("api", undefined);
  });

  const serverRestart = () =>
    (window.api as unknown as { server: { restart: jest.Mock } }).server
      .restart;

  it("refresh loads statuses and install location", async () => {
    await useRuntimePackagesStore.getState().refresh();
    const s = useRuntimePackagesStore.getState();
    expect(api.getRuntimeStatuses).toHaveBeenCalled();
    expect(s.statuses).toEqual(STATUSES);
    expect(s.installLocation).toBe("/env/nodetool");
  });

  it("install calls IPC and refreshes", async () => {
    const ok = await useRuntimePackagesStore.getState().install("python");
    expect(ok).toBe(true);
    expect(api.installRuntime).toHaveBeenCalledWith("python");
    // refresh runs in the finally block
    expect(api.getRuntimeStatuses).toHaveBeenCalled();
    expect(useRuntimePackagesStore.getState().busyIds).toEqual([]);
  });

  it("uninstall calls IPC", async () => {
    const ok = await useRuntimePackagesStore.getState().uninstall("python");
    expect(ok).toBe(true);
    expect(api.uninstallRuntime).toHaveBeenCalledWith("python");
  });

  it("surfaces a failure message when install fails", async () => {
    api.installRuntime.mockResolvedValueOnce({
      success: false,
      message: "boom"
    });
    const ok = await useRuntimePackagesStore.getState().install("python");
    expect(ok).toBe(false);
    expect(useRuntimePackagesStore.getState().error).toBe("boom");
  });

  it("keeps the installed and pinned versions a refresh reports", async () => {
    const outdated = {
      id: "claude-agent-sdk",
      name: "Claude Agent SDK",
      description: "SDK",
      installed: true,
      installing: false,
      installedVersion: "0.3.190",
      latestVersion: "0.3.283",
      updateAvailable: true
    };
    api.getRuntimeStatuses.mockResolvedValueOnce([outdated]);
    await useRuntimePackagesStore.getState().refresh();
    expect(useRuntimePackagesStore.getState().statuses).toEqual([outdated]);
  });

  it("update calls IPC, refreshes, and restarts the backend", async () => {
    const ok = await useRuntimePackagesStore
      .getState()
      .update("claude-agent-sdk");
    expect(ok).toBe(true);
    expect(api.updateRuntime).toHaveBeenCalledWith("claude-agent-sdk");
    expect(api.getRuntimeStatuses).toHaveBeenCalled();
    // The backend imported the old version; only a restart loads the new one.
    expect(serverRestart()).toHaveBeenCalledTimes(1);
  });

  it("does not restart the backend when an update fails", async () => {
    api.updateRuntime.mockResolvedValueOnce({ success: false, message: "npm" });
    const ok = await useRuntimePackagesStore
      .getState()
      .update("claude-agent-sdk");
    expect(ok).toBe(false);
    expect(useRuntimePackagesStore.getState().error).toBe("npm");
    expect(serverRestart()).not.toHaveBeenCalled();
  });

  it("is unavailable and no-ops without the Electron IPC", async () => {
    installGlobal("api", undefined);
    await useRuntimePackagesStore.getState().refresh();
    expect(useRuntimePackagesStore.getState().available).toBe(false);
    expect(await useRuntimePackagesStore.getState().install("python")).toBe(
      false
    );
  });
});
