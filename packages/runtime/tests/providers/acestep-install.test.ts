import { afterEach, describe, expect, it, vi } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultAceStepInstall } from "../../src/providers/acestep-provider.js";
import { ACESTEP_TURBO_DIT } from "../../src/providers/acestep-models.js";

const roots: string[] = [];

function dataHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "acestep-install-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of roots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("defaultAceStepInstall", () => {
  it("finds the binary and models the ACE-Step package installed", async () => {
    const home = dataHome();
    vi.stubEnv("NODETOOL_HOST", "cli");
    vi.stubEnv("XDG_DATA_HOME", home);
    vi.stubEnv("PATH", "");
    const bin = join(home, "nodetool", "acestep");
    const models = join(home, "nodetool", "acestep-models");
    mkdirSync(bin, { recursive: true });
    mkdirSync(models, { recursive: true });
    const exe = join(bin, process.platform === "win32" ? "ace-server.exe" : "ace-server");
    writeFileSync(exe, "#!/bin/sh\n");
    chmodSync(exe, 0o755);
    writeFileSync(join(models, ACESTEP_TURBO_DIT), "gguf");

    expect(await defaultAceStepInstall()).toEqual({ binary: exe, modelsDir: models });
  });

  it("reports no binary when none is installed and no models folder without the turbo DiT", async () => {
    const home = dataHome();
    vi.stubEnv("NODETOOL_HOST", "cli");
    vi.stubEnv("XDG_DATA_HOME", home);
    vi.stubEnv("PATH", "");
    vi.stubEnv("HF_HOME", join(home, "hf"));
    mkdirSync(join(home, "nodetool", "acestep-models"), { recursive: true });

    const install = await defaultAceStepInstall();
    expect(install.binary).toBeNull();
    expect(install.modelsDir).toBeNull();
  });
});
