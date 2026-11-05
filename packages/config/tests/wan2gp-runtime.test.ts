import { chmod, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as nodeImport from "../src/node-import.js";
import { setWan2GPCatalogStatus, readWan2GPCatalog } from "../src/wan2gp-helper.js";
import {
  WAN2GP_COMMIT,
  WAN2GP_VERSION,
  installWan2GP,
  installerFailure,
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
async function fakePython(
  root: string,
  failure?: { exit: number; stderr: string }
): Promise<{ python: string; log: string }> {
  const log = join(root, "python.log");
  const python = join(root, "python3");
  // The environment's interpreter answers the helper's catalog command.
  const venvPython = join(root, "venv-python");
  const row = { model_type: "flux", name: "Flux 1 Dev 12B", main_output: ["image"], capabilities: ["text_to_image"], media_inputs: {}, status: "missing" };
  await writeFile(
    venvPython,
    [
      "#!/usr/bin/env bash",
      `echo "helper=$1 command=$2 cwd=$PWD" >> ${log}`,
      `if [ "$2" = catalog ]; then echo '${JSON.stringify({ version: 1, models: [row] })}' > "$3"; echo '{"type":"catalog","count":1}'; fi`
    ].join("\n")
  );
  await chmod(venvPython, 0o755);
  await writeFile(
    python,
    [
      "#!/usr/bin/env bash",
      `echo "cwd=$PWD args=$* uvpython=$UV_PYTHON_INSTALL_DIR pythonpath=\${PYTHONPATH:-unset} path=$PATH" >> ${log}`,
      'echo ">>> Running: uv venv --seed --python 3.11.14 env_uv"',
      failure ? `echo "${failure.stderr}" >&2` : `mkdir -p env_uv/bin && cp ${venvPython} env_uv/bin/python`,
      `exit ${failure?.exit ?? 0}`
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
      // The last step writes the model catalog with the new environment.
      expect(call).toContain(`helper=${join(installDir, WAN2GP_COMMIT.slice(0, 12), "nodetool_wan2gp.py")} command=catalog cwd=${sourceDir}`);
      expect((await readWan2GPCatalog(sourceDir))?.map((model) => model.model_type)).toEqual(["flux"]);
      expect(events).toContainEqual({ type: "log", line: "Wan2GP offers 1 models" });
    } finally {
      delete process.env.PYTHONPATH;
    }
    expect(await wan2gpInstallStatus(installDir, "linux")).toMatchObject({ installed: true, version: WAN2GP_VERSION });
    await uninstallWan2GP(installDir);
    expect(await wan2gpInstallStatus(installDir, "linux")).toEqual({ installed: false });
  });

  it("makes a repair process wait until a pending catalog status write finishes", async () => {
    const { spawn } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const root = await tempDir();
    const installDir = join(root, "wan2gp");
    const { python } = await fakePython(root);
    const options = { installDir, platform: "linux", python, uv: "uv", fetchImpl: serve(archive(WAN2GP_COMMIT)) };
    const status = await installWan2GP(options);
    const sourceDir = status.sourceDir!;
    const catalog = join(sourceDir, "..", "catalog.json");
    const pendingRename = Promise.withResolvers<void>();
    const resumeRename = Promise.withResolvers<void>();
    const originalImport = nodeImport.importNodeBuiltin;
    const spy = vi.spyOn(nodeImport, "importNodeBuiltin").mockImplementation(async <T>(name: string): Promise<T | null> => {
      const module = await originalImport<T>(name);
      if (name !== "node:fs/promises") return module;
      const fs = await originalImport<typeof import("node:fs/promises")>(name);
      if (!fs) throw new Error("Missing test filesystem");
      const filesystem = {
        ...fs,
        rename: async (...args: Parameters<typeof fs.rename>) => {
          if (args[0] === `${catalog}.partial`) {
            pendingRename.resolve();
            await resumeRename.promise;
          }
          return fs.rename(...args);
        }
      };
      // This test replaces only rename on the requested filesystem module.
      return filesystem as unknown as T;
    });
    const writing = setWan2GPCatalogStatus(sourceDir, "flux", "available");
    const written = writing.then(() => null, (error: unknown) => error);
    await pendingRename.promise;
    const archiveFile = join(root, "source.zip");
    await writeFile(archiveFile, archive(WAN2GP_COMMIT));
    const childScript = join(root, "repair.mjs");
    const moduleUrl = new URL("../src/wan2gp-runtime.ts", import.meta.url).href;
    const tsxApi = fileURLToPath(new URL("../../../node_modules/tsx/dist/esm/api/index.mjs", import.meta.url));
    await writeFile(childScript, `
      import { readFile } from "node:fs/promises";
      import { tsImport } from ${JSON.stringify(tsxApi)};
      const { installWan2GP } = await tsImport(${JSON.stringify(moduleUrl)}, import.meta.url);
      const archive = await readFile(process.argv[4]);
      await installWan2GP({
        installDir: process.argv[2], platform: "linux", python: process.argv[3], uv: "uv",
        fetchImpl: async () => new Response(new Uint8Array(archive)),
        onEvent: (event) => {
          if (event.type === "stage" && event.label === "Waiting for another Wan2GP operation") {
            process.stdout.write("waiting\\n");
          }
        }
      });
      process.stdout.write("installed\\n");
    `);
    const child = spawn(process.execPath, [childScript, installDir, python, archiveFile], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let errors = "";
    const phase = Promise.withResolvers<string>();
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes("waiting\n")) phase.resolve("waiting");
      else if (output.includes("installed\n")) phase.resolve("installed");
    });
    child.stderr.on("data", (chunk: Buffer) => { errors += chunk.toString(); });
    const finished = new Promise<number | null>((resolve, reject) => {
      child.once("error", (error) => { phase.reject(error); reject(error); });
      child.once("exit", (code) => { phase.resolve("exited"); resolve(code); });
    });
    try {
      expect(await phase.promise, errors).toBe("waiting");
      expect(child.exitCode).toBeNull();
    } finally {
      resumeRename.resolve();
      await written;
      spy.mockRestore();
      expect(await finished, errors).toBe(0);
      child.kill();
    }
    expect(await written).toBeNull();
    expect((await readWan2GPCatalog(sourceDir))?.[0].status).toBe("missing");
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
    const { python } = await fakePython(root, { exit: 2, stderr: "uv: network unreachable" });
    await expect(
      installWan2GP({ installDir, platform: "linux", python, uv: "/usr/bin/uv", fetchImpl: serve(archive(WAN2GP_COMMIT)) })
    ).rejects.toThrow(/installer failed \(2\):[\s\S]*network unreachable/);
    expect(await wan2gpInstallStatus(installDir, "linux")).toEqual({ installed: false });
  });

  it("says in plain words that no supported graphics card was found", async () => {
    const root = await tempDir();
    const stderr = "usage: setup.py\nsetup.py: error: No automatic profile for 'Unknown'; select --profile from GTX_10, RTX_40, MPS";
    const { python } = await fakePython(root, { exit: 2, stderr });
    const install = installWan2GP({ installDir: join(root, "w"), platform: "linux", python, uv: "uv", fetchImpl: serve(archive(WAN2GP_COMMIT)) });
    await expect(install).rejects.toThrow(
      "Wan2GP found no supported graphics card on this computer. It runs on NVIDIA GeForce GTX 10 series and newer, AMD Radeon, and Apple silicon. If the card is there, update its driver and install again. To choose a profile yourself, run `nodetool runtime add wan2gp --profile <name>`, for example RTX_40. Profiles: GTX_10, RTX_40, MPS."
    );
    expect(installerFailure(2, ["setup.py: error: No automatic profile for 'Intel Arc A770'; select --profile from RTX_40"])).toMatch(
      /^Wan2GP has no setup for the graphics card it found \(Intel Arc A770\)\./
    );
    expect(installerFailure(2, ["setup.py: error: Hardware profile MPS is not supported on linux"])).toMatch(
      /^Wan2GP's MPS profile does not run on linux\./
    );
    // Installer output of any shape reads in linear time.
    const hostile = "No automatic profile for ''; select --profile from a".repeat(50_000);
    const started = performance.now();
    expect(installerFailure(2, [hostile, "Hardware profile ".repeat(50_000)])).toMatch(/^Wan2GP has no setup/);
    expect(installerFailure(2, ["No automatic profile for '" + "a".repeat(100_000)])).toMatch(/installer failed/);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("finishes the install when the model catalog cannot be written yet", async () => {
    const root = await tempDir();
    const installDir = join(root, "wan2gp");
    const { python } = await fakePython(root);
    await writeFile(join(root, "venv-python"), "#!/usr/bin/env bash\necho 'No module named torch' >&2\nexit 1\n");
    const events: Wan2GPInstallEvent[] = [];
    const status = await installWan2GP({
      installDir,
      platform: "linux",
      python,
      uv: "uv",
      fetchImpl: serve(archive(WAN2GP_COMMIT)),
      onEvent: (event) => events.push(event)
    });
    expect(status.installed).toBe(true);
    expect(await readWan2GPCatalog(status.sourceDir!)).toBeNull();
    expect(events).toContainEqual({ type: "log", line: expect.stringMatching(/Could not read Wan2GP's model list yet[\s\S]*No module named torch/) });
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
