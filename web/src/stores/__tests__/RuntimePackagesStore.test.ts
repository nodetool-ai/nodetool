import useRuntimePackagesStore from "../RuntimePackagesStore";

type WindowWithApi = { api?: unknown };

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
    (window as unknown as WindowWithApi).api = {
      packages: api,
      server: { onLog: jest.fn(() => jest.fn()), restart: jest.fn() }
    };
    reset();
  });

  afterEach(() => {
    (window as unknown as WindowWithApi).api = undefined;
  });

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
    api.installRuntime.mockResolvedValueOnce({ success: false, message: "boom" });
    const ok = await useRuntimePackagesStore.getState().install("python");
    expect(ok).toBe(false);
    expect(useRuntimePackagesStore.getState().error).toBe("boom");
  });

  it("is unavailable and no-ops without the Electron IPC", async () => {
    (window as unknown as WindowWithApi).api = undefined;
    await useRuntimePackagesStore.getState().refresh();
    expect(useRuntimePackagesStore.getState().available).toBe(false);
    expect(await useRuntimePackagesStore.getState().install("python")).toBe(
      false
    );
  });
});
