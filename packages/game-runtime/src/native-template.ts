import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { nativeGame3dDocument, nativeGame2dDocument, type NativeGame3dDocument, type NativeGame2dDocument } from "@nodetool-ai/protocol/native-game";
/** Asset-free geometry plus an owned WAV gives agents a reproducible first course. */
export function createNativeCppCourse(id: string, title = "Relay Course"): { readonly document: NativeGame3dDocument; readonly audio: Uint8Array; readonly files: Readonly<Record<string, Uint8Array>> } {
  const frames = 1600, wav = Buffer.alloc(44 + frames * 2);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(frames * 2, 40);
  for (let frame = 0; frame < frames; frame++) { wav.writeInt16LE(Math.round(Math.sin(frame * Math.PI * 880 / 16000) * 5000 * (1 - frame / frames)), 44 + frame * 2); }
  const document = nativeGame3dDocument.parse({ schemaVersion: 4, engine: "native-cpp-1", dimension: "3d", id, title, initialSceneId: "course",
    camera: { position: [7, 6, 10], target: [0, 1, 0] },
    assets: [{ id: "collect-tone", kind: "audio", path: "collect.wav", size: wav.length, digest: createHash("sha256").update(wav).digest("hex") }],
    hud: [{ id: "score", kind: "text", bounds: [.02, .02, .4, .1], text: "Score {score}" }, { id: "restart", kind: "button", bounds: [.8, .02, .18, .1], text: "Restart", action: "restart" }],
    inputActions: [{ id: "finish", bindings: ["KeyF"] }, { id: "restart", bindings: ["KeyR"] }],
    scripts: [
      { id: "platform-motion", source: "i=>({commands:[{kind:'setPosition',position:[-2,0.25,Math.sin(i.tick/60)*2]}]})" },
      { id: "gate-control", source: "i=>({commands:i.tick>=2?[{kind:'setPosition',position:[3,3,0]}]:[]})" },
      { id: "collect-audio", source: "({onDestroy(){command({kind:'audio',assetId:'collect-tone'});}})" },
      { id: "course-control", source: "i=>({state:{finished:i.state.finished||Boolean(i.input.actions&&i.input.actions.finish)},commands:i.input.actions&&i.input.actions.restart?[{kind:'score',amount:i.state.finished?-11:-1},{kind:'transition',sceneId:'course'}]:i.input.actions&&i.input.actions.finish&&!i.state.finished?[{kind:'score',amount:10},{kind:'emit',name:'finish'}]:[]})" }
    ], scenes: [{ id: "course", entities: [
      { id: "floor", transform: { position: [0, -.5, 0] }, collider: { shape: "box", halfExtents: [6, .5, 6] }, visual: { kind: "primitive", shape: "box", size: [12, 1, 12], color: [.2, .3, .35, 1] } },
      { id: "player", transform: { position: [0, 1, 0] }, collider: { shape: "capsule", radius: .35, halfHeight: .4 }, character: {}, visual: { kind: "primitive", shape: "capsule", size: [.7, 1.5, .7], color: [.1, .6, 1, 1] }, behaviors: [{ id: "course", scriptId: "course-control" }] },
      { id: "collectible", transform: { position: [0, 1, 0] }, collider: { shape: "sphere", radius: .3, sensor: true }, gameplay: { collectible: true, scoreValue: 1 }, visual: { kind: "primitive", shape: "sphere", size: [.6, .6, .6], color: [1, .8, .1, 1] }, behaviors: [{ id: "tone", scriptId: "collect-audio" }] },
      { id: "platform", transform: { position: [-2, .25, 0] }, body: { type: "kinematic" }, collider: { shape: "box", halfExtents: [1, .25, 1] }, visual: { kind: "primitive", shape: "box", size: [2, .5, 2], color: [.2, .7, .2, 1] }, behaviors: [{ id: "motion", scriptId: "platform-motion" }] },
      { id: "gate", transform: { position: [3, 1, 0] }, body: { type: "kinematic" }, collider: { shape: "box", halfExtents: [.2, 1, 2] }, visual: { kind: "primitive", shape: "box", size: [.4, 2, 4], color: [.8, .2, .2, 1] }, behaviors: [{ id: "open", scriptId: "gate-control" }] }
    ] }] });
  return { document, audio: wav, files: { "collect.wav": wav } };
}

/** Small owned atlas, encoded without an external image service or runtime dependency. */
function courseAtlas(): Uint8Array {
  const chunk = (name: string, data: Buffer): Buffer => {
    const type = Buffer.from(name), body = Buffer.concat([type, data]);
    let crc = 0xffffffff;
    for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) { crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } }
    const header = Buffer.alloc(4), checksum = Buffer.alloc(4);
    header.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, body, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(32); header.writeUInt32BE(16, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc(16 * (1 + 32 * 4));
  for (let y = 0; y < 16; y++) { for (let x = 0; x < 32; x++) {
    const offset = y * 129 + 1 + x * 4;
    pixels[offset] = x < 16 ? 50 : 255; pixels[offset + 1] = x < 16 ? 170 : 200; pixels[offset + 2] = x < 16 ? 230 : 60; pixels[offset + 3] = 255;
  } }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
/** Native 2D authoring course uses the shared QuickJS lifecycle and TS component vocabulary. */
export function createNativeCpp2dCourse(id: string, title = "Relay Course"): { readonly document: NativeGame2dDocument; readonly audio: Uint8Array; readonly files: Readonly<Record<string, Uint8Array>> } {
  const base = createNativeCppCourse(id, title), image = courseAtlas();
  const first = { x: 0, y: 0, width: 16, height: 16 }, second = { x: 16, y: 0, width: 16, height: 16 };
  const { camera: _camera, ...common } = base.document;
  const document = nativeGame2dDocument.parse({ ...common, schemaVersion: 5, dimension: "2d", 
    gravity: { x: 0, y: -9.81 }, camera2d: { width: 16, height: 9, zoom: 1 },
    assets: [...base.document.assets, { id: "course-atlas", kind: "image", path: "course.png", size: image.length, digest: createHash("sha256").update(image).digest("hex") }],
    lighting: { ambient: { color: "#ffffff", intensity: 0.65 }, points: [{ x: 3, y: 2, color: "#ffdd88", intensity: 1, radius: 5, falloff: 1 }] },
    backgrounds: [{ id: "sky", assetId: "course-atlas", width: 16, height: 9, frame: first, layer: -100, parallax: { x: 0.2, y: 0.2 }, mode: "repeat" }],
    scripts: [
      { id: "platform-motion", source: "i=>({commands:[{kind:'setVelocity',velocity:{x:Math.cos(i.tick/60),y:0}}]})" },
      { id: "gate-control", source: "i=>({commands:i.tick>=2?[{kind:'setPosition',position:{x:4,y:5}}]:[]})" },
      base.document.scripts.find(script => script.id === "collect-audio"),
      base.document.scripts.find(script => script.id === "course-control")
    ], scenes: [{ id: "course", entities: [
      { id: "floor", tilemap: { assetId: "course-atlas", solid: true, tiles: Array.from({ length: 16 }, (_, index) => ({ x: index - 8, y: -2, width: 1, height: 1, frame: first })) } },
      { id: "player", transform: { x: 0, y: 0 }, body2d: { type: "kinematic", gravityScale: 1 }, collider2d: { width: 0.7, height: 1 }, sprite: { assetId: "course-atlas", width: 0.7, height: 1, frame: first, layer: 2 }, animator: { frames: [first, second], ticksPerFrame: 15 }, behaviors: [{ id: "course", scriptId: "course-control" }] },
      { id: "collectible", transform: { x: 0, y: 0 }, collider2d: { width: 0.4, height: 0.4, sensor: true }, gameplay: { collectible: true, scoreValue: 1 }, sprite: { assetId: "course-atlas", width: 0.4, height: 0.4, frame: second, layer: 3, unlit: true }, behaviors: [{ id: "tone", scriptId: "collect-audio" }] },
      { id: "platform", transform: { x: -3, y: 0 }, body2d: { type: "static" }, collider2d: { width: 2, height: 0.3 }, sprite: { assetId: "course-atlas", width: 2, height: 0.3, frame: first }, behaviors: [{ id: "motion", scriptId: "platform-motion" }] },
      { id: "one-way", transform: { x: 2, y: 1 }, collider2d: { width: 2, height: 0.2, oneWay: true }, sprite: { assetId: "course-atlas", width: 2, height: 0.2, frame: second } },
      { id: "gate", transform: { x: 4, y: 0 }, collider2d: { width: 0.3, height: 3 }, sprite: { assetId: "course-atlas", width: 0.3, height: 3, frame: second }, behaviors: [{ id: "open", scriptId: "gate-control" }] }
    ] }] });
  return { document, audio: base.audio, files: { ...base.files, "course.png": image } };
}
