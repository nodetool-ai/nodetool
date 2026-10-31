import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { nativeGame2dDocument } from "@nodetool-ai/protocol/native-game";
import { kindleController } from "./bindings.mjs";

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export function adaptKindle(source, assets) {
  const scripts = [], originals = [], omissions = [], scenes = [];
  const convert = (e, scene) => {
    const admitted = new Set(["id", "name", "templateOnly", "transform2d", "behaviors", "body2d", "collider2d", "sprite", "animator", "tilemap", "camera2d", "light2d", "particles", "visualAnimation", "audioSource"]);
    for (const key of Object.keys(e)) { if (!admitted.has(key)) { throw new Error(`Unmapped Kindle component ${key}`); } }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(e.id)) { throw new Error(`Unsupported source ID ${e.id}`); }
    const entity = { id: e.id, name: e.name ?? e.id, transform: e.transform2d, props: { sourceEntityId: e.id }, behaviors: [] };
    for (const key of ["body2d", "collider2d", "sprite", "animator", "tilemap", "camera2d", "light2d"]) { if (e[key]) { entity[key] = structuredClone(e[key]); } }
    for (const key of ["particles", "visualAnimation", "audioSource"]) { if (e[key]) { omissions.push({ scene, entity: e.id, component: key, binding: key === "audioSource" ? "event-to-audio commands; spatial attenuation unsupported" : "unsupported native2D presentation" }); } }
    for (const b of e.behaviors) {
      if (b.kind === "lifetime") { entity.gameplay = { lifetimeTicks: b.ticks }; if (b.fade || b.endScale !== 1) { omissions.push({ scene, entity: e.id, component: "lifetime.fade/endScale" }); } }
      else if (!["script", "patrol", "collectible"].includes(b.kind)) { throw new Error(`Unmapped behavior ${b.kind}`); }
    }
    return entity;
  };
  for (const scene of source.scenes) {
    const entities = scene.entities.filter(e => !e.templateOnly).map(e => convert(e, scene.id));
    const functions = {}, roles = [];
    for (const e of scene.entities) { for (const b of e.behaviors) { if (b.kind === "script") { functions[e.id] = b.source; roles.push(e.id); originals.push({ scene: scene.id, entity: e.id, digest: sha256(b.source), bytes: Buffer.byteLength(b.source) }); } } }
    const templates = Object.fromEntries(scene.entities.filter(e => e.templateOnly).map(e => [e.id, convert(e, scene.id)]));
    const config = { roles, templates, actors: scene.entities.filter(e => e.body2d?.type === "kinematic").map(e => e.id), musicVolume: scene.music?.volume ?? .55,
      cells: scene.entities.filter(e => e.behaviors.some(b => b.kind === "collectible")).map(e => e.id),
      audio: scene.entities.filter(e => e.audioSource && !e.id.startsWith("ember")).map(e => e.audioSource),
      patrols: scene.entities.flatMap(e => e.behaviors.filter(b => b.kind === "patrol").map(b => ({ ...b, id: e.id, origin: e.transform2d[b.axis], width: e.collider2d.width, height: e.collider2d.height, falls: e.body2d.type === "kinematic" && (e.body2d.gravityScale ?? 1) !== 0 }))),
      solids: scene.entities.flatMap(e => e.tilemap ? e.tilemap.tiles.filter(t => t.solid ?? e.tilemap.solid).map(t => ({ x: e.transform2d.x + t.x, y: e.transform2d.y + t.y, width: t.width, height: t.height })) : []).concat(scene.entities.filter(e => e.collider2d && !e.collider2d.sensor && e.body2d?.type === "static").map(e => ({ x: e.transform2d.x, y: e.transform2d.y, width: e.collider2d.width, height: e.collider2d.height }))) };
    const rows = new Map(); for (const box of config.solids) { const key = `${box.y}|${box.height}`; if (!rows.has(key)) { rows.set(key, []); } rows.get(key).push(box); }
    config.solids = []; for (const boxes of rows.values()) { boxes.sort((a,b) => a.x - b.x); for (const box of boxes) { const last = config.solids.at(-1); if (last && last.y === box.y && last.height === box.height && box.x - box.width/2 <= last.x + last.width/2 + 1e-8) { const left = last.x-last.width/2, right=Math.max(last.x+last.width/2,box.x+box.width/2); last.x=(left+right)/2; last.width=right-left; } else { config.solids.push({...box}); } } }
    const scriptId = `kindle-${scene.id}`;
    scripts.push({ id: scriptId, source: `i => (${kindleController.toString()})(i,{${Object.entries(functions).map(([id, body]) => `${JSON.stringify(id)}:(${body})`).join(",")}},${JSON.stringify(config)})` });
    const owner = entities.find(e => e.id === (scene.id === "title" ? "title" : "hero"));
    owner.behaviors.push({ id: "controller", scriptId, maxCommands: 128, maxTickMs: 20, maxStateBytes: 65536 });
    scenes.push({ id: scene.id, name: scene.name, entities, gravity: scene.gravity ?? { x: 0, y: -48 }, lighting: scene.lighting, backgrounds: scene.backgrounds });
  }
  const document = nativeGame2dDocument.parse({ schemaVersion: 5, engine: "native-cpp-1", dimension: "2d", id: "kindle-native", title: "Kindle", initialSceneId: source.entrySceneId, scenes, scripts, assets,
    inputActions: source.inputActions.map(id => ({ id, bindings: [...(id === "space" ? ["Space"] : [`Arrow${id[0].toUpperCase()}${id.slice(1)}`, `${id[0].toUpperCase()}${id.slice(1)}`])] })),
    hud: [{ kind: "text", id: "title", bounds: [.025, .025, .7, .07], text: "KINDLE — relight the drowned temple" }, { kind: "text", id: "score", bounds: [.025, .09, .6, .05], text: "EMBERS {score} / 73" }, { kind: "text", id: "help", bounds: [.025, .94, .9, .04], text: "Arrows: run · Space: jump · Jump off walls · Space: start" }] });
  return { document, provenance: { sourceDigest: sha256(JSON.stringify(source)), originalScripts: originals, sourceEntities: source.scenes.map(s => ({ scene: s.id, ids: s.entities.map(e => e.id) })), omissions: [{ component: "scene.ui", binding: "static native HUD only; no dynamic widget tree or font binding" }, { component: "audio.mixer/transitions/music.fade", binding: "event playback and scene music only; no reverb, ducking, snapshots, lowpass, fades or spatial attenuation" }, { component: "renderEffects", binding: "unsupported native2D postprocessing" }, ...omissions] } };
}

export async function prepareKindle(sourceRoot, out) {
  const raw = await readFile(resolve(sourceRoot, "game.json")), source = JSON.parse(raw), files = await readdir(resolve(sourceRoot, "assets"));
  await mkdir(resolve(out, "assets"), { recursive: true });
  const assets = [], media = [];
  for (const [id, asset] of Object.entries(source.assets)) {
    const matches = files.filter(name => name.startsWith(`${asset.assetId}.`));
    if (matches.length !== 1) { throw new Error(`Ambiguous source asset ${id}`); }
    const bytes = await readFile(resolve(sourceRoot, "assets", matches[0]));
    if (sha256(bytes) !== asset.digest) { throw new Error(`Digest mismatch ${id}`); }
    let path = `assets/${matches[0]}`; let prepared = bytes;
    if (asset.mediaKind === "audio" && matches[0].endsWith(".mp3")) { path = `assets/${id}-pcm.wav`; execFileSync("ffmpeg", ["-v","error","-y","-i",resolve(sourceRoot,"assets",matches[0]),"-acodec","pcm_f32le",resolve(out,path)]); prepared = await readFile(resolve(out,path)); } else { await copyFile(resolve(sourceRoot, path), resolve(out, path)); }
    assets.push({ id, kind: asset.mediaKind, path, size: prepared.length, digest: sha256(prepared), ...(asset.sampling ? { sampling: asset.sampling } : {}), ...(asset.pivot ? { pivot: asset.pivot } : {}) });
    media.push({ id, source: `assets/${matches[0]}`, sourceDigest: asset.digest, conversion: matches[0].endsWith(".mp3") ? "ffmpeg decoded IEEE float32 WAV; no additional PCM16 quantization" : null, path, digest: sha256(prepared), size: prepared.length });
  }
  const adapted = adaptKindle(source, assets); adapted.provenance.sourceFileDigest = sha256(raw); adapted.provenance.assets = media;
  await writeFile(resolve(out, "game.json"), JSON.stringify(adapted.document, null, 2) + "\n");
  await writeFile(resolve(out, "provenance.json"), JSON.stringify(adapted.provenance, null, 2) + "\n");
  return adapted;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await prepareKindle(resolve(process.argv[2] ?? "packages/game-runtime/samples/kindle"), resolve(process.argv[3] ?? resolve(tmpdir(), "kindle-native-qa")));
  console.log(JSON.stringify({ scenes: result.document.scenes.length, entities: result.document.scenes.map(s => s.entities.length), assets: result.document.assets.length, scripts: result.provenance.originalScripts }));
}
