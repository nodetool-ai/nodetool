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
import { fileURLToPath } from "node:url";
import nodePath from "node:path";
import { z } from "zod";
import { Asset } from "@nodetool-ai/models";
import { createLogger } from "@nodetool-ai/config";
import { parsePackageAssetUri } from "@nodetool-ai/protocol";
import {
  anyGameDocument as gameDocument,
  type ExampleGameSummary,
  type AnyGameDocument as GameDocument
} from "@nodetool-ai/protocol";
import { assetObjectKey, type StorageAdapter } from "@nodetool-ai/storage";

const SUFFIX = ".game.json";
const log = createLogger("nodetool.agents.game-examples");

export interface ExampleGameCleanupFailure {
  readonly assetId: string;
  readonly operation: "storage" | "asset";
  readonly error: unknown;
}

/** Cleanup diagnostics and retry are available to the in-process install caller. */
export class ExampleGameAssetRollbackError extends AggregateError {
  constructor(
    readonly failures: readonly ExampleGameCleanupFailure[],
    readonly rollback: () => Promise<void>,
    cause?: unknown
  ) {
    super(failures.map(({ error }) => error), cause instanceof Error ? cause.message : "Failed to remove example game assets", { cause });
    this.name = "ExampleGameAssetRollbackError";
  }
}
const bundleSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  controls: z.string().min(1),
  posterUri: z.string(),
  document: gameDocument
}).strict();
export type ExampleGameBundle = z.infer<typeof bundleSchema>;

const CONTENT_TYPES: Record<string, string> = {
  ".json": "application/json",
  ".glb": "model/gltf-binary",
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
export function resolveExampleGamesDir(options: ExampleGameOptions = {}): string | null {
  if (options.examplesDir) {
    const dir = nodePath.join(nodePath.dirname(options.examplesDir), "games");
    return existsSync(dir) ? dir : null;
  }
  const override = process.env["NODETOOL_EXAMPLE_GAMES_DIR"];
  if (override) return existsSync(override) ? override : null;
  let cursor = nodePath.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    for (const dir of [nodePath.join(cursor, "examples", "games"), nodePath.join(cursor, "packages", "base-nodes", "nodetool", "examples", "games")]) {
      if (existsSync(dir)) return dir;
    }
    cursor = nodePath.dirname(cursor);
  }
  return null;
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
  const gamesDir = resolveExampleGamesDir(options);
  if (gamesDir) {
    roots.push(nodePath.join(nodePath.dirname(nodePath.dirname(gamesDir)), "assets"));
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
  slug: string,
  storage: StorageAdapter
): Promise<{ bundle: ExampleGameBundle; document: GameDocument; rollback: (cause?: unknown) => Promise<void> }> {
  const bundle = getExampleGameBundle(options, slug);
  if (!bundle) {
    throw new Error(`No example game named "${slug}"`);
  }
  const created = new Map<string, { assetId: string; asset: Asset | null; uri: string | null }>();
  const rollback = async (cause?: unknown): Promise<void> => {
    const failures: ExampleGameCleanupFailure[] = [];
    const entries = [...created.values()];
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (!entry) { continue; }
      if (entry.uri) {
        try {
          await storage.delete(entry.uri);
          entry.uri = null;
        } catch (error) {
          failures.push({ assetId: entry.assetId, operation: "storage", error });
        }
      }
      if (entry.asset) {
        try {
          await entry.asset.delete();
          entry.asset = null;
        } catch (error) {
          failures.push({ assetId: entry.assetId, operation: "asset", error });
        }
      }
      if (!entry.uri && !entry.asset) { created.delete(entry.assetId); }
    }
    if (failures.length) {
      log.error("Example game asset cleanup failed", { slug, failures: failures.map(({ assetId, operation, error }) => ({
        assetId, operation, message: error instanceof Error ? error.message : String(error)
      })) });
      throw new ExampleGameAssetRollbackError(failures, () => rollback(cause), cause);
    }
  };
  const document = structuredClone(bundle.document);
  try {
    for (const [slot, binding] of Object.entries(bundle.document.assets)) {
      const bytes = readExampleGameFile(options, binding.assetId);
      if (!bytes) {
        throw new Error(`Example game "${slug}" is missing ${binding.assetId}`);
      }
      if (createHash("sha256").update(bytes).digest("hex") !== binding.digest) {
        throw new Error(`Example game "${slug}" file changed: ${binding.assetId}`);
      }
      const extension = nodePath.extname(binding.assetId).toLowerCase();
      const contentType = CONTENT_TYPES[extension] ?? "application/octet-stream";
      const asset = await Asset.create({
        user_id: userId,
        project_id: projectId,
        parent_id: userId,
        name: `${slug}-${slot}${extension}`,
        content_type: contentType,
        size: bytes.byteLength,
        metadata: { example_game: slug, game_digest: binding.digest }
      });
      if (!(asset instanceof Asset)) throw new Error("Failed to create example game asset");
      const entry: { assetId: string; asset: Asset | null; uri: string | null } = { assetId: asset.id, asset, uri: null };
      created.set(asset.id, entry);
      const key = assetObjectKey(userId, `${asset.id}${extension}`);
      const uri = storage.uriForKey(key);
      if (await storage.exists(uri)) { throw new Error("Example game asset storage destination already exists"); }
      entry.uri = uri;
      entry.uri = await storage.store(key, bytes, contentType);
      document.assets[slot] = { ...binding, assetId: asset.id };
    }
  } catch (error) {
    await rollback(error);
    throw error;
  }
  return { bundle, document, rollback };
}
