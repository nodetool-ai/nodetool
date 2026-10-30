import { afterEach, expect, it } from "vitest";
import { importPack, setBundledPackModules } from "../src/import-pack.js";

afterEach(() => setBundledPackModules({}));

it("serves a bundled host's compiled-in module instead of resolving it from disk", async () => {
  const integration = { resolveComfyWorkflow: (): void => undefined };
  setBundledPackModules({
    "@nodetool-ai/integration-nodes": () => Promise.resolve(integration),
    "@nodetool-ai/document-nodes/lib/pdf-text": () => Promise.resolve({ bundled: true })
  });
  expect(await importPack("integration")).toBe(integration);
  expect(await importPack("document", "lib/pdf-text")).toEqual({ bundled: true });
});

it("keeps validating pack IDs and specifiers before using a bundled module", async () => {
  setBundledPackModules({ "@nodetool-ai/replicate-nodes": () => Promise.resolve({}) });
  await expect(importPack("fal", "@nodetool-ai/replicate-nodes")).rejects.toThrow(/does not provide/);
  await expect(importPack("unknown-pack")).rejects.toThrow(/Unknown node pack/);
});
