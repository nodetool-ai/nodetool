/**
 * useStylePresets — the twelve shipped art styles, as library entities.
 *
 * The style step picks a preset by entity id and `setStylePreset` writes that
 * id onto the board, so the rows have to exist before the step renders. The
 * server's `storyboards.stylePresets` seeds any that are missing and returns
 * all twelve; it is idempotent, so this asks on every mount rather than
 * tracking whether it already ran.
 *
 * The entity library is invalidated on success, because the seeded rows are
 * entities and `useEntities` is what `setStylePreset` reads their descriptors
 * from.
 */

import {
  useQuery,
  useQueryClient,
  type UseQueryResult
} from "@tanstack/react-query";

import { trpcClient } from "../trpc/client";

/** One shipped preset: the tile's picture and label, and the id to apply. */
export interface StylePresetEntity {
  /** Library entity id — what `setStylePreset` writes onto the board. */
  entityId: string;
  /** Stable slug, e.g. "noir". */
  presetId: string;
  name: string;
  /** Pasted verbatim into every prompt the style applies to. */
  descriptor: string;
  /** `package://` path of the tile art. */
  thumbnail: string;
}

export const STYLE_PRESETS_QUERY_KEY = ["style-presets"] as const;

export function useStylePresets(): UseQueryResult<StylePresetEntity[], Error> {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: STYLE_PRESETS_QUERY_KEY,
    queryFn: async (): Promise<StylePresetEntity[]> => {
      const presets = await trpcClient.storyboards.stylePresets.mutate();
      await queryClient.invalidateQueries({ queryKey: ["entities"] });
      return presets;
    },
    // Twelve rows that never change under the user; one fetch per session.
    staleTime: Infinity
  });
}
