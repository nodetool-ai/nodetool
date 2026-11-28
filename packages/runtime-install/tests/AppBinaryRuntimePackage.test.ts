import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { RUNTIME_PACKAGES } from "../src/packages/definitions.js";
import { buildRuntimeContext } from "../src/packages/registry.js";
import { fakeHost } from "./fake-host.js";

let dir: string | null = null;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = null;
});

describe("AppBinaryRuntimePackage", () => {
  it("lists Blender and Chrome in the Package Manager", () => {
    expect(RUNTIME_PACKAGES.blender.name).toBe("Blender");
    expect(RUNTIME_PACKAGES.chrome.category).toBe("tool");
  });

  it("reports the install under the runtime root and resolves its executable", async () => {
    dir = await mkdtemp(join(tmpdir(), "nodetool-app-binary-"));
    const ctx = buildRuntimeContext(fakeHost({ dataDir: dir }));
    expect(await RUNTIME_PACKAGES.blender.status(ctx)).toEqual({ installed: false, installedVersion: undefined });
    expect(await RUNTIME_PACKAGES.blender.resolve(ctx)).toBeNull();

    await mkdir(join(dir, "blender"), { recursive: true });
    await writeFile(join(dir, "blender", "blender"), "#!/bin/sh\n", { mode: 0o755 });
    await writeFile(join(dir, "blender", "nodetool-runtime.json"), JSON.stringify({ version: "5.2.4" }));

    expect(await RUNTIME_PACKAGES.blender.status(ctx)).toEqual({ installed: true, installedVersion: "5.2.4" });
    expect(await RUNTIME_PACKAGES.blender.resolve(ctx)).toEqual({
      binaries: { blender: join(dir, "blender", "blender") }
    });
    await RUNTIME_PACKAGES.blender.uninstall(ctx);
    expect((await RUNTIME_PACKAGES.blender.status(ctx)).installed).toBe(false);
  });
});
