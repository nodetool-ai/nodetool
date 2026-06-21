/**
 * Pin a cast's generated assets to local files so it replays with no backend
 * and no further generations (no credits burned).
 *
 *   npm run pin-assets -- casts/my-demo.cast.json [--api http://localhost:7777]
 *
 * For every asset in the cast manifest, this downloads `originalUri` into
 * demo/public/casts/<castId>/<file>, fixes the file extension + contentType
 * from the HTTP response, and rewrites the cast JSON in place. After pinning,
 * the cast + its public/casts/<id>/ folder are fully self-contained.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface CastAsset {
  key: string;
  file: string;
  contentType: string;
  originalUri?: string;
  bytes?: number;
}
interface DemoCast {
  id: string;
  assets: CastAsset[];
  [k: string]: unknown;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const demoRoot = path.resolve(here, "..");

function parseArgs(argv: string[]): { castPath: string; api: string } {
  const args = argv.slice(2);
  const apiIdx = args.indexOf("--api");
  const api = apiIdx >= 0 ? args[apiIdx + 1] : "http://localhost:7777";
  const castPath = args.find((a) => !a.startsWith("--") && a !== api);
  if (!castPath) {
    throw new Error(
      "Usage: pin-cast-assets <cast.json> [--api http://localhost:7777]"
    );
  }
  return { castPath: path.resolve(process.cwd(), castPath), api };
}

/** Resolve a recorded `originalUri` to a fetchable absolute URL. */
function toFetchUrl(originalUri: string, api: string): string {
  if (originalUri.startsWith("asset://")) {
    return `${api}/api/storage/${originalUri.slice("asset://".length)}`;
  }
  if (originalUri.startsWith("/api/")) return `${api}${originalUri}`;
  return originalUri;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/json": "json",
};

async function main(): Promise<void> {
  const { castPath, api } = parseArgs(process.argv);
  const cast = JSON.parse(await readFile(castPath, "utf8")) as DemoCast;
  const outDir = path.join(demoRoot, "public", "casts", cast.id);
  await mkdir(outDir, { recursive: true });

  let pinned = 0;
  for (const asset of cast.assets) {
    if (!asset.originalUri) {
      console.warn(`skip ${asset.key}: no originalUri`);
      continue;
    }
    const url = toFetchUrl(asset.originalUri, api);
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`skip ${asset.key}: HTTP ${res.status} for ${url}`);
      continue;
    }
    const contentType =
      res.headers.get("content-type")?.split(";")[0]?.trim() ||
      asset.contentType;
    const ext =
      EXT_BY_TYPE[contentType] ?? (path.extname(asset.file).slice(1) || "bin");
    const file = `${asset.key}.${ext}`;
    const bytes = new Uint8Array(await res.arrayBuffer());
    await writeFile(path.join(outDir, file), bytes);

    asset.file = file;
    asset.contentType = contentType;
    asset.bytes = bytes.byteLength;
    pinned++;
    console.log(`pinned ${asset.key} → public/casts/${cast.id}/${file} (${bytes.byteLength} bytes)`);
  }

  await writeFile(castPath, JSON.stringify(cast, null, 2));
  console.log(`\nPinned ${pinned}/${cast.assets.length} assets. Updated ${path.relative(process.cwd(), castPath)}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
