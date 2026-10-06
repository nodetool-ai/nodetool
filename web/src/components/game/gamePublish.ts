import type { AnyGameDocument } from "@nodetool-ai/protocol";
import { validateAnyGame } from "@nodetool-ai/game-runtime";

export interface GamePublishRequest {
  readonly id: string;
  readonly baseRevision: string;
  readonly baseUpdatedAt?: string;
  readonly expectedDigest?: string;
  readonly document?: AnyGameDocument;
  readonly message?: string;
}

interface GamePublishOptions {
  readonly id: string;
  readonly flight: { current: Promise<void> | null };
  readonly document: AnyGameDocument;
  readonly message?: string;
  readonly flush: () => Promise<void>;
  readonly getDraft: () => { readonly document: AnyGameDocument | null; readonly baseUpdatedAt: string | null };
  readonly fetchRevision: () => Promise<string>;
  readonly publish: (request: GamePublishRequest) => Promise<unknown>;
}

async function documentDigest(document: AnyGameDocument): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(document)));
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function performPublish(options: GamePublishOptions): Promise<void> {
  const validation = validateAnyGame(structuredClone(options.document));
  if (!validation.valid) { throw new Error(validation.diagnostics.map((issue) => issue.message).join("; ")); }
  const candidate = validation.document;
  const expectedDigest = await documentDigest(candidate);
  await options.flush();
  const current = options.getDraft();
  if (!current.document || !current.baseUpdatedAt || await documentDigest(current.document) !== expectedDigest) {
    throw new Error("The draft changed. Review changes before publishing.");
  }
  const baseRevision = await options.fetchRevision();
  let request: GamePublishRequest = { id: options.id, baseRevision, baseUpdatedAt: current.baseUpdatedAt,
    document: candidate, expectedDigest };
  if (options.message) { request = { ...request, message: options.message }; }
  await options.publish(request);
}

export async function publishGameDraft(options: GamePublishOptions): Promise<void> {
  if (options.flight.current) { return options.flight.current; }
  const pending = performPublish(options);
  options.flight.current = pending;
  try { await pending; }
  finally { if (options.flight.current === pending) { options.flight.current = null; } }
}
