import { describe, expect, it } from "vitest";
import {
  DownloadManager,
  getExistingDownloadManager
} from "../src/hf-download-manager.js";

describe("DownloadManager state snapshots", () => {
  it("returns null for an untracked download without starting it", () => {
    const manager = new DownloadManager();
    expect(manager.getDownloadState("org/model")).toBeNull();
  });

  it("does not create user state during an existing-manager lookup", () => {
    expect(getExistingDownloadManager("read-only-user")).toBeNull();
    expect(getExistingDownloadManager("read-only-user")).toBeNull();
  });

  it("bounds state snapshot requests", () => {
    const manager = new DownloadManager();
    expect(manager.listDownloadStates()).toEqual([]);
    expect(() => manager.listDownloadStates(0)).toThrow(RangeError);
    expect(() => manager.listDownloadStates(501)).toThrow(RangeError);
  });
});
