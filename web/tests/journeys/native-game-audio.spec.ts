import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { buildStandaloneGame } from "@nodetool-ai/game-renderer/build";

test.use({ launchOptions: { args: ["--autoplay-policy=user-gesture-required"] } });

function silentWav(): Buffer {
  const samples = Buffer.alloc(8000 * 2);
  const bytes = Buffer.alloc(44 + samples.length);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(samples.length, 40);
  samples.copy(bytes, 44);
  return bytes;
}

test("standalone scene music begins after a user gesture", async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), "nodetool-audio-browser-"));
  try {
    const game = createTopDownRoomGame("audio-browser-test");
    game.schemaVersion = 2;
    game.scenes[0].music = { assetId: "music", volume: 0.5, fadeInTicks: 0, fadeOutTicks: 0 };
    const bytes = silentWav();
    const sourceId = "c".repeat(32);
    game.assets.music = { assetId: sourceId, digest: createHash("sha256").update(bytes).digest("hex"), mediaKind: "audio",
      width: 1, height: 1, pivot: { x: 0.5, y: 0.5 }, sampling: "nearest" };
    await buildStandaloneGame({ document: game, outputDir: join(directory, "build"),
      resolveAsset: async (id) => id === sourceId ? { bytes, mimeType: "audio/wav" } : null });
    await page.route("**/native-game-audio/**", async (route) => {
      const path = new URL(route.request().url()).pathname.replace("/native-game-audio/", "");
      const file = join(directory, "build", path || "index.html");
      const contentType = file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" :
        file.endsWith(".json") ? "application/json" : file.endsWith(".css") ? "text/css" :
          file.endsWith(".wav") ? "audio/wav" : "application/wasm";
      await route.fulfill({ status: 200, contentType, body: await readFile(file) });
    });
    await page.addInitScript(() => {
      Object.defineProperty(window, "audioStarts", { value: 0, writable: true });
      const NativeAudioContext = window.AudioContext;
      Object.defineProperty(window, "AudioContext", { value: class extends NativeAudioContext {
        private unlocked = false;
        constructor() {
          super();
          Object.defineProperty(this, "state", { get: () => this.unlocked ? "running" : "suspended" });
        }
        override async resume(): Promise<void> {
          this.unlocked = true;
          await super.resume();
        }
      } });
      const original = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when?: number, offset?: number, duration?: number) {
        (window as unknown as { audioStarts: number }).audioStarts += 1;
        return duration === undefined
          ? original.call(this, when ?? 0, offset ?? 0)
          : original.call(this, when ?? 0, offset ?? 0, duration);
      };
    });
    await page.goto("/native-game-audio/index.html");
    await expect(page.getByRole("status")).toContainText("Ready");
    expect(await page.evaluate(() => (window as unknown as { audioStarts: number }).audioStarts)).toBe(0);
    await page.locator("#game").click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { audioStarts: number }).audioStarts)).toBe(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
