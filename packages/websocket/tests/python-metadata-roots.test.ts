import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectPipMetadataRoots } from "../src/lib/python-metadata-roots.js";

const hasPython3 = spawnSync("python3", ["--version"]).status === 0;

function writeDist(
  site: string,
  name: string,
  files: Record<string, string>,
  record: string[]
): void {
  const distInfo = join(site, `${name.replace(/-/g, "_")}-1.0.dist-info`);
  mkdirSync(distInfo, { recursive: true });
  writeFileSync(
    join(distInfo, "METADATA"),
    `Metadata-Version: 2.1\nName: ${name}\nVersion: 1.0\n`
  );
  writeFileSync(join(distInfo, "RECORD"), record.map((r) => `${r},,\n`).join(""));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(distInfo, rel, ".."), { recursive: true });
    writeFileSync(join(distInfo, rel), body);
  }
}

describe.skipIf(!hasPython3)("detectPipMetadataRoots", () => {
  let dir: string | null = null;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = null;
    }
  });

  it("returns package_metadata dirs and editable project roots of nodetool-* distributions only", async () => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "nt-pymeta-")));
    const site = join(dir, "site");
    const project = join(dir, "editable-project");
    const metadataFile = "nodetool/package_metadata/nodetool-regular.json";
    mkdirSync(join(site, "nodetool", "package_metadata"), { recursive: true });
    writeFileSync(join(site, metadataFile), "{}");
    mkdirSync(project, { recursive: true });

    writeDist(site, "nodetool-regular", {}, [metadataFile]);
    writeDist(
      site,
      "nodetool-editable",
      {
        "direct_url.json": JSON.stringify({
          url: pathToFileURL(project).href,
          dir_info: { editable: true }
        })
      },
      []
    );
    const unrelatedFile = "other/package_metadata/other.json";
    mkdirSync(join(site, "other", "package_metadata"), { recursive: true });
    writeFileSync(join(site, unrelatedFile), "{}");
    writeDist(site, "unrelated-package", {}, [unrelatedFile]);

    const roots = await detectPipMetadataRoots({
      pythons: ["python3"],
      env: { ...process.env, PYTHONPATH: site }
    });

    expect(roots.sort()).toEqual(
      [join(site, "nodetool", "package_metadata"), project].sort()
    );
  });

  it("returns an empty list when no interpreter can be started", async () => {
    await expect(
      detectPipMetadataRoots({ pythons: ["nodetool-missing-python"] })
    ).resolves.toEqual([]);
  });

  it.skipIf(process.platform === "win32")(
    "asks the bridge's interpreter (NODETOOL_PYTHON) before python3 on PATH",
    async () => {
      dir = realpathSync(mkdtempSync(join(tmpdir(), "nt-pymeta-")));
      const fakePython = join(dir, "bridge-python");
      writeFileSync(fakePython, `#!/bin/sh\necho '${JSON.stringify([dir])}'\n`);
      chmodSync(fakePython, 0o755);
      vi.stubEnv("NODETOOL_PYTHON", fakePython);
      try {
        await expect(detectPipMetadataRoots()).resolves.toEqual([dir]);
      } finally {
        vi.unstubAllEnvs();
      }
    }
  );
});
