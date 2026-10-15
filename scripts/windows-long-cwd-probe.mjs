import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, toNamespacedPath } from "node:path";

if (process.platform !== "win32" && !process.argv.includes("--exercise")) {
  console.log(JSON.stringify({ probe: "windows-long-cwd", skipped: process.platform }));
} else {
  const base = mkdtempSync(join(tmpdir(), "long-cwd-probe-"));
  try {
    const root = join(base, ...Array.from({ length: 7 }, (_, i) => `segment-${i}-${"x".repeat(35)}`));
    mkdirSync(root, { recursive: true });
    if (root.length <= 260) { throw new Error("Diagnostic fixture must exceed MAX_PATH"); }
    const canonicalRoot = realpathSync(root);
    const report = "console.log(JSON.stringify({cwd:process.cwd()}));console.log(JSON.stringify({realpath:require('node:fs').realpathSync(process.cwd())}));";
    const probes = [
      { name: "spawn-normal", cwd: root, code: report },
      { name: "spawn-namespaced", cwd: toNamespacedPath(root), code: report },
      { name: "chdir-normal", cwd: base, code: "process.chdir(process.argv[1]);" + report, arg: root },
      { name: "chdir-namespaced", cwd: base, code: "process.chdir(process.argv[1]);" + report, arg: toNamespacedPath(root) }
    ];
    console.log(JSON.stringify({ probe: "windows-long-cwd", node: process.version, uv: process.versions.uv,
      root, canonicalRoot, rootLength: root.length }));
    for (const probe of probes) {
      const child = spawnSync(process.execPath, ["-e", probe.code, ...(probe.arg ? [probe.arg] : [])], {
        cwd: probe.cwd, shell: false, encoding: "utf8", timeout: 15000
      });
      console.log(JSON.stringify({ name: probe.name, inputCwd: probe.cwd, arg: probe.arg,
        status: child.status, signal: child.signal,
        error: child.error ? { code: child.error.code, message: child.error.message } : null,
        stdout: child.stdout, stderr: child.stderr }));
    }
  } finally { rmSync(base, { recursive: true, force: true }); }
}
