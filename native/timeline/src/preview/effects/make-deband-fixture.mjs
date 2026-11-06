import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

const directory = fileURLToPath(new URL("./fixtures/", import.meta.url));
const width = 256, height = 64, stride = width * 3 + 1, pixels = Buffer.alloc(stride * height);
for (let y = 0; y < height; y++) { for (let x = 0; x < width; x++) {
  const value = x < 224 ? Math.floor(x / 16) * 4 : 255;
  pixels.set([value, value, value], y * stride + 1 + x * 3);
} }
// Native preview flags alpha-bearing media, so encode this opaque fixture as RGB.
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
fs.writeFileSync(`${directory}/source-banded.png`, Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))
]));
const settings = [
  {strength: 1, range: 16, threshold: 0.04, dither: 1},
  {strength: 0.65, range: 24, threshold: 0.015, dither: 0.3}
];
const document = {
  id: "seq-clip-deband", projectId: "native-prototype", name: "clip-deband", fps: 30, width, height, durationMs: 2000,
  tracks: [{id: "t0", name: "Video", type: "video", index: 0, visible: true, locked: false}],
  clips: settings.map((controls, index) => ({
    id: `deband-${index}`, trackId: "t0", name: "Deband", startMs: index * 1000, durationMs: 1000,
    mediaType: "image", sourceType: "imported", status: "generated", locked: false, versions: [], inPointMs: 0,
    width, height, mediaPath: "source-banded.png", effects: [{id: "deband", type: "deband", enabled: true, ...controls}]
  })),
  markers: [], createdAt: "2026-10-24T00:00:00.000Z", updatedAt: "2026-10-24T00:00:00.000Z",
  goldenFrames: [0, 30].map(frame => ({frame, criterion: "F55 dark bands, hard edge and deterministic dither, PSNR >= 40 dB"}))
};
fs.writeFileSync(`${directory}/clip-deband.json`, JSON.stringify(document, null, 2) + "\n");
