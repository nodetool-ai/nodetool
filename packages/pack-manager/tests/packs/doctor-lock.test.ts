import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { inspectPackInstallLock } from "../../src/packs/doctor-lock.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pack-lock-report-")); roots.push(root);
  return { file: join(root, ".nodetool-packs.lock"), mode: { kind: "local" as const, packsRoot: root, legacyInstallRoot: root, cliRoot: root, coreVersion: "1", pathStyle: "posix" as const } };
}
it("reports an actual exited installer owner without needing a desired dirty marker", async () => {
  const f = await fixture(); const child = await promisify(execFile)(process.execPath, ["-e", "process.stdout.write(String(process.pid))"]);
  await writeFile(f.file, JSON.stringify({ pid: Number(child.stdout), hostname: hostname(), token: "owner", startedAt: new Date().toISOString() }));
  expect((await inspectPackInstallLock(f.mode))[0].kind).toBe("interrupted_install");
});
it("reports active owners and never removes their lock", async () => {
  const f = await fixture(); await writeFile(f.file, JSON.stringify({ pid: process.pid, hostname: hostname(), token: "owner", startedAt: new Date().toISOString() }));
  expect((await inspectPackInstallLock(f.mode))[0].kind).toBe("active_install");
  expect((await inspectPackInstallLock(f.mode))[0].kind).toBe("active_install");
});
it("reports malformed owner metadata and guards rather than guessing a dead owner", async () => {
  const f = await fixture(); await writeFile(f.file, "broken"); await mkdir(f.file + ".guard");
  expect((await inspectPackInstallLock(f.mode)).map((issue) => issue.kind)).toEqual(["install_guard", "invalid_install_lock"]);
});
