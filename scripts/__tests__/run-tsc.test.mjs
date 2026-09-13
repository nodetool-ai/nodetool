import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DEFAULT_TSC_HEAP_MB,
  getTscCommand,
  resolveTsc,
  typeScriptBuildEnv,
  validateTscVersion
} from "../run-tsc.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const runner = join(repoRoot, "scripts", "run-tsc.mjs");

const JS_TSC = `import { getHeapStatistics } from "node:v8";
console.log(JSON.stringify({
  heapMb: Math.round(getHeapStatistics().heap_size_limit / 1048576),
  args: process.argv.slice(2),
  cwd: process.cwd(),
  marker: process.env.STUB_TSC_MARKER
}));
if (process.env.STUB_TSC_SIGNAL) {
  process.kill(process.pid, process.env.STUB_TSC_SIGNAL);
}
process.exit(Number(process.env.STUB_TSC_EXIT ?? 0));
`;

const NATIVE_TSC = `#!/usr/bin/env node
console.log(JSON.stringify({
  args: process.argv.slice(2),
  cwd: process.cwd(),
  marker: process.env.STUB_TSC_MARKER,
  nodeOptions: process.env.NODE_OPTIONS ?? ""
}));
process.exit(Number(process.env.STUB_TSC_EXIT ?? 0));
`;

let workDir;
let projectDir;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "run-tsc-"));
  projectDir = join(workDir, "project");
  await mkdir(join(projectDir, "node_modules", "typescript", "bin"), { recursive: true });
  await mkdir(join(workDir, "node_modules", "@typescript", "native", "bin"), { recursive: true });
  const nativePlatformPackage = `typescript-${process.platform}-${process.arch}`;
  await mkdir(join(workDir, "node_modules", "@typescript", nativePlatformPackage, "lib"), {
    recursive: true
  });
  await mkdir(join(workDir, "node_modules", "@typescript", "typescript-win32-x64", "lib"), {
    recursive: true
  });
  await mkdir(join(workDir, "src"), { recursive: true });
  await writeFile(
    join(projectDir, "node_modules", "typescript", "package.json"),
    JSON.stringify({ name: "@typescript/typescript6", version: "6.0.2", bin: { tsc6: "bin/tsc" } })
  );
  await writeFile(join(projectDir, "node_modules", "typescript", "bin", "tsc"), JS_TSC);
  await writeFile(
    join(workDir, "node_modules", "@typescript", "native", "package.json"),
    JSON.stringify({ name: "typescript", version: "7.0.2", bin: { tsc: "bin/tsc" } })
  );
  await writeFile(
    join(workDir, "node_modules", "@typescript", nativePlatformPackage, "package.json"),
    JSON.stringify({ name: `@typescript/${nativePlatformPackage}`, version: "7.0.2" })
  );
  await writeFile(
    join(workDir, "node_modules", "@typescript", "typescript-win32-x64", "package.json"),
    JSON.stringify({ name: "@typescript/typescript-win32-x64", version: "7.0.2" })
  );
  const nativeBin = join(
    workDir,
    "node_modules",
    "@typescript",
    nativePlatformPackage,
    "lib",
    "tsc"
  );
  await writeFile(nativeBin, NATIVE_TSC);
  await chmod(nativeBin, 0o755);
  await writeFile(
    join(workDir, "node_modules", "@typescript", "typescript-win32-x64", "lib", "tsc.exe"),
    "stub"
  );
});
afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

function runRunner(version, env = {}, cwd = projectDir) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [runner, "--noEmit", "-p", "x.json"], {
      cwd,
      env: {
        ...process.env,
        NODE_OPTIONS: "",
        NODETOOL_TSC_VERSION: version,
        STUB_TSC_MARKER: "forwarded",
        NODETOOL_TSC_HEAP_MB: "",
        ...env
      }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("exit", (code, signal) => resolvePromise({ code, signal, stdout, stderr }));
  });
}

describe("compiler selection", () => {
  it("validates only TypeScript 6 and 7", () => {
    expect(validateTscVersion("6")).toBe("6");
    expect(validateTscVersion("7")).toBe("7");
    expect(() => validateTscVersion("5")).toThrow(/expected 6 or 7/);
  });

  it("prefers a standalone project's local package", () => {
    expect(resolveTsc({ version: "6", startDir: join(projectDir, "src"), rootDir: workDir }).packageRoot).toBe(
      join(projectDir, "node_modules", "typescript")
    );
    expect(resolveTsc({ version: "7", startDir: projectDir, rootDir: workDir }).packageRoot).toBe(
      join(workDir, "node_modules", "@typescript", "native")
    );
  });

  it("resolves the declared tsc6 bin without assuming bin/tsc", () => {
    const compiler = resolveTsc({ version: "6", startDir: projectDir, rootDir: workDir });
    expect(compiler.binPath).toBe(join(projectDir, "node_modules", "typescript", "bin", "tsc"));
    expect(compiler.isJavaScript).toBe(true);
  });

  it("resolves the TypeScript 7 native executable for the host platform", () => {
    const compiler = resolveTsc({ version: "7", startDir: projectDir, rootDir: workDir });
    expect(compiler.binPath).toBe(
      join(
        workDir,
        "node_modules",
        "@typescript",
        `typescript-${process.platform}-${process.arch}`,
        "lib",
        "tsc"
      )
    );
    expect(compiler.isJavaScript).toBe(false);
  });

  it("selects the .exe native binary for Windows", () => {
    const command = getTscCommand({
      version: "7",
      startDir: projectDir,
      rootDir: workDir,
      platform: "win32",
      arch: "x64",
      args: ["--noEmit"]
    });
    expect(command.compiler.binPath).toBe(
      join(
        workDir,
        "node_modules",
        "@typescript",
        "typescript-win32-x64",
        "lib",
        "tsc.exe"
      )
    );
    expect(command.command).toBe(command.compiler.binPath);
    expect(command.args).toEqual(["--noEmit"]);
  });

  it("reports a corrective error when the selected package is absent", () => {
    expect(() => resolveTsc({ version: "7", startDir: projectDir, rootDir: projectDir })).toThrow(
      /TypeScript 7 package @typescript\/native was not found.*npm install.*@typescript\/native/
    );
  });

});

describe("run-tsc subprocess behavior", () => {
  it("launches JavaScript TypeScript 6 through Node, forwards args/env/cwd, and applies heap", async () => {
    const result = await runRunner("6", { NODETOOL_TSC_HEAP_MB: "3072" });
    const output = JSON.parse(result.stdout);
    expect(result.code).toBe(0);
    expect(output.args).toEqual(["--noEmit", "-p", "x.json"]);
    expect(output.cwd).toBe(realpathSync(projectDir));
    expect(output.marker).toBe("forwarded");
    expect(output.heapMb).toBeGreaterThan(3072 * 0.9);
  });

  it("launches a native-style TypeScript 7 executable directly without heap injection", async () => {
    const result = await runRunner("7");
    const output = JSON.parse(result.stdout);
    expect(result.code).toBe(0);
    expect(output.args).toEqual(["--noEmit", "-p", "x.json"]);
    expect(output.cwd).toBe(realpathSync(projectDir));
    expect(output.marker).toBe("forwarded");
    expect(output.nodeOptions).toBe("");
  });

  it("preserves a non-zero compiler exit at the npm command boundary", async () => {
    await expect(runRunner("6", { STUB_TSC_EXIT: "23" })).resolves.toMatchObject({ code: 23 });
    await expect(runRunner("7", { STUB_TSC_EXIT: "24" })).resolves.toMatchObject({ code: 24 });
  });

  it("preserves a compiler signal as a non-zero command result", async () => {
    await expect(runRunner("6", { STUB_TSC_SIGNAL: "SIGTERM" })).resolves.toMatchObject({ code: 143 });
  });

  it("only adds the heap override for TypeScript 6", () => {
    expect(typeScriptBuildEnv({ NODE_OPTIONS: "" }, "6").NODE_OPTIONS).toContain(
      `--max-old-space-size=${DEFAULT_TSC_HEAP_MB}`
    );
    expect(typeScriptBuildEnv({ NODE_OPTIONS: "" }, "7").NODE_OPTIONS).toBe("");
  });
});
