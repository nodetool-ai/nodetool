import { installExampleGameAssets as installAssets, getExampleGameBundle, type ExampleGameOptions } from "@nodetool-ai/agents/game-examples";
import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";
import { getAssetAdapter } from "./storage.js";

export { getExampleGameBundle, listExampleGames, readExampleGameFile, resolveExampleGamesDir, type ExampleGameBundle, type ExampleGameOptions } from "@nodetool-ai/agents/game-examples";

/** Install the shared shipped bundle through the server's configured storage. */
export async function installExampleGameAssets(userId: string, projectId: string, options: ExampleGameOptions, slug: string): ReturnType<typeof installAssets> {
  if (!getExampleGameBundle(options, slug)) {
    throwApiError(ApiErrorCode.NOT_FOUND, `No example game named "${slug}"`);
  }
  return installAssets(userId, projectId, options, slug, getAssetAdapter());
}
