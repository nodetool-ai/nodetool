import { writeRgbaVideo } from "@nodetool-ai/runtime/media/testing";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const directory = fileURLToPath(new URL("./fixtures", import.meta.url));
const width = 160,
  height = 96,
  fps = 30,
  frames = 60;
await writeRgbaVideo({
  outPath: `${directory}/source-noise.mp4`,
  width,
  height,
  fps,
  frames,
  spec: {
    codec: "libx264",
    pixelFormat: "yuv420p",
    options: { crf: "0", preset: "ultrafast", bf: "0" }
  },
  frameAt: (index) => {
    const data = new Uint8Array(width * height * 4);
    let seed = index + 1;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const box =
          x >= 20 + ((index * 2) % 90) &&
          x < 40 + ((index * 2) % 90) &&
          y >= 30 &&
          y < 65;
        const base = index < 30 ? (box ? 190 : 75) : box ? 60 : 180,
          noise = ((seed >>> 24) % 25) - 12;
        data.set(
          [base + noise, base + noise, base + noise, 255],
          (y * width + x) * 4
        );
      }
    return data;
  }
});
const effect = {
  id: "denoise",
  type: "denoise",
  enabled: true,
  lumaStrength: 0.7,
  chromaStrength: 0.8,
  temporalStrength: 1,
  radius: 2
};
const doc = {
  id: "seq-clip-denoise",
  projectId: "native-prototype",
  name: "clip-denoise",
  fps,
  width,
  height,
  durationMs: 2000,
  tracks: [
    {
      id: "t0",
      name: "Video",
      type: "video",
      index: 0,
      visible: true,
      locked: false
    }
  ],
  clips: [
    {
      id: "denoise",
      trackId: "t0",
      name: "Noise reduction",
      startMs: 0,
      durationMs: 2000,
      inPointMs: 0,
      mediaType: "video",
      sourceType: "imported",
      status: "generated",
      locked: false,
      versions: [],
      width,
      height,
      mediaPath: "source-noise.mp4",
      effects: [effect]
    }
  ],
  markers: [],
  createdAt: "2026-10-24T00:00:00.000Z",
  updatedAt: "2026-10-24T00:00:00.000Z",
  goldenFrames: [0, 40, 10, 29, 30, 59].map((frame) => ({
    frame,
    criterion:
      "F52 moving edges, scene-cut rejection and bounded temporal samples, PSNR >= 40 dB"
  }))
};
writeFileSync(
  `${directory}/clip-denoise.json`,
  JSON.stringify(doc, null, 2) + "\n"
);
const cropped = structuredClone(doc);
cropped.id = "seq-clip-denoise-crop";
cropped.name = "clip-denoise-crop";
cropped.clips[0].crop = { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 };
writeFileSync(
  `${directory}/clip-denoise-crop.json`,
  JSON.stringify(cropped, null, 2) + "\n"
);

const many = structuredClone(doc);
many.id="seq-clip-denoise-many";many.name="clip-denoise-many";
many.clips=Array.from({length:5},(_,index)=>({...structuredClone(doc.clips[0]),id:`noise-${index}`,
  transform:{position:{x:(index-2)*32,y:0},scale:{x:.2,y:1},rotation:0,anchor:{x:.5,y:.5}}}));
many.goldenFrames=[{frame:10,criterion:"F52 five visible video layers retain all fifteen required source decoders, PSNR >= 40 dB"}];
writeFileSync(`${directory}/clip-denoise-many.json`,JSON.stringify(many,null,2)+"\n");
