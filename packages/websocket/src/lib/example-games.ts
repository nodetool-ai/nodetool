/**
 * Shipped example games.
 *
 * A bundle is `examples/games/<slug>.game.json`, built by
 * `scripts/example-games/build.mjs`. Its document binds every asset slot to a
 * `package://` file under the package asset root, because a game document
 * binds user asset rows and a shipped file has none. Installing a bundle
 * copies each file into the user's assets and rebinds the slot to the new row.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import nodePath from "node:path";
import { z } from "zod";
import { Asset } from "@nodetool-ai/models";
import { parsePackageAssetUri } from "@nodetool-ai/protocol";
import {
  gameDocument,
  type ExampleGameSummary,
  type GameDocument
} from "@nodetool-ai/protocol/game.js";
import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";
import { getAssetStorageKey } from "./asset-paths.js";
import { getAssetAdapter } from "./storage.js";

const SUFFIX = ".game.json";
const bundleSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  controls: z.string().min(1),
  posterUri: z.string(),
  document: gameDocument
});
export type ExampleGameBundle = z.infer<typeof bundleSchema>;

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".ttf": "font/ttf",
  ".otf": "font/otf"
};

export interface ExampleGameOptions {
  examplesDir?: string;
  packageAssetsRoots?: string[];
}

/** Resolve the shipped game directory beside example workflows. */
export function resolveExampleGamesDir(options: ExampleGameOptions): string | null {
  if (!options.examplesDir) return null;
  const dir = nodePath.join(nodePath.dirname(options.examplesDir), "games");
  return existsSync(dir) ? dir : null;
}

function files(dir: string): string[] {
  try {
    return readdirSync(dir).filter((file) => file.endsWith(SUFFIX)).sort();
  } catch {
    return [];
  }
}

function readBundle(dir: string, file: string): ExampleGameBundle | null {
  try {
    return bundleSchema.parse(JSON.parse(readFileSync(nodePath.join(dir, file), "utf8")));
  } catch {
    return null;
  }
}

/** Read one validated, shipped game bundle by exact slug. */
export function getExampleGameBundle(options: ExampleGameOptions, slug: string): ExampleGameBundle | null {
  const dir = resolveExampleGamesDir(options);
  if (!dir) return null;
  const file = files(dir).find((entry) => entry.slice(0, -SUFFIX.length) === slug);
  return file ? readBundle(dir, file) : null;
}

/** List lightweight cards for the Examples page. */
export function listExampleGames(options: ExampleGameOptions): ExampleGameSummary[] {
  const dir = resolveExampleGamesDir(options);
  if (!dir) return [];
  return files(dir).flatMap((file) => {
    const bundle = readBundle(dir, file);
    if (!bundle || !parsePackageAssetUri(bundle.posterUri)) return [];
    return [{
      slug: file.slice(0, -SUFFIX.length),
      name: bundle.name,
      description: bundle.description,
      controls: bundle.controls,
      sceneCount: bundle.document.scenes.length,
      assetCount: Object.keys(bundle.document.assets).length,
      posterUri: bundle.posterUri
    }];
  });
}

/**
 * The package asset roots to search: the server's configured roots, then the
 * `assets/` directory beside `examples/`, which is where the monorepo and the
 * packaged backend both stage them.
 */
function packageRoots(options: ExampleGameOptions): string[] {
  const roots = [...(options.packageAssetsRoots ?? [])];
  if (options.examplesDir) {
    roots.push(nodePath.join(nodePath.dirname(nodePath.dirname(options.examplesDir)), "assets"));
  }
  return roots;
}

/** Read a shipped `package://` file, refusing paths that leave its root. */
export function readExampleGameFile(options: ExampleGameOptions, uri: string): Uint8Array | null {
  const ref = parsePackageAssetUri(uri);
  if (!ref) return null;
  for (const root of packageRoots(options)) {
    const base = nodePath.resolve(root, ref.packageName);
    const candidate = nodePath.resolve(base, ...ref.path.split("/"));
    const rel = nodePath.relative(base, candidate);
    if (rel.startsWith("..") || nodePath.isAbsolute(rel)) continue;
    try {
      return readFileSync(candidate);
    } catch {
      // Not under this root; try the next one.
    }
  }
  return null;
}

/**
 * Copy every asset a bundle binds into the user's assets and return the
 * document rebound to the new rows. On failure the rows and stored bytes
 * written so far are removed.
 */
export async function installExampleGameAssets(
  userId: string,
  projectId: string,
  options: ExampleGameOptions,
  slug: string
): Promise<{ bundle: ExampleGameBundle; document: GameDocument; rollback: () => Promise<void> }> {
  const bundle = getExampleGameBundle(options, slug);
  if (!bundle) {
    throwApiError(ApiErrorCode.NOT_FOUND, `No example game named "${slug}"`);
  }
  const storage = getAssetAdapter();
  const created: Array<{ asset: Asset; uri: string | null }> = [];
  const rollback = async (): Promise<void> => {
    for (const { asset, uri } of created.reverse()) {
      if (uri) await storage.delete(uri);
      await asset.delete();
    }
  };
  const assets: GameDocument["assets"] = {};
  try {
    for (const [slot, binding] of Object.entries(bundle.document.assets)) {
      const bytes = readExampleGameFile(options, binding.assetId);
      if (!bytes) {
        throwApiError(ApiErrorCode.NOT_FOUND, `Example game "${slug}" is missing ${binding.assetId}`);
      }
      if (createHash("sha256").update(bytes).digest("hex") !== binding.digest) {
        throwApiError(ApiErrorCode.INTERNAL_ERROR, `Example game "${slug}" file changed: ${binding.assetId}`);
      }
      const extension = nodePath.extname(binding.assetId).toLowerCase();
      const contentType = CONTENT_TYPES[extension] ?? "application/octet-stream";
      const asset = (await Asset.create({
        user_id: userId,
        project_id: projectId,
        parent_id: userId,
        name: `${slug}-${slot}${extension}`,
        content_type: contentType,
        size: bytes.byteLength,
        metadata: { example_game: slug, game_digest: binding.digest }
      })) as Asset;
      const entry: { asset: Asset; uri: string | null } = { asset, uri: null };
      created.push(entry);
      entry.uri = await storage.store(getAssetStorageKey(userId, asset.id, contentType), bytes, contentType);
      assets[slot] = { ...binding, assetId: asset.id };
    }
  } catch (error) {
    await rollback();
    throw error;
  }
  return { bundle, document: { ...bundle.document, assets }, rollback };
}
