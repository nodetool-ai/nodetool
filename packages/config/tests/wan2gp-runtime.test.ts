import { chmod, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import {
  WAN2GP_COMMIT,
  WAN2GP_VERSION,
  installWan2GP,
  uninstallWan2GP,
  wan2gpInstallStatus,
  type Wan2GPInstallEvent
} from "../src/wan2gp-runtime.js";

/** A minimal zip writer: deflated entries, one central directory. */
function makeZip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = deflateRawSync(Buffer.from(text));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(text.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(text.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

function serve(body: Buffer, seen: string[] = []): typeof fetch {
  return (async (url: string | URL) => {
    seen.push(String(url));
    return new Response(new Uint8Array(body));
  }) as typeof fetch;
}

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wan2gp-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** The GitHub archive layout: one top folder named after the commit. */
function archive(commit: string, extra: Record<string, string> = {}): Buffer {
  return makeZip({
    [`Wan2GP-${commit}/setup.py`]: "# setup\n",
    [`Wan2GP-${commit}/wgp.py`]: "# wgp\n",
    [`Wan2GP-${commit}/shared/api.py`]: "# api\n",
    ...extra
  });
}

/**
 * A stand-in for the installer interpreter. It logs its argv, cwd and the
 * environment the installer sets, then does what setup.py --env uv does:
 * create env_uv with an interpreter.
 */
async function fakePython(root: string, exitCode = 0): Promise<{ python: string; log: string }> {
  const log = join(root, "python.log");
  const python = join(root, "python3");
  await writeFile(
    python,
    [
      "#!/usr/bin/env bash",
      `echo "cwd=$PWD args=$* uvpython=$UV_PYTHON_INSTALL_DIR pythonpath=\${PYTHONPATH:-unset} path=$PATH" >> ${log}`,
      'echo ">>> Running: uv venv --seed --python 3.11.14 env_uv"',
      exitCode === 0 ? "mkdir -p env_uv/bin && touch env_uv/bin/python" : 'echo "No automatic profile for \"llvmpipe\"" >&2',
      `exit ${exitCode}`
    ].join("\n")
  );
  await chmod(python, 0o755);
  return { python, log };
}

describe.skipIf(process.platform === "win32")("Wan2GP runtime", () => {
  it("unpacks the pinned source, runs Wan2GP's unattended installer and reports the install", async () => {
    const root = await tempDir();
    const installDir = join(root, "wan2gp");
    const { python, log } = await fakePython(root);
    const seen: string[] = [];
    const events: Wan2GPInstallEvent[] = [];
    process.env.PYTHONPATH = "/leaks";
    try {
      const status = await installWan2GP({
        installDir,
        platform: "linux",
        python,
        uv: "/opt/conda/bin/uv",
        fetchImpl: serve(archive(WAN2GP_COMMIT), seen),
        onEvent: (event) => events.push(event)
      });
      expect(seen).toEqual([`https://codeload.github.com/deepbeepmeep/Wan2GP/zip/${WAN2GP_COMMIT}`]);
      const sourceDir = join(installDir, WAN2GP_COMMIT.slice(0, 12), "Wan2GP");
      expect(status).toEqual({
        installed: true,
        version: WAN2GP_VERSION,
        commit: WAN2GP_COMMIT,
        sourceDir,
        python: join(sourceDir, "env_uv", "bin", "python")
      });
      expect(await readFile(join(sourceDir, "shared", "api.py"), "utf8")).toBe("# api\n");
      const call = (await readFile(log, "utf8")).trim();
      expect(call).toContain(`cwd=${sourceDir} args=setup.py install --env uv --auto`);
      expect(call).toContain(`uvpython=${join(installDir, "python")}`);
      expect(call).toContain("pythonpath=unset");
      expect(call).toContain("path=/opt/conda/bin:");
      expect(events).toContainEqual({ type: "stage", label: "uv venv --seed --python 3.11.14 env_uv" });
      expect((await stat(join(sourceDir, "ckpts"))).isDirectory()).toBe(true);
    } finally {
      delete process.env.PYTHONPATH;
    }
    expect(await wan2gpInstallStatus(installDir, "linux")).toMatchObject({ installed: true, version: WAN2GP_VERSION });
    await uninstallWan2GP(installDir);
    expect(await wan2gpInstallStatus(installDir, "linux")).toEqual({ installed: false });
  });

  it("passes an explicit hardware profile", async () => {
    const root = await tempDir();
    const { python, log } = await fakePython(root);
    await installWan2GP({
      installDir: join(root, "wan2gp"),
      platform: "linux",
      python,
      uv: "/usr/bin/uv",
      profile: "RTX_40",
      fetchImpl: serve(archive(WAN2GP_COMMIT))
    });
    expect(await readFile(log, "utf8")).toContain("args=setup.py install --env uv --auto --profile RTX_40");
  });

  it("keeps the model weights and drops the old release on update", async () => {
    const root = await tempDir();
    const installDir = join(root, "wan2gp");
    const { python } = await fakePython(root);
    const old = "a".repeat(40);
    await installWan2GP({ installDir, platform: "linux", python, uv: "/usr/bin/uv", commit: old, fetchImpl: serve(archive(old)) });
    await writeFile(join(installDir, old.slice(0, 12), "Wan2GP", "ckpts", "model.safetensors"), "weights");
    const status = await installWan2GP({ installDir, platform: "linux", python, uv: "/usr/bin/uv", fetchImpl: serve(archive(WAN2GP_COMMIT)) });
    expect(status.commit).toBe(WAN2GP_COMMIT);
    expect((await readdir(installDir)).sort()).toEqual(["ckpts", "current.json", WAN2GP_COMMIT.slice(0, 12)].sort());
    expect(await readFile(join(status.sourceDir!, "ckpts", "model.safetensors"), "utf8")).toBe("weights");
  });

  it("reports the installer's own error and leaves nothing current", async () => {
    const root = await tempDir();
    const installDir = join(root, "wan2gp");
    const { python } = await fakePython(root, 2);
    await expect(
      installWan2GP({ installDir, platform: "linux", python, uv: "/usr/bin/uv", fetchImpl: serve(archive(WAN2GP_COMMIT)) })
    ).rejects.toThrow(/installer failed \(2\):[\s\S]*No automatic profile/);
    expect(await wan2gpInstallStatus(installDir, "linux")).toEqual({ installed: false });
  });

  it("refuses an archive entry outside its root", async () => {
    const root = await tempDir();
    const { python } = await fakePython(root);
    await expect(
      installWan2GP({
        installDir: join(root, "wan2gp"),
        platform: "linux",
        python,
        uv: "/usr/bin/uv",
        fetchImpl: serve(archive(WAN2GP_COMMIT, { [`Wan2GP-${WAN2GP_COMMIT}/../../escape.txt`]: "x" }))
      })
    ).rejects.toThrow(/outside its root/);
    await expect(stat(join(root, "escape.txt"))).rejects.toThrow();
  });

  it("names a failed download", async () => {
    const root = await tempDir();
    const notFound = (async () => new Response("nope", { status: 404 })) as typeof fetch;
    await expect(
      installWan2GP({ installDir: join(root, "w"), platform: "linux", python: "python3", uv: "uv", fetchImpl: notFound })
    ).rejects.toThrow(/HTTP 404/);
  });

  it("reports no install for an empty or partial directory", async () => {
    const root = await tempDir();
    expect(await wan2gpInstallStatus(join(root, "missing"), "linux")).toEqual({ installed: false });
    await mkdir(join(root, "w"), { recursive: true });
    await writeFile(join(root, "w", "current.json"), JSON.stringify({ commit: "c", version: "v", release: "r" }));
    expect(await wan2gpInstallStatus(join(root, "w"), "linux")).toEqual({ installed: false });
  });
});
