/**
 * Tests for `bugReports.submit`: the hosted app's Report a Bug dialog posts
 * here instead of opening a GitHub issue.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createBugReport: vi.fn(),
  adapter: {
    store: vi.fn(),
    delete: vi.fn(),
    uriForKey: (key: string) => `memory://${key}`
  }
}));

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return { ...actual, createBugReport: mocks.createBugReport };
});

vi.mock("../src/lib/storage.js", () => ({
  getAssetAdapter: vi.fn(() => mocks.adapter)
}));

import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);

function makeCtx(userId = "user-1"): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

const report = {
  source: "manual" as const,
  title: "[Bug]: Export hangs",
  description: "Export hangs",
  steps: "1. Export",
  body: "### Describe the bug\n\nExport hangs"
};

/** A minimal valid zip: just the end-of-central-directory record. */
const EMPTY_ZIP = Buffer.from([
  0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
]);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createBugReport.mockResolvedValue({});
  mocks.adapter.store.mockResolvedValue("memory://stored");
  mocks.adapter.delete.mockResolvedValue(true);
});

describe("bugReports.submit", () => {
  it("stores the report under the caller and the zip under their prefix", async () => {
    const caller = createCaller(makeCtx("user-1"));
    const { id } = await caller.bugReports.submit({
      ...report,
      bundle_base64: EMPTY_ZIP.toString("base64")
    });

    expect(id).toMatch(/^[0-9a-f]{32}$/);
    const key = `user-1/bug-report-${id}.zip`;
    expect(mocks.adapter.store).toHaveBeenCalledWith(
      key,
      new Uint8Array(EMPTY_ZIP),
      "application/zip"
    );
    expect(mocks.createBugReport).toHaveBeenCalledWith({
      id,
      userId: "user-1",
      source: "manual",
      title: report.title,
      description: report.description,
      steps: report.steps,
      expected: null,
      body: report.body,
      bundleKey: key,
      bundleSize: EMPTY_ZIP.length
    });
  });

  it("stores a report without a bundle", async () => {
    const caller = createCaller(makeCtx());
    await caller.bugReports.submit(report);

    expect(mocks.adapter.store).not.toHaveBeenCalled();
    expect(mocks.createBugReport).toHaveBeenCalledWith(
      expect.objectContaining({ bundleKey: null, bundleSize: null })
    );
  });

  it("rejects a bundle that is not a zip", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.bugReports.submit({
        ...report,
        bundle_base64: Buffer.from("not a zip").toString("base64")
      })
    ).rejects.toThrow(/not a zip/);
    expect(mocks.adapter.store).not.toHaveBeenCalled();
    expect(mocks.createBugReport).not.toHaveBeenCalled();
  });

  it("removes the stored zip when the row cannot be written", async () => {
    mocks.createBugReport.mockRejectedValue(new Error("db down"));
    const caller = createCaller(makeCtx("user-1"));
    await expect(
      caller.bugReports.submit({
        ...report,
        bundle_base64: EMPTY_ZIP.toString("base64")
      })
    ).rejects.toThrow();

    const [key] = mocks.adapter.store.mock.calls[0] as [string];
    expect(mocks.adapter.delete).toHaveBeenCalledWith(`memory://${key}`);
  });
});
