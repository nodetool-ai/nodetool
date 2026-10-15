import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createNative3DGame, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { afterEach, describe, expect, it } from "vitest";
import { missingRuntimePackageOf } from "@nodetool-ai/protocol";
import { buildTauriGameProject, compileTauriGameProject, findCargo, tauriAppMetadata, tauriIconFiles, tauriProjectFiles, TAURI_VERSIONS } from "../src/build-tauri.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "nodetool-game-tauri-"));
  directories.push(directory);
  return directory;
}

describe("Tauri desktop export", () => {
  it("wraps the standalone web player in a Tauri project named after the game", async () => {
    const directory = await tempDir();
    const game = createTopDownRoomGame("game-tauri");
    const sourceId = "a".repeat(32);
    game.assets.player!.assetId = sourceId;
    const canvas = createCanvas(2, 2);
    canvas.getContext("2d").fillRect(0, 0, 2, 2);
    const bytes = canvas.toBuffer("image/png");
    const digest = createHash("sha256").update(bytes).digest("hex");
    game.assets.player!.digest = digest;
    const project = await buildTauriGameProject({
      document: game, outputDir: join(directory, "desktop"),
      resolveAsset: async (id) => id === sourceId ? { bytes, mimeType: "image/png" } : null,
      app: { name: "Crystal Caves", version: "2.1.0" }
    });
    expect(project.metadata).toMatchObject({ productName: "Crystal Caves", identifier: "ai.nodetool.game.crystal-caves",
      crateName: "crystal-caves", version: "2.1.0", width: 1280, height: 800, dimension: "2d", sourceRevision: game.revision });
    expect((await readdir(project.outputDir)).sort()).toEqual([".gitignore", "README.md", "dist", "package.json", "src-tauri"]);
    expect(await readFile(join(project.webDir, "assets", `${digest}.png`))).toEqual(bytes);
    expect(JSON.parse(await readFile(join(project.webDir, "game.json"), "utf8")).revision).toBe(game.revision);
    const config = JSON.parse(await readFile(join(project.tauriDir, "tauri.conf.json"), "utf8"));
    expect(config).toMatchObject({ productName: "Crystal Caves", version: "2.1.0", identifier: "ai.nodetool.game.crystal-caves",
      build: { frontendDist: "../dist" }, app: { withGlobalTauri: false, security: { csp: null } } });
    expect(config.build.beforeBuildCommand).toBeUndefined();
    for (const icon of config.bundle.icon as string[]) {
      expect((await readFile(join(project.tauriDir, icon))).length).toBeGreaterThan(0);
    }
    const cargo = await readFile(join(project.tauriDir, "Cargo.toml"), "utf8");
    expect(cargo).toContain('name = "crystal-caves"');
    expect(cargo).toContain(`tauri = { version = "=${TAURI_VERSIONS.tauri}"`);
    expect(cargo).toContain('default = ["custom-protocol"]');
    expect(JSON.parse(await readFile(join(project.outputDir, "package.json"), "utf8")).devDependencies).toEqual({ "@tauri-apps/cli": TAURI_VERSIONS.cli });
    expect(await readFile(join(project.tauriDir, "src", "main.rs"), "utf8")).toContain("tauri::generate_context!()");
  });

  it("sizes a 3D window from the presentation aspect ratio", () => {
    const game = createNative3DGame("game-tauri-3d");
    const metadata = tauriAppMetadata(game, { width: 1600 });
    expect(metadata.dimension).toBe("3d");
    expect(metadata.height).toBe(Math.round(1600 / game.presentation.aspectRatio));
  });

  it("cleans names and rejects identifiers, versions and window sizes the platforms refuse", () => {
    const game = createTopDownRoomGame("game-tauri");
    expect(tauriAppMetadata(game, { name: ' Room: "Escape"/2 ' })).toMatchObject({ productName: "Room Escape 2", crateName: "room-escape-2" });
    expect(tauriAppMetadata(game, { name: "1999" })).toMatchObject({ crateName: "game-1999", identifier: "ai.nodetool.game.game-1999" });
    expect(tauriAppMetadata(game, { name: "???" })).toMatchObject({ productName: "NodeTool Game", crateName: "nodetool-game" });
    expect(() => tauriAppMetadata(game, { identifier: "mygame" })).toThrow("reverse-DNS");
    expect(() => tauriAppMetadata(game, { identifier: "com.example.app" })).toThrow("must not end in .app");
    expect(() => tauriAppMetadata(game, { version: "1.0" })).toThrow("MAJOR.MINOR.PATCH");
    expect(() => tauriAppMetadata(game, { version: "256.0.0" })).toThrow("at most 255");
    expect(() => tauriAppMetadata(game, { width: 100 })).toThrow("Window width");
  });

  it("writes icons the Windows and macOS bundlers can read", async () => {
    const icons = await tauriIconFiles();
    const png = await loadImage(Buffer.from(icons["icons/icon.png"]!));
    expect([png.width, png.height]).toEqual([512, 512]);
    // PNG color type 6 is RGBA, which Tauri requires for window icons.
    expect(icons["icons/icon.png"]![25]).toBe(6);
    const ico = Buffer.from(icons["icons/icon.ico"]!);
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 4]);
    const sizes = Array.from({ length: 4 }, (_, index) => ico[6 + index * 16] || 256);
    expect(sizes).toEqual([16, 32, 48, 256]);
    for (let index = 0; index < 4; index += 1) {
      const length = ico.readUInt32LE(6 + index * 16 + 8);
      const offset = ico.readUInt32LE(6 + index * 16 + 12);
      expect(offset + length).toBeLessThanOrEqual(ico.length);
    }
    const largest = ico.readUInt32LE(6 + 3 * 16 + 12);
    expect(ico.subarray(largest, largest + 4).toString("latin1")).toBe("\u0089PNG");
    const icns = Buffer.from(icons["icons/icon.icns"]!);
    expect(icns.subarray(0, 4).toString("ascii")).toBe("icns");
    expect(icns.readUInt32BE(4)).toBe(icns.length);
    const types: string[] = [];
    for (let offset = 8; offset < icns.length; offset += icns.readUInt32BE(offset + 4)) { types.push(icns.subarray(offset, offset + 4).toString("ascii")); }
    expect(types).toEqual(["ic07", "ic08", "ic09", "ic10"]);
  });

  it("crops a supplied icon image to a square", async () => {
    const source = createCanvas(40, 20);
    const context = source.getContext("2d");
    context.fillStyle = "#ff0000";
    context.fillRect(0, 0, 40, 20);
    const icons = await tauriIconFiles(source.toBuffer("image/png"));
    const icon = await loadImage(Buffer.from(icons["icons/32x32.png"]!));
    const check = createCanvas(32, 32).getContext("2d");
    check.drawImage(icon, 0, 0);
    expect(Array.from(check.getImageData(0, 0, 1, 1).data)).toEqual([255, 0, 0, 255]);
    expect(Array.from(check.getImageData(31, 31, 1, 1).data)).toEqual([255, 0, 0, 255]);
  });

  it("escapes the app name inside Cargo.toml", () => {
    const metadata = { ...tauriAppMetadata(createTopDownRoomGame("game-tauri"), { name: "Quote “me” \\ back" }) };
    const cargo = tauriProjectFiles(metadata)["src-tauri/Cargo.toml"]!;
    expect(cargo).toContain('description = "Quote “me” back, exported from NodeTool"');
  });

  it("refuses a non-empty output directory and leaves no staging behind", async () => {
    const directory = await tempDir();
    const outputDir = join(directory, "desktop");
    await buildTauriGameProject({ document: createTopDownRoomGame("game-tauri"), outputDir, resolveAsset: async () => null });
    await expect(buildTauriGameProject({ document: createTopDownRoomGame("game-tauri"), outputDir, resolveAsset: async () => null }))
      .rejects.toThrow("Output directory is not empty");
    expect(await readdir(directory)).toEqual(["desktop"]);
  });

  it("reports a missing cargo as the Rust runtime package instead of a spawn error", async () => {
    const directory = await tempDir();
    await writeFile(join(directory, "Cargo.toml"), "");
    const metadata = tauriAppMetadata(createTopDownRoomGame("game-tauri"));
    const spawnFailure = compileTauriGameProject({ tauriDir: directory, metadata }, { cargo: join(directory, "no-such-cargo") });
    await expect(spawnFailure).rejects.toThrow("cargo is not installed or not on PATH");
    expect(missingRuntimePackageOf(await spawnFailure.catch((error: unknown) => error))).toBe("rust");
    const env = { PATH: join(directory, "empty"), CARGO_HOME: join(directory, "no-cargo-home") };
    const lookupFailure = await compileTauriGameProject({ tauriDir: directory, metadata }, { env }).catch((error: unknown) => error);
    expect(missingRuntimePackageOf(lookupFailure)).toBe("rust");
  });

  it.skipIf(process.platform === "win32")("finds cargo on PATH first, then in rustup's cargo home", async () => {
    const directory = await tempDir();
    const onPath = join(directory, "path-bin");
    const rustup = join(directory, "cargo-home", "bin");
    await mkdir(onPath, { recursive: true });
    await mkdir(rustup, { recursive: true });
    for (const dir of [onPath, rustup]) {
      await writeFile(join(dir, "cargo"), "#!/bin/sh\n");
      await chmod(join(dir, "cargo"), 0o755);
    }
    const cargoHome = join(directory, "cargo-home");
    expect(await findCargo({ PATH: onPath, CARGO_HOME: cargoHome })).toBe(join(onPath, "cargo"));
    expect(await findCargo({ PATH: join(directory, "empty"), CARGO_HOME: cargoHome })).toBe(join(rustup, "cargo"));
    expect(await findCargo({ PATH: join(directory, "empty"), CARGO_HOME: join(directory, "none") })).toBeNull();
  });
});
