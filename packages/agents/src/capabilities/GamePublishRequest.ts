import type { AnyGameDocument } from "@nodetool-ai/protocol";

/** Publication requires the token paired with an explicitly supplied document. */
export type PublishNativeGameRequest = {
  readonly game_id: string;
  readonly base_revision: string;
  readonly message?: string;
} & (
  | { readonly document: AnyGameDocument; readonly base_updated_at: string }
  | { readonly document?: never; readonly base_updated_at?: never }
);
