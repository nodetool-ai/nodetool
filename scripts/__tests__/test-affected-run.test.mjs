import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it("launches npm from a directory with spaces and preserves its exit status", () => {
  const cwd = mkdtempSync(join(tmpdir(), "nodetool affected tests "));
  try {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "node check.cjs" } }));
    writeFileSync(join(cwd, "check.cjs"), "process.exit(process.argv[2] === 'path with spaces' ? 23 : 99);");
    const script = pathToFileURL(resolve("scripts/test-affected.mjs")).href;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e",
      `import { run } from ${JSON.stringify(script)}; process.exitCode = run("npm", ["test", "--", "path with spaces"], process.cwd());`
    ], { cwd, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(23);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
