import type { GameDocument } from "@nodetool-ai/protocol";

/** Proposed K4 publication boundary for the S stream to implement. */
export type PublishNativeGameRequest = {
  readonly game_id: string;
  readonly base_revision: string;
  readonly message?: string;
} & (
  | { readonly document: GameDocument; readonly base_updated_at: string }
  | { readonly document?: never; readonly base_updated_at?: never }
);

export type PublishNativeGame = (request: PublishNativeGameRequest) => Promise<unknown>;
