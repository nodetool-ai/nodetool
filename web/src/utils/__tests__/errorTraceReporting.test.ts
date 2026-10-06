import { trpcClient } from "../../trpc/client";
import { reportClientError } from "../errorTraceReporting";
import * as browser from "../browser";

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
});
