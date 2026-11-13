import { trpcClient } from "../../trpc/client";
import { reportClientError } from "../errorTraceReporting";
import * as browser from "../browser";
import * as staleness from "../../lib/deployStaleness";
import { useStaleDeployStore } from "../../stores/StaleDeployStore";

const capture = trpcClient.errorTraces.capture.mutate as jest.Mock;

describe("reportClientError", () => {
  beforeEach(() => capture.mockClear());

  it("sends one trace per distinct crash", () => {
    const error = new TypeError("x is undefined");
    reportClientError(error, "Inspector");
    reportClientError(error, "Inspector");
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "web",
        error_type: "TypeError",
        message: "x is undefined",
        context: expect.objectContaining({ component: "Inspector" })
      })
    );
  });

  it("never throws when the request fails", async () => {
    capture.mockRejectedValueOnce(new Error("offline"));
    expect(() => reportClientError(new Error("other"), "route")).not.toThrow();
    await Promise.resolve();
  });

  it("links separate browser crashes by run identifiers without payload content", () => {
    const error = new TypeError("widget failed");
    const first = { trace_id: "a".repeat(32), app_run_id: "b".repeat(32), span_id: "c".repeat(16) };
    reportClientError(error, "Output-1", first);
    reportClientError(error, "Output-1", { ...first, app_run_id: "d".repeat(32) });
    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ context: {
      component: "Output-1", runtime: "browser", ...first
    } }));
  });

  it("links an Electron renderer crash using the same identifier-only context", () => {
    const detection = jest.spyOn(browser, "getIsElectronDetails").mockReturnValue({ isElectron: true, hasElectronBridge: true,
      isRendererProcess: true, hasElectronVersionInWindowProcess: true, hasElectronInUserAgent: true });
    try {
      const run = { trace_id: "e".repeat(32), app_run_id: "f".repeat(32), span_id: "a".repeat(16) };
      reportClientError(new TypeError("Electron widget failed"), "Electron-Output", run);
      expect(capture).toHaveBeenCalledWith(expect.objectContaining({ source: "electron",
        context: { component: "Electron-Output", runtime: "electron-renderer", ...run } }));
    } finally { detection.mockRestore(); }
  });

  it("names a thrown plain object by its message instead of [object Object]", () => {
    reportClientError({ message: "Asset not found", code: 404 }, "PlainObject");
    reportClientError({ code: "E_BUSY" }, "PlainObjectNoMessage");
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ message: "Asset not found" }));
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ message: '{"code":"E_BUSY"}' }));
  });

  it("records a chunk that failed after a new deploy as a warning and opens the reload prompt", async () => {
    const check = jest.spyOn(staleness, "deployIsStale").mockResolvedValue(true);
    try {
      reportClientError(new TypeError(
        "Failed to fetch dynamically imported module: https://app.nodetool.ai/assets/WorkspaceShell-old.js"
      ), "route");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(capture).toHaveBeenCalledWith(expect.objectContaining({
        severity: "warning",
        context: expect.objectContaining({ cause: "stale-deploy" })
      }));
      expect(useStaleDeployStore.getState().open).toBe(true);
    } finally {
      check.mockRestore();
      useStaleDeployStore.setState({ open: false });
    }
  });

  it("keeps a chunk failure on a current deploy as an error", async () => {
    const check = jest.spyOn(staleness, "deployIsStale").mockResolvedValue(false);
    try {
      reportClientError(new TypeError("Importing a module script failed."), "route");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(capture).toHaveBeenCalledWith(expect.objectContaining({ severity: "error" }));
      expect(capture.mock.calls[0][0].context.cause).toBeUndefined();
    } finally {
      check.mockRestore();
    }
  });
});
