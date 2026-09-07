/**
 * The shipped Godot templates, as the flow reads them (game-prd § 6.1).
 *
 * `list_game_templates` is an agent capability; the web reads the same list
 * through the read-only `games.templates` trpc query, which maps
 * `listTemplates()` to `{ id, godot, slots, hooks }`. The flow needs it for
 * three things a card cannot fake: the slot counts on the template cards, the
 * per-slot rows of the design review, and the manifest `gameGraphPlacement`
 * builds the graph from.
 *
 * The procedure answers with the array itself, and `GameTemplate` is that
 * array's element type as `AppRouter` declares it — so a change to the
 * router's output stops this file at compile time rather than emptying the
 * template grid at runtime.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { GameAssetManifest } from "@nodetool-ai/protocol";

import { trpcClient, type RouterOutputs } from "../../trpc/client";

/** One shipped template, as `games.templates` returns it. */
export type GameTemplate = RouterOutputs["games"]["templates"][number];

export const GAME_TEMPLATES_QUERY_KEY = ["game-templates"] as const;

/** The manifest the graph builder takes, rebuilt from one template row. */
export const templateManifest = (
  template: GameTemplate
): GameAssetManifest => ({
  version: 1,
  template: template.id,
  godot: template.godot,
  slots: template.slots,
  hooks: template.hooks
});

export function useGameTemplates(): UseQueryResult<GameTemplate[], Error> {
  return useQuery({
    queryKey: GAME_TEMPLATES_QUERY_KEY,
    queryFn: () => trpcClient.games.templates.query(),
    // Three manifests that ship with the install and never change under it.
    staleTime: Infinity
  });
}

export default useGameTemplates;
