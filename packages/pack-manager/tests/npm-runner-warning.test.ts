import { afterEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
vi.mock("node:child_process", () => ({ spawn: () => {
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
  queueMicrotask(() => { child.stdout.emit("data", Buffer.from("12.0.0\n")); child.emit("close", 0); });
  return child;
} }));
import { installerNpmVersion, runInstallerNpm } from "../src/npm-runner.js";
afterEach(() => { vi.restoreAllMocks(); });
it("future npm versions warn on stderr while version detection still succeeds", async () => {
  const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  expect(await installerNpmVersion(".")).toBe("12.0.0");
  expect(write).toHaveBeenCalledWith(expect.stringContaining("npm 12.0.0 has not been tested"));
});
it("captured installer commands route warnings to their supplied reporter", async () => {
  const warning = vi.fn();
  await runInstallerNpm(".", ["install"], { mode: "local", dryRun: true, onWarning: warning });
  expect(warning).toHaveBeenCalledWith("npm 12.0.0 has not been tested with the NodeTool installer.");
});
