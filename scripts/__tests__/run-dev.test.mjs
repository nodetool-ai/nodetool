import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("runs TypeScript with inherited development conditions and forwards arguments and exit codes", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodetool dev launcher "));
  try {
    const entry = join(dir, "entry.ts");
    writeFileSync(entry, `
      import { spawnSync } from 'node:child_process';
      const code: number = 23;
      const child = spawnSync(process.execPath, ['-p', 'process.env.NODE_OPTIONS'], { encoding: 'utf8' });
      console.log(JSON.stringify({ args: process.argv.slice(2), options: child.stdout.trim() }));
      process.exit(code);
    `);
    const result = spawnSync(process.execPath, [resolve("scripts/run-dev.mjs"), entry, "path with spaces", "a&b"], {
      encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "--no-warnings" }
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(23);
    expect(JSON.parse(result.stdout)).toEqual({
      args: ["path with spaces", "a&b"],
      options: "--no-warnings --conditions=nodetool-dev"
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
