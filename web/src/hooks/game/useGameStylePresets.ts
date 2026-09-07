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
 * The router lives in `packages/websocket/src/trpc/routers/games.ts` and
 * answers with the preset array itself. Returning it as `StylePresetEntity[]`
 * is what checks the two shapes still agree: a field the router drops or
 * renames fails this function's return type.
 */

import {
  useQuery,
  useQueryClient,
  type UseQueryResult
} from "@tanstack/react-query";

import { trpcClient } from "../../trpc/client";
import type { StylePresetEntity } from "../../serverState/useStylePresets";

export const GAME_STYLE_PRESETS_QUERY_KEY = ["game-style-presets"] as const;

export function useGameStylePresets(): UseQueryResult<
  StylePresetEntity[],
  Error
> {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: GAME_STYLE_PRESETS_QUERY_KEY,
    queryFn: async (): Promise<StylePresetEntity[]> => {
      const presets = await trpcClient.games.stylePresets.mutate();
      await queryClient.invalidateQueries({ queryKey: ["entities"] });
      return presets;
    },
    // Six rows that never change under the user; one fetch per session.
    staleTime: Infinity
  });
}

export default useGameStylePresets;
