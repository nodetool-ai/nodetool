import { afterEach, describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { MissingPackError } from "@nodetool-ai/protocol";
import {
  currentPackInstall,
  loadPackLoaderContext,
  setPackLoaderContext,
  setPackLoaderContextProvider,
  type PackLoaderContext
} from "../src/loader-context.js";

afterEach(() => setPackLoaderContext(undefined));

const context: PackLoaderContext = {
  coreVersion: "1.0.0",
  packs: [],
  install: { supported: true, reason: null, command: null }
};

const missingPack = new MissingPackError({
  error: "missing_pack", packs: [], runtimeLibraries: [], nodeTypes: [],
  install: { supported: false, reason: "host cannot install", command: null },
  restartRequired: false
});

describe("host pack inventory initialization", () => {
  it("defers IO and shares one snapshot across concurrent pack requests", async () => {
    let scans = 0;
    setPackLoaderContextProvider(() => {
      scans++;
      return context;
    });
    expect(scans).toBe(0);
    expect(currentPackInstall()).toBeUndefined();
    expect(await Promise.all([loadPackLoaderContext(), loadPackLoaderContext()])).toEqual([context, context]);
    expect(await loadPackLoaderContext()).toBe(context);
    expect(scans).toBe(1);
    expect(currentPackInstall()).toBe(context.install);
  });

  it.each([
    new Error("inventory read failed"),
    missingPack,
    JSON.parse(JSON.stringify(missingPack)),
    runInNewContext('new Error("foreign inventory read failed")'),
    "inventory read failed",
    null
  ])("preserves initialization failure identity and allows an explicit retry: %s", async (failure) => {
    let scans = 0;
    setPackLoaderContextProvider(() => {
      scans++;
      if (scans === 1) {
        throw failure;
      }
      return context;
    });
    await expect(loadPackLoaderContext()).rejects.toBe(failure);
    expect(await loadPackLoaderContext()).toBe(context);
    expect(scans).toBe(2);
  });
});
