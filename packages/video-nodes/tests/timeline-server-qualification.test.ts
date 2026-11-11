import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("reports a missing Vulkan driver and exits without forced termination", async () => {
  const child = spawn(process.execPath, ["--import", "tsx",
    fileURLToPath(new URL("./_fixtures/server-qualification.mjs", import.meta.url)), "missing"], {
    env: { ...process.env, DISPLAY: "", VK_DRIVER_FILES: "/nonexistent/a42-icd.json",
      VK_ICD_FILENAMES: "/nonexistent/a42-icd.json" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  // Import/startup budget, not a render benchmark. A no-adapter rejection has
  // no work to drain. Thirty seconds bounds a hung native runner on busy CI.
  const deadline = setTimeout(() => child.kill("SIGKILL"), 30000);
  try {
    const result = await new Promise<{code: number | null; signal: string | null}>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({code, signal}));
    });
    expect(result, stderr + stdout).toEqual({code: 0, signal: null});
    expect(stdout).toContain('"name":"CompositorUnavailableError"');
    expect(stdout).toContain("No WebGPU adapter available (Node/Dawn)");
    expect(stdout).toContain("mesa-vulkan-drivers");
    expect(stdout).toContain("VK_DRIVER_FILES");
    process.stdout.write(stdout);
  } finally {
    clearTimeout(deadline);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
}, 35000);
