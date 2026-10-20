import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createNative3DGame, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { afterEach, describe, expect, it } from "vitest";
import { buildExpoGameProject, EXPO_GAME_HTML, EXPO_VERSIONS, expoAppMetadata, expoIconFiles, expoProjectFiles } from "../src/build-expo.js";
import { smokeStandaloneGame } from "../src/smoke.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "nodetool-game-expo-"));
  directories.push(directory);
  return directory;
}

function embeddedFiles(page: string): Record<string, string> {
  const block = /<script type="application\/json" id="nodetool-game-files">(.*?)<\/script>/s.exec(page)?.[1];
  if (!block) { throw new Error("Page has no embedded files"); }
  return JSON.parse(block) as Record<string, string>;
}

function scriptHashes(page: string): string[] {
  return [...page.matchAll(/<script(?: type="module")?>(.*?)<\/script>/gs)]
    .map((match) => `'sha256-${createHash("sha256").update(match[1] ?? "", "utf8").digest("base64")}'`);
}

describe("Expo mobile export", () => {
  it("writes an Expo project named after the game with the whole game in one page", async () => {
    const directory = await tempDir();
    const game = createTopDownRoomGame("game-expo");
    const sourceId = "a".repeat(32);
    game.assets.player!.assetId = sourceId;
    const canvas = createCanvas(2, 2);
    canvas.getContext("2d").fillRect(0, 0, 2, 2);
    const bytes = canvas.toBuffer("image/png");
    const digest = createHash("sha256").update(bytes).digest("hex");
    game.assets.player!.digest = digest;
    const project = await buildExpoGameProject({
      document: game, outputDir: join(directory, "mobile"),
      resolveAsset: async (id) => id === sourceId ? { bytes, mimeType: "image/png" } : null,
      app: { name: "Crystal Caves", version: "2.1.0" }
    });
    expect(project.metadata).toMatchObject({ name: "Crystal Caves", slug: "crystal-caves", identifier: "ai.nodetool.game.crystalcaves",
      version: "2.1.0", orientation: "default", dimension: "2d", sourceRevision: game.revision });
    expect((await readdir(project.outputDir)).sort()).toEqual([".gitignore", "App.js", "README.md", "app.json", "assets", "eas.json",
      "index.js", "metro.config.js", "package.json"]);

    const config = JSON.parse(await readFile(join(project.outputDir, "app.json"), "utf8"));
    expect(config.expo).toMatchObject({ name: "Crystal Caves", slug: "crystal-caves", version: "2.1.0", platforms: ["ios", "android"],
      ios: { bundleIdentifier: "ai.nodetool.game.crystalcaves" }, android: { package: "ai.nodetool.game.crystalcaves" } });
    const packageJson = JSON.parse(await readFile(join(project.outputDir, "package.json"), "utf8"));
    expect(packageJson.dependencies).toMatchObject({ expo: EXPO_VERSIONS.expo, "react-native-webview": EXPO_VERSIONS.webView });
    expect(await readFile(join(project.outputDir, "metro.config.js"), "utf8")).toContain('assetExts.push("html")');
    const app = await readFile(join(project.outputDir, "App.js"), "utf8");
    expect(app).toContain(`require("./${EXPO_GAME_HTML}")`);
    expect(app).toContain("source={{ html, baseUrl: BASE_URL }}");
    for (const icon of ["assets/icon.png", "assets/adaptive-icon.png"]) {
      const image = await loadImage(await readFile(join(project.outputDir, icon)));
      expect([image.width, image.height]).toEqual([1024, 1024]);
    }

    const page = await readFile(project.htmlPath, "utf8");
    expect(project.htmlPath).toBe(join(project.outputDir, EXPO_GAME_HTML));
    expect(page).not.toMatch(/<script[^>]* src=|<link rel="stylesheet"/);
    const files = embeddedFiles(page);
    expect(Object.keys(files).sort()).toEqual([`assets/${digest}.png`, "emscripten-module.wasm", "game.json"]);
    expect(Buffer.from(files[`assets/${digest}.png`]!, "base64")).toEqual(bytes);
    expect(JSON.parse(Buffer.from(files["game.json"]!, "base64").toString("utf8")).revision).toBe(game.revision);
    const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(page)?.[1] ?? "";
    expect(policy).toContain("default-src 'none'");
    expect(policy).not.toContain("unsafe-inline");
    const hashes = scriptHashes(page);
    expect(hashes).toHaveLength(2);
    for (const hash of hashes) { expect(policy).toContain(hash); }
  });

  it("locks a 3D game to its presentation shape and leaves a 2D game to the device", () => {
    const game3d = createNative3DGame("game-expo-3d");
    expect(expoAppMetadata(game3d).orientation).toBe(game3d.presentation.aspectRatio >= 1 ? "landscape" : "portrait");
    expect(expoAppMetadata(createTopDownRoomGame("game-expo")).orientation).toBe("default");
    expect(expoAppMetadata(createTopDownRoomGame("game-expo"), { orientation: "portrait" }).orientation).toBe("portrait");
  });

  it("derives identifiers both stores accept and rejects the rest", () => {
    const game = createTopDownRoomGame("game-expo");
    expect(expoAppMetadata(game, { name: "Room: Escape 2" })).toMatchObject({ name: "Room: Escape 2", slug: "room-escape-2",
      identifier: "ai.nodetool.game.roomescape2" });
    expect(expoAppMetadata(game, { name: "1999" })).toMatchObject({ slug: "game-1999", identifier: "ai.nodetool.game.game1999" });
    expect(expoAppMetadata(game, { name: "Class" }).identifier).toBe("ai.nodetool.game.gameclass");
    expect(expoAppMetadata(game, { name: "???" })).toMatchObject({ name: "???", slug: "game", identifier: "ai.nodetool.game.game" });
    expect(expoAppMetadata(game, { identifier: "com.Example.Game2" }).identifier).toBe("com.Example.Game2");
    for (const identifier of ["mygame", "com.my-company.game", "com.my_company.game", "com.example.2game", "com.new.game"]) {
      expect(() => expoAppMetadata(game, { identifier })).toThrow("reverse-DNS");
    }
    expect(() => expoAppMetadata(game, { version: "1.0" })).toThrow("MAJOR.MINOR.PATCH");
    expect(() => expoAppMetadata(game, { version: "10000.0.0" })).toThrow("MAJOR.MINOR.PATCH");
    expect(() => expoAppMetadata(game, { orientation: "sideways" as never })).toThrow("orientation");
  });

  it("documents the project and keeps names out of generated code", () => {
    const metadata = expoAppMetadata(createTopDownRoomGame("game-expo"), { name: '"); alert(1); ("' });
    const files = expoProjectFiles(metadata);
    expect(files["App.js"]).not.toContain("alert(1)");
    expect(JSON.parse(files["app.json"]!).expo.name).toBe('"); alert(1); ("');
    expect(files["README.md"]).toContain("npx expo start");
  });

  it("crops a custom icon to the square and insets the adaptive foreground", async () => {
    const source = createCanvas(40, 20);
    const context = source.getContext("2d");
    context.fillStyle = "#ff0000";
    context.fillRect(0, 0, 40, 20);
    const icons = await expoIconFiles(new Uint8Array(source.toBuffer("image/png")));
    const full = await loadImage(Buffer.from(icons["assets/icon.png"]!));
    const fullCanvas = createCanvas(full.width, full.height);
    fullCanvas.getContext("2d").drawImage(full, 0, 0);
    expect(Array.from(fullCanvas.getContext("2d").getImageData(0, 0, 1, 1).data)).toEqual([255, 0, 0, 255]);
    const adaptive = await loadImage(Buffer.from(icons["assets/adaptive-icon.png"]!));
    const adaptiveCanvas = createCanvas(adaptive.width, adaptive.height);
    adaptiveCanvas.getContext("2d").drawImage(adaptive, 0, 0);
    expect(adaptiveCanvas.getContext("2d").getImageData(0, 0, 1, 1).data[3]).toBe(0);
    expect(Array.from(adaptiveCanvas.getContext("2d").getImageData(512, 512, 1, 1).data)).toEqual([255, 0, 0, 255]);
  });

  // The page alone must run the game: only index.html is served with the page's own policy. The game.json beside it is
  // the smoke runner's input and is not a valid document, so a player that fetched it from the server would fail.
  it.each(["2d", "3d"])("runs the %s game from the single page with no other file served", async (dimension) => {
    const directory = await tempDir();
    const document = dimension === "3d" ? createNative3DGame("expo-smoke") : createTopDownRoomGame("expo-smoke");
    if (document.schemaVersion === 3) {
      for (const scene of document.scenes) for (const entity of scene.entities) for (const behavior of entity.behaviors) {
        if (behavior.kind === "script") { behavior.maxTickMs = 20; }
      }
    }
    const project = await buildExpoGameProject({ document, outputDir: join(directory, "mobile"), resolveAsset: async () => null });
    const served = join(directory, "served");
    await mkdir(served);
    await writeFile(join(served, "index.html"), await readFile(project.htmlPath));
    await writeFile(join(served, "game.json"), JSON.stringify({ schemaVersion: document.schemaVersion, inputActions: document.inputActions }));
    const report = await smokeStandaloneGame(served, { frames: 60 });
    expect(report).toMatchObject({ ok: true, frames: 60, ticks: 60, errors: [] });
  }, 90_000);
});
