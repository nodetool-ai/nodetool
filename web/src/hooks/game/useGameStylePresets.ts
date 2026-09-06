/**
 * useGameStylePresets — the six shipped pixel-art styles, as library entities.
 *
 * The Look step picks a style by entity id and the graph builder pastes that
 * entity's descriptor into every prompt, so the rows have to exist before the
 * step renders. The server's `games.stylePresets` seeds any that are missing
 * and returns all six; it is idempotent, so this asks on every mount rather
 * than tracking whether it already ran — the same contract
 * `storyboards.stylePresets` has, and the same shape it answers with.
 *
 * The entity library is invalidated on success, because the seeded rows are
 * entities and `useEntities` is what the step reads their descriptors from.
 *
 * The router lives in `packages/websocket/src/trpc/routers/games.ts`. Until it
 * is built, `trpcClient.games` is not on the client's type, so the call goes
 * through one narrow cast — kept in this file only.
 */

import {
  useQuery,
  useQueryClient,
  type UseQueryResult
} from "@tanstack/react-query";

import { trpcClient } from "../../trpc/client";
import type { StylePresetEntity } from "../../serverState/useStylePresets";

/** The shape `games.stylePresets` answers with — `storyboards.stylePresets`'. */
interface GameStylePresetsRouter {
  games: {
    stylePresets: { mutate: () => Promise<StylePresetEntity[]> };
  };
}

export const GAME_STYLE_PRESETS_QUERY_KEY = ["game-style-presets"] as const;

export function useGameStylePresets(): UseQueryResult<
  StylePresetEntity[],
  Error
> {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: GAME_STYLE_PRESETS_QUERY_KEY,
    queryFn: async (): Promise<StylePresetEntity[]> => {
      const client = trpcClient as unknown as GameStylePresetsRouter;
      const presets = await client.games.stylePresets.mutate();
      await queryClient.invalidateQueries({ queryKey: ["entities"] });
      return presets;
    },
    // Six rows that never change under the user; one fetch per session.
    staleTime: Infinity
  });
}

export default useGameStylePresets;
