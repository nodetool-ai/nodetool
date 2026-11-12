import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ShellRunner } from "../src/runner.js";

const command = (script: string): string => `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;

describe("ShellRunner", () => {
  it("preserves output and exit status", async () => {
    const result = await new ShellRunner().run(command("console.log('done'); process.exitCode = 3"), process.cwd(), 5);
    expect(result).toMatchObject({ code: 3, timedOut: false });
    expect(result.output).toContain("done");
  });

  it.skipIf(process.platform === "win32")("returns a signal exit without calling it a timeout", async () => {
    const result = await new ShellRunner().run("kill -TERM $$", process.cwd(), 5);
    expect(result).toMatchObject({ code: 128, timedOut: false });
  });

  it.skipIf(process.platform === "win32")("bounds timeout when a detached descendant holds output open", async () => {
    const script = `require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 3000)'], { detached: true, stdio: 'inherit' }).unref(); setTimeout(() => {}, 3000)`;
    const result = await Promise.race([
      new ShellRunner().run(command(script), process.cwd(), 0.2),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))
    ]);
    expect(result?.timedOut).toBe(true);
  }, 5000);

  it.skipIf(process.platform === "win32")("preserves an exited command status when a detached descendant holds a pipe", async () => {
    const script = `require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 3000)'], { detached: true, stdio: 'inherit' }).unref(); console.log('finished')`;
    const result = await new ShellRunner().run(command(script), process.cwd(), 2);
    expect(result).toMatchObject({ code: 0, timedOut: false });
    expect(result.output).toContain("finished");
  }, 5000);

  it("terminates children in the command process tree", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mutator-runner-"));
    const marker = join(dir, "survived");
    const child = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'alive'), 1000)`;
    const script = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(child)}], { stdio: 'inherit' }); setTimeout(() => {}, 3000)`;
    try {
      const result = await new ShellRunner().run(command(script), process.cwd(), 0.3);
      expect(result.timedOut).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 5000);
});
