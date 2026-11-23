/**
 * The cloud window's synchronization status: Saved to cloud only once
 * nothing is left in memory or in the local store, Offline in place of
 * Changes waiting while the computer is offline, and Not saving for a failed
 * local write.
 */
import { afterEach, describe, expect, it } from "@jest/globals";

import { cloudSyncStatus, reportCloudSyncStatus, useCloudSyncStatusStore } from "../CloudSyncStatusStore";

const setOnline = (online: boolean): void => {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
};

afterEach(() => {
  setOnline(true);
  useCloudSyncStatusStore.setState({ statuses: {} });
});

describe("cloudSyncStatus", () => {
  it("reads the mirror and the online flag", () => {
    expect(cloudSyncStatus("clean", true)).toBe("savedToCloud");
    expect(cloudSyncStatus("clean", false)).toBe("savedToCloud");
    expect(cloudSyncStatus("storing", true)).toBe("changesWaiting");
    expect(cloudSyncStatus("stored", true)).toBe("changesWaiting");
    expect(cloudSyncStatus("stored", false)).toBe("offline");
    expect(cloudSyncStatus("notSaving", false)).toBe("notSaving");
  });
});

describe("reportCloudSyncStatus", () => {
  it("sets a document's status from its mirror and removes it when the drafts stop", () => {
    setOnline(false);
    reportCloudSyncStatus("workflow:w1", "stored");
    expect(useCloudSyncStatusStore.getState().statuses).toEqual({ "workflow:w1": "offline" });
    setOnline(true);
    reportCloudSyncStatus("workflow:w1", "stored");
    expect(useCloudSyncStatusStore.getState().statuses).toEqual({ "workflow:w1": "changesWaiting" });
    reportCloudSyncStatus("workflow:w1", null);
    expect(useCloudSyncStatusStore.getState().statuses).toEqual({});
  });
});
