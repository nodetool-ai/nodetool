import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ACESTEP_COMMIT, aceServerPath } from "@nodetool-ai/config/acestep-runtime";
import { AceStepRuntimePackage } from "../src/packages/AceStepRuntimePackage.js";
import { RUNTIME_PACKAGES } from "../src/packages/definitions.js";
import { buildRuntimeContext } from "../src/packages/registry.js";
import type { RuntimeProgress } from "../src/packages/types.js";
import { fakeHost } from "./fake-host.js";

const dirs: string[] = [];
async function context(platform: NodeJS.Platform, arch: string) {
  const dir = await mkdtemp(join(tmpdir(), "acestep-pkg-"));
  dirs.push(dir);
  return { dir, ctx: buildRuntimeContext(fakeHost({ platform, arch, dataDir: dir })) };
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function collect(stream: AsyncIterable<RuntimeProgress>): Promise<RuntimeProgress[]> {
  const out: RuntimeProgress[] = [];
  for await (const event of stream) out.push(event);
  return out;
}

describe("AceStepRuntimePackage", () => {
  const pkg = new AceStepRuntimePackage();

  it("is registered for macOS only", () => {
    expect(RUNTIME_PACKAGES["acestep"]).toBeInstanceOf(AceStepRuntimePackage);
    expect(pkg.platforms).toEqual(["darwin"]);
  });

  it("reports an install on an unsupported platform as an error, not a throw", async () => {
    const { ctx } = await context("linux", "x64");
    const events = await collect(pkg.install(ctx, new AbortController().signal));
    expect(events).toEqual([expect.objectContaining({ type: "error", message: expect.stringMatching(/Apple silicon/) })]);
  });

  it("refuses to install while the archive digest is unset", async () => {
    const { ctx } = await context("darwin", "arm64");
    const { ACESTEP_SHA256 } = await import("@nodetool-ai/config/acestep-runtime");
    if (ACESTEP_SHA256 !== null) return;
    const events = await collect(pkg.install(ctx, new AbortController().signal));
    expect(events.at(-1)).toEqual(expect.objectContaining({ type: "error", message: expect.stringMatching(/no pinned SHA-256/) }));
  });

  it("resolves the installed binary and reports its commit", async () => {
    const { dir, ctx } = await context("darwin", "arm64");
    expect(await pkg.resolve(ctx)).toBeNull();
    expect((await pkg.status(ctx)).installed).toBe(false);
    const installDir = join(dir, "acestep");
    await mkdir(installDir, { recursive: true });
    await writeFile(aceServerPath(installDir), "x");
    await writeFile(join(installDir, "nodetool-acestep.json"), JSON.stringify({ commit: ACESTEP_COMMIT }));
    expect(await pkg.resolve(ctx)).toEqual({ binaries: { "ace-server": join(dir, "acestep", "ace-server") } });
    expect(await pkg.status(ctx)).toMatchObject({ installed: true, installedVersion: ACESTEP_COMMIT, updateAvailable: false });
    await pkg.uninstall(ctx);
    expect(await pkg.resolve(ctx)).toBeNull();
  });
});
