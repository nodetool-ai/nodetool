import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { findModelFiles, parseModelFolders } from "../../src/providers/model-folders.js";

describe("parseModelFolders", () => {
  it("splits on semicolons, newlines and the path delimiter", () => {
    expect(parseModelFolders(" /a ; /b\n/c:/d ", ":")).toEqual(["/a", "/b", "/c", "/d"]);
  });

  it("keeps Windows drive letters when the delimiter is a semicolon", () => {
    expect(parseModelFolders("C:\\ComfyUI\\models;D:\\models", ";")).toEqual([
      "C:\\ComfyUI\\models",
      "D:\\models"
    ]);
  });

  it("drops blanks and duplicates", () => {
    expect(parseModelFolders(";/a;;/a;", ":")).toEqual(["/a"]);
    expect(parseModelFolders(undefined)).toEqual([]);
  });
});

describe("findModelFiles", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "model-folders-"));
    await mkdir(join(root, "models", "checkpoints", "sdxl"), { recursive: true });
    await mkdir(join(root, "models", ".cache"), { recursive: true });
    await writeFile(join(root, "models", "checkpoints", "sdxl", "base.safetensors"), "x");
    await writeFile(join(root, "models", "checkpoints", "README.md"), "x");
    await writeFile(join(root, "models", ".cache", "hidden.safetensors"), "x");
    await mkdir(join(root, "extra"));
    await writeFile(join(root, "extra", "linked.SAFETENSORS"), "x");
    await symlink(join(root, "extra"), join(root, "models", "extra-link"));
    // A loop back to the root must not recurse forever.
    await symlink(join(root, "models"), join(root, "models", "checkpoints", "loop"));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("finds matching files in subfolders and symlinked folders, once each", async () => {
    const files = await findModelFiles([join(root, "models")], [".safetensors"]);
    expect(files).toEqual([
      join(root, "models", "checkpoints", "sdxl", "base.safetensors"),
      join(root, "models", "extra-link", "linked.SAFETENSORS")
    ]);
  });

  it("returns nothing for a missing folder", async () => {
    expect(await findModelFiles([join(root, "absent")], [".gguf"])).toEqual([]);
  });
});
