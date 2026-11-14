import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const out = join(root, "build");
mkdirSync(out, { recursive: true });
const compiler = process.env.CC ?? "clang";
const prefix = process.env.ZIG_CC === "1" ? ["cc"] : [];
const flags = ["-O2", "-fno-fast-math", "-ffp-contract=off", "-Wall", "-Wextra", "-Werror"];
function compile(args) {
  const result = spawnSync(compiler, [...prefix, ...flags, ...args], { cwd: root, stdio: "inherit" });
  if (result.error) { throw result.error; }
  if (result.status !== 0) { throw new Error(`Compiler exited ${result.status}`); }
}
compile(["kernels.c", "native.c", "-o", join(out, process.platform === "win32" ? "native.exe" : "native")]);
const target = process.env.ZIG_CC === "1" ? "wasm32-freestanding" : "wasm32-unknown-unknown";
compile([`--target=${target}`, "-nostdlib", "kernels.c", "-Wl,--no-entry",
  "-Wl,--export=nt_process", "-Wl,--export=nt_context", "-Wl,--export-memory",
  "-Wl,-z,stack-size=65536",
  "-Wl,--initial-memory=131072", "-Wl,--max-memory=131072", "-o", join(out, "kernels.wasm")]);
const version = spawnSync(compiler, [...prefix, "--version"], { encoding: "utf8" });
if (version.error) { throw version.error; }
if (version.status !== 0) { throw new Error("Cannot record compiler version"); }
writeFileSync(join(out, "build.json"), JSON.stringify({
  compiler: version.stdout.split(/\r?\n/)[0], flags, wasmTarget: target
}, null, 2) + "\n");
