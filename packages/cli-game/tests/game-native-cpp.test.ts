import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nativeGameDocument } from "@nodetool-ai/protocol/native-game";
import { registerNativeCppGameCommands } from "../src/commands/game-native-cpp.js";
const executable = process.env.NODETOOL_NATIVE_GAME_WORKER ?? fileURLToPath(new URL("../../../native/game/build/game-worker", import.meta.url));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); process.exitCode = 0; });
async function invoke(args: string[]): Promise<string> {
  let output = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
  const program = new Command(); registerNativeCppGameCommands(program.command("game"));
  await program.parseAsync(["node", "test", "game", "native", ...args]);
  return output;
}
describe("native C++ game CLI", () => {
  it.runIf(process.env.NODETOOL_NATIVE_BROWSER_PROFILE === "1")("exports the explicit web target and rejects unknown native targets", async () => {
    vi.stubEnv("NODETOOL_NATIVE_GAME_WORKER", executable);
    const root = await mkdtemp(join(tmpdir(), "native-cli-web-"));
    try {
      const course = join(root, "course"); await invoke(["create", course, "--json"]);
      const result = JSON.parse(await invoke(["export", join(course, "game.json"), "--target", "web", "--out", join(root, "web"), "--json"]));
      expect(result).toMatchObject({ target: "web", entry: "index.html" });
      expect(await readFile(join(root, "web", "index.html"), "utf8")).toContain("native-game-player.js");
      await invoke(["export", join(course, "game.json"), "--target", "invalid", "--out", join(root, "invalid"), "--json"]);
      expect(process.exitCode).toBe(1);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("creates and verifies an explicitly selected native game without changing legacy routing", async () => {
    vi.stubEnv("NODETOOL_NATIVE_GAME_WORKER", executable);
    const root = await mkdtemp(join(tmpdir(), "native-cli-"));
    try {
      await invoke(["create", root, "--title", "CLI course", "--json"]);
      const path = join(root, "game.json"), document = nativeGameDocument.parse(JSON.parse(await readFile(path, "utf8")));
      expect(document.title).toBe("CLI course");
      const assertions = join(root, "assertions.json"); await writeFile(assertions, JSON.stringify([{ tick: 2, path: ["score"], equals: 1 }]));
      const report = JSON.parse(await invoke(["simulate", path, "--ticks", "2", "--assertions", assertions, "--verify-replay", "--json"]));
      expect(report.valid).toBe(true); expect(report.replayVerified).toBe(true);
      expect(JSON.parse(await invoke(["inspect", path, "--limit", "1", "--fields", "id", "--json"])).entities).toEqual([{ id: "floor" }]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("creates native2D assets and applies2D defaults through contextual transactions", async () => {
    vi.stubEnv("NODETOOL_NATIVE_GAME_WORKER", process.env.NODETOOL_NATIVE_GAME_WORKER ?? executable);
    const root = await mkdtemp(join(tmpdir(), "native-cli2d-"));
    try {
      await invoke(["create", root, "--dimension", "2d", "--json"]);
      const path = join(root, "game.json"), document = nativeGameDocument.parse(JSON.parse(await readFile(path, "utf8")));
      expect(document.dimension).toBe("2d"); expect(document.schemaVersion).toBe(5);
      expect((await readFile(join(root, "course.png"))).subarray(0, 8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
      const transaction = join(root, "edit.json"), output = join(root, "edited.json");
      await writeFile(transaction, JSON.stringify({ requestId: "2d-edit", expectedRevision: 0, operations: [{ kind: "addEntity", sceneId: "course", entity: { id: "new2d" } }] }));
      await invoke(["transact", path, transaction, "--out", output, "--json"]);
      const accepted = nativeGameDocument.parse(JSON.parse(await readFile(output, "utf8")));
      expect(accepted.scenes[0]?.entities.find(entity => entity.id === "new2d")?.transform).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
      const schema = JSON.parse(await invoke(["schema", "--dimension", "2d"]));
      expect(schema.dimension).toBe("2d"); expect(schema.scriptDeclarations).toContain('"x": number');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

});
