import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const runner = join(repoRoot, "scripts", "run-tsc.mjs");
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

function waitForSuccessfulBuild(readOutput, count, timeoutMs = 10_000) {
  const startedAt = Date.now();
  return new Promise((resolveWait, rejectWait) => {
    function inspect() {
      const output = readOutput();
      const matches = output.match(/Found 0 errors\. Watching for file changes\./g) ?? [];
      if (matches.length >= count) {
        resolveWait();
      } else if (Date.now() - startedAt >= timeoutMs) {
        rejectWait(new Error(`Timed out waiting for watch build ${count}:\n${output}`));
      } else {
        setTimeout(inspect, 25);
      }
    }
    inspect();
  });
}

describe("TypeScript 7 watch mode", () => {
  it("rebuilds after edits, additions, renames, and deletions", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "tsc7-watch-"));
    temporaryDirectories.push(projectDir);
    const srcDir = join(projectDir, "src");
    const mainPath = join(srcDir, "main.ts");
    const addedPath = join(srcDir, "added.ts");
    const renamedPath = join(srcDir, "renamed.ts");
    await mkdir(srcDir);
    await writeFile(mainPath, "export const value = 1;\n");
    await writeFile(
      join(projectDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          module: "preserve",
          moduleResolution: "bundler",
          noEmit: true,
          strict: true,
          target: "ES2022",
          types: []
        },
        include: ["src"]
      })
    );

    const child = spawn(
      process.execPath,
      [runner, "--watch", "--preserveWatchOutput", "-p", "tsconfig.json"],
      {
        cwd: projectDir,
        env: { ...process.env, NODETOOL_TSC_VERSION: "7" },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));

    try {
      await waitForSuccessfulBuild(() => output, 1);
      await writeFile(mainPath, "export const value = 2;\n");
      await waitForSuccessfulBuild(() => output, 2);

      await writeFile(addedPath, "export const added = 3;\n");
      await writeFile(mainPath, "export { added } from './added.js';\n");
      await waitForSuccessfulBuild(() => output, 3);

      await rename(addedPath, renamedPath);
      await writeFile(mainPath, "export { added } from './renamed.js';\n");
      await waitForSuccessfulBuild(() => output, 4);

      await rm(renamedPath);
      await writeFile(mainPath, "export const value = 4;\n");
      await waitForSuccessfulBuild(() => output, 5);
      expect(child.exitCode).toBeNull();
    } finally {
      child.kill("SIGTERM");
    }
  }, 30_000);
});
