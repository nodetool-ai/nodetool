import fs from "node:fs";

const directory = new URL("./fixtures/", import.meta.url);
const source = JSON.parse(fs.readFileSync(new URL("clip-sharpen.json", directory), "utf8"));
const video = JSON.parse(fs.readFileSync(new URL("clip-chromaKey.json", directory), "utf8"));
const effects = {
  colorCorrection: { brightness: 0.27, contrast: 1.7, saturation: 0.35, hue: 32, temperature: 0.3, tint: -0.2, shadows: 0.2, highlights: -0.25 },
  videoBlur: { radius: 28 },
  sharpen: { amount: 2, threshold: 0 },
  vignette: { intensity: 0.95, radius: 0.35, softness: 0.4 },
  chromaKey: { keyColor: "#c02040", tolerance: 0.15, softness: 0.1, spill: 0.7 }
};
const enabled = (type, values) => ({ id: type, type, enabled: true, ...values });
function fixture(name, trackEffects, clipEffects = [], group = false) {
  const keyed = name === "track-chromaKey";
  const doc = structuredClone(keyed ? video : source);
  doc.id = `seq-${name}`;
  doc.name = name;
  doc.durationMs = 1000;
  doc.clips = doc.clips.filter(clip => clip.startMs === 0);
  const picture = doc.clips[0];
  picture.id = "picture";
  picture.effects = clipEffects;
  doc.tracks[0].effects = trackEffects;
  if (group) {
    picture.parentId = "group";
    doc.clips.unshift({ id: "group", trackId: "t0", name: "group", mediaType: "group", startMs: 0,
      durationMs: 1000, sourceType: "generated", status: "generated", locked: false, versions: [], effects: [enabled("color", { brightness: 0 })] });
  }
  doc.goldenFrames = [{ frame: 0, criterion: `J track video ${name}, PSNR >= 40 dB` }];
  fs.writeFileSync(new URL(`${name}.json`, directory), `${JSON.stringify(doc, null, 2)}\n`);
}
for (const [type, values] of Object.entries(effects)) {
  fixture(`track-${type}`, [enabled(type, values), { ...enabled(type, values), id: "disabled", enabled: false },
    enabled("gain", { gainDb: 12 })]);
}
fixture("track-clip-aggregate", [enabled("colorCorrection", { ...effects.colorCorrection, brightness: 0.25, contrast: 1.6, saturation: 1.4 }),
  enabled("videoBlur", { radius: 10 })], [enabled("color", { brightness: -0.15, contrast: 0.8, saturation: 0.5 }),
  enabled("blur", { radius: 8 }), enabled("posterize", { levels: 5 })]);
fixture("track-group", [enabled("colorCorrection", effects.colorCorrection)], [], true);
