import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function matteImports(doc, fixtureDir) {
  return doc.clips.filter(clip => clip.generatedMatte?.mediaPath).map(clip => ({
    clipId: clip.id, file: path.resolve(fixtureDir, clip.generatedMatte.mediaPath)
  }));
}

export function bindMatteAssets(doc, imports) {
  const assets = new Map(imports.map(item => [item.clipId, item.assetId]));
  return { ...doc, clips: doc.clips.map(clip => {
    if (!clip.generatedMatte?.mediaPath) return clip;
    if (!assets.has(clip.id)) throw new Error(`Missing matte asset for ${clip.id}`);
    const { mediaPath, ...generatedMatte } = clip.generatedMatte;
    return { ...clip, generatedMatte: { ...generatedMatte, assetId: assets.get(clip.id) } };
  }) };
}

// golden-import has already claimed and initialized this scratch store. Import
// the extra videos there, then render the rewritten document with the same env.
export async function importMatteAssets(original, imported, fixtureDir, storeEnv) {
  Object.assign(process.env, storeEnv);
  const { getAssetFileName } = await import("@nodetool-ai/protocol");
  const { assetObjectKey } = await import("@nodetool-ai/storage");
  const { initDb, Asset } = await import("@nodetool-ai/models");
  initDb(storeEnv.DB_PATH);
  const assets = [];
  for (const item of matteImports(original, fixtureDir)) {
    const contentType = "video/mp4";
    const asset = await Asset.create({ user_id: "1", name: path.basename(item.file), content_type: contentType,
      parent_id: null, project_id: "default", size: fs.statSync(item.file).size });
    const destination = path.join(storeEnv.ASSET_FOLDER, assetObjectKey("1", getAssetFileName(asset.id, contentType)));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(item.file, destination);
    assets.push({ ...item, assetId: asset.id });
  }
  return bindMatteAssets({ ...imported, clips: imported.clips.map(clip => {
    const source = original.clips.find(item => item.id === clip.id);
    return source?.generatedMatte ? { ...clip, generatedMatte: source.generatedMatte } : clip;
  }) }, assets);
}

export function prepareMatteFixture(doc, fixtureDir) {
  return { ...doc, clips: doc.clips.map(clip => ({ ...clip,
    ...(clip.mediaPath ? { mediaPath: path.resolve(fixtureDir, clip.mediaPath) } : {}),
    ...(clip.generatedMatte ? { generatedMatte: { ...clip.generatedMatte, status: "generating" } } : {})
  })) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { execFileSync } = await import("node:child_process");
  const [originalFile, importedFile, frames, out, repoRoot, store] = process.argv.slice(2);
  const storeEnv = { DB_PATH: path.join(store, "nodetool.sqlite3"), ASSET_FOLDER: path.join(store, "assets") };
  const doc = await importMatteAssets(JSON.parse(fs.readFileSync(originalFile, "utf8")),
    JSON.parse(fs.readFileSync(importedFile, "utf8")), path.dirname(originalFile), storeEnv);
  fs.writeFileSync(importedFile, `${JSON.stringify(doc, null, 2)}\n`);
  const stdout = execFileSync("npm", ["run", "--silent", "dev:nodetool", "--", "timeline", "render", importedFile,
    "--stills", "--frames", frames, "--out", out, "--json"],
  { cwd: repoRoot, env: { ...process.env, ...storeEnv }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const result = JSON.parse(stdout.slice(stdout.indexOf("{")));
  if ((result.skippedClips ?? []).length > 0) throw new Error(`Matte render skipped clips: ${result.skippedClips}`);
  for (const frame of frames.split(",")) {
    if (!fs.existsSync(path.join(out, `frame_${String(frame).padStart(6, "0")}.png`))) throw new Error(`Missing matte frame ${frame}`);
  }
}
