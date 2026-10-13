import { describe, expect, it, vi } from "vitest";
import { StorageWorkspace, type ProcessingContext } from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { fileCapabilityRun } from "../src/capabilities/files.js";

vi.mock("@nodetool-ai/config", async (importOriginal) => {
  const original = await importOriginal<typeof import("@nodetool-ai/config")>();
  return {
    ...original,
    importOptionalModule: async (specifier: string): Promise<unknown> => {
      if (specifier === "js-tiktoken") {
        throw new Error("Cannot find package 'js-tiktoken'");
      }
      return original.importOptionalModule(specifier);
    }
  };
});

describe("file reads without the tokenizer runtime package", () => {
  it("reads small files and enforces the estimated token limit for CJK", async () => {
    const workspace = new StorageWorkspace(new InMemoryStorageAdapter());
    // Only workspace access is needed for this file read.
    const context = { workspace } as unknown as ProcessingContext;
    const run = fileCapabilityRun(context);
    await workspace.write("small.txt", "hello world");
    expect(await run.invoke("read_file", { file_path: "small.txt" })).toBe("1\thello world");
    await workspace.write("large.txt", "界".repeat(26_000));
    expect(await run.invoke("read_file", { file_path: "large.txt" })).toContain("26000 tokens, over the 25000-token limit");
  });
});
