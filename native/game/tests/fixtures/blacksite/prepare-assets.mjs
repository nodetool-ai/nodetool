import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { partitionFacility } from "./lossless-glb.mjs";
import { BLACKSITE_AUDIO_LIMITS, decodeBlacksiteScore } from "./prepare-audio.mjs";

const sourceRoot = new URL("../../../../../packages/game-runtime/samples/blacksite/", import.meta.url);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function prepareBlacksiteAssets(outputDirectory) {
  const output = resolve(outputDirectory);
  await mkdir(resolve(output, "assets"), { recursive: true });
  const sourceBytes = await readFile(new URL("game.json", sourceRoot));
  const source = JSON.parse(sourceBytes);
  const names = await readdir(new URL("assets/", sourceRoot));
  const assets = [];
  let preparedBytes = 0;
  const provenance = { source: "packages/game-runtime/samples/blacksite/game.json", sourceDigest: hash(sourceBytes), assets: [], omittedVisualSurfaces: [] };
  let facility;
  for (const [slot, binding] of Object.entries(source.assets)) {
    const matches = names.filter((name) => name.startsWith(`${binding.assetId}.`));
    if (matches.length !== 1) {
      throw new Error(`Expected one owned asset for ${slot}`);
    }
    const bytes = await readFile(new URL(`assets/${matches[0]}`, sourceRoot));
    if (hash(bytes) !== binding.digest) {
      throw new Error(`Source digest mismatch for ${slot}`);
    }
    const register = async (id, name, prepared, kind = binding.mediaKind, dependencies = [], originalDigest = binding.digest) => {
      const path = `assets/${name}`;
      const asset = { id, kind, digest: hash(prepared), path, size: prepared.length, dependencies };
      const fileLimit = kind === "audio" ? BLACKSITE_AUDIO_LIMITS.fileBytes : 8 * 1024 * 1024;
      if (asset.size > fileLimit) {
        throw new Error(`BLACKSITE prepared file exceeds the native browser cap: ${id}`);
      }
      if (preparedBytes + asset.size > 256 * 1024 * 1024) {
        throw new Error("BLACKSITE prepared assets exceed the existing aggregate byte budget");
      }
      await writeFile(resolve(output, path), prepared, { flag: "wx" });
      assets.push(asset);
      preparedBytes += asset.size;
      provenance.assets.push({ id, sourceSlot: slot, originalDigest, preparedDigest: asset.digest, path });
    };
    if (slot === "facility") {
      facility = partitionFacility(bytes);
      for (const image of facility.imageAssets) {
        await register(image.id, image.uri, image.bytes, "image", [], image.digest);
      }
      for (const [index, chunk] of facility.chunks.entries()) {
        await register(`facility-chunk-${index}`, `facility-chunk-${index}.glb`, chunk.bytes, "model", facility.imageAssets.map((image) => image.id));
      }
      provenance.facility = {
        originalVertices: facility.originalVertices,
        originalIndices: facility.originalIndices,
        adaptedIndices: facility.chunks.reduce((sum, chunk) => sum + chunk.indices, 0),
        originalExpandedTriangleAttributesDigest: facility.originalExpandedTriangleAttributesDigest,
        adaptedExpandedTriangleAttributesDigest: facility.adaptedExpandedTriangleAttributesDigest,
        sourceImageDigests: facility.sourceImageDigests,
        externalImages: facility.imageAssets.map(({ id, uri, bytes, digest }) => ({ id, uri, size: bytes.length, digest })),
        limits: facility.limits,
        chunks: facility.chunks.map(({ vertices, indices, slices }) => ({ vertices, indices, slices }))
      };
    } else if (slot === "score") {
      const decoded = decodeBlacksiteScore(bytes, fileURLToPath(new URL(`assets/${matches[0]}`, sourceRoot)));
      await register(slot, "score.wav", decoded.bytes);
      await mkdir(resolve(output, "source-audio"), { recursive: true });
      await writeFile(resolve(output, "source-audio/score.ogg"), bytes, { flag: "wx" });
      provenance.audio = { score: { ...decoded.metadata, sourceCopyPath: "source-audio/score.ogg", preparedPath: "assets/score.wav", preparedDigest: hash(decoded.bytes), preparedSize: decoded.bytes.length } };
    } else {
      // In particular, keep the complete rifle including its BLEND optic glass.
      await register(slot, matches[0], bytes);
    }
  }
  if (!facility || assets.length === 0) {
    throw new Error("BLACKSITE asset preparation inspected no facility or assets");
  }
  await writeFile(resolve(output, "asset-provenance.json"), JSON.stringify(provenance, null, 2) + "\n", { flag: "wx" });
  await writeFile(resolve(output, "native-assets.json"), JSON.stringify(assets, null, 2) + "\n", { flag: "wx" });
  return { source, assets, provenance, facilitySlots: assets.filter((asset) => asset.id.startsWith("facility-chunk-")).map((asset) => asset.id) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length !== 2 || arguments_[0] !== "--out") {
    throw new Error("Usage: node prepare-assets.mjs --out <empty-artifact-directory>");
  }
  const result = await prepareBlacksiteAssets(arguments_[1]);
  process.stdout.write(JSON.stringify({ assets: result.assets.length, facilityChunks: result.facilitySlots.length, provenance: result.provenance.facility }) + "\n");
}
