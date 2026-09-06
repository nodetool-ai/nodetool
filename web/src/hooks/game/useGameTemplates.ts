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
 * The router lives in `packages/websocket/src/trpc/routers/games.ts`. Until it
 * is built and its types reach `AppRouter`, `trpcClient.games` is not on the
 * client's type, so the call goes through one narrow cast — kept in this file
 * only, so removing it is a single edit.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
  GameAssetManifest,
  GameSlotSpec
} from "@nodetool-ai/protocol";

import { trpcClient } from "../../trpc/client";

/** One shipped template, as `games.templates` returns it. */
export interface GameTemplate {
  /** Manifest template id: `platformer`, `topdown`, `shmup`. */
  id: string;
  /** Godot minor the template targets, e.g. `4.3`. */
  godot: string;
  slots: GameSlotSpec[];
  /** Project-relative gameplay files the agent edits after export. */
  hooks: string[];
}

/** The shape `games.templates` answers with. */
interface GameTemplatesRouter {
  games: { templates: { query: () => Promise<{ templates: GameTemplate[] }> } };
}

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
    queryFn: async (): Promise<GameTemplate[]> => {
      const client = trpcClient as unknown as GameTemplatesRouter;
      const answer = await client.games.templates.query();
      return answer.templates;
    },
    // Three manifests that ship with the install and never change under it.
    staleTime: Infinity
  });
}

export default useGameTemplates;
