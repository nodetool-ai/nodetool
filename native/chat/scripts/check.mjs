import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("..", import.meta.url));
const root = resolve(source, "../..");
const build = process.env.NODETOOL_CHAT_BUILD_DIR || join(source, "build");
const temporary = join(homedir(), ".cache", "nodetool-chat-tmp");
mkdirSync(temporary, { recursive: true });
const qtRoot = join(homedir(), "qt");
const candidates = existsSync(qtRoot)
  ? readdirSync(qtRoot).filter((name) => name.startsWith("6.12.")).sort().reverse()
      .flatMap((version) => ["gcc_64", "macos", "msvc2022_64"].map((kit) => join(qtRoot, version, kit)))
  : [];
const prefix = process.env.CMAKE_PREFIX_PATH || candidates.find(existsSync);
function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: { ...process.env, TMPDIR: temporary, ...env } });
  if (result.error) { throw result.error; }
  if (result.status !== 0) { process.exit(result.status ?? 1); }
}
run("cmake", ["-S", source, "-B", build, "-G", "Ninja", "-DCMAKE_BUILD_TYPE=Release", "-DBUILD_TESTING=ON", ...(prefix ? [`-DCMAKE_PREFIX_PATH=${prefix}`] : [])]);
run("cmake", ["--build", build, "--parallel", "2"]);
run("ctest", ["--test-dir", build, "--output-on-failure", "--no-tests=error"], { QT_QPA_PLATFORM: "offscreen", QSG_RHI_BACKEND: "software", QT_QUICK_BACKEND: "software" });
run(process.execPath, ["scripts/run-jest-utc.mjs", "--config", "native/chat/tests/jest.config.ts", "--runInBand"]);
