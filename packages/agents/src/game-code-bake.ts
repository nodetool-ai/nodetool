import { createHash } from "node:crypto";
import { z } from "zod";
import { anyGameDocument, gameAuthoring, gameAuthoringProgram, type AnyGameDocument } from "@nodetool-ai/protocol";
import { validateAnyGame } from "@nodetool-ai/game-runtime";
import { getProcessSandboxModuleCatalog, type ProcessingContext } from "@nodetool-ai/runtime";
import { runInSandbox } from "./js-sandbox.js";
import { resolveImportedPacks } from "./js-script-sandbox.js";

export interface GameConstructionProgram {
  source: string;
  inputs: Record<string, unknown>;
  seed: number;
}

export const GAME_BAKE_TIMEOUT_MS = 5000;
const MAX_PROGRAM_BYTES = 128 * 1024;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

export function gameDocumentDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value) ?? "undefined").digest("hex");
}

export type BakeGameResult = { ok: true; document: AnyGameDocument; logs: string[];
  parameters: Record<string, unknown>; prefabs: Record<string, unknown>; instances: unknown[] } |
  { ok: false; error: string; logs: string[] };

/** No host tools or inherited preparation capabilities are installed. */
export async function bakeGameCode(context: ProcessingContext, program: GameConstructionProgram): Promise<BakeGameResult> {
  const fail = (error: string, logs: string[] = []): BakeGameResult => ({ ok: false, error, logs });
  if (!program.source.trim() || Buffer.byteLength(program.source) > MAX_PROGRAM_BYTES ||
    !Number.isSafeInteger(program.seed)) { return fail("Invalid or oversized retained construction program"); }
  let serialized: string;
  try {
    const parsedProgram = gameAuthoringProgram.safeParse(program);
    if (!parsedProgram.success) { return fail("Retained construction inputs must match the JSON program schema"); }
    program = parsedProgram.data;
    serialized = JSON.stringify(program);
    if (Buffer.byteLength(serialized) > MAX_PROGRAM_BYTES) { return fail("Retained construction inputs exceed their budget"); }
  } catch { return fail("Retained construction inputs must be JSON data"); }
  const code = `import { constructGame } from "@nodetool-ai/sandbox-game";
    globalThis.Date = class Date { constructor() { throw new Error("Clock access is unavailable during game construction"); }
      static now() { throw new Error("Clock access is unavailable during game construction"); } };
    globalThis.fetch = () => { throw new Error("Network access is unavailable during game construction"); };
    globalThis.workspace = new Proxy({}, { get() { throw new Error("Workspace access is unavailable during game construction"); } });
    globalThis.getSecret = () => { throw new Error("Secrets are unavailable during game construction"); };
    for (const name of ["media", "image", "audio", "video", "canvas", "crypto", "format"]) {
      globalThis[name] = new Proxy({}, { get() { throw new Error(name + " is unavailable during game construction"); } });
    }
    Math.random = () => { throw new Error("Use builder.random() for seeded authoring randomness"); };
    return constructGame(${serialized}, (inputs, builder) => { ${program.source}\n });`;
  const packs = resolveImportedPacks(code, context, { subject: "Retained game construction",
    catalog: context.sandboxModuleCatalog ?? getProcessSandboxModuleCatalog() });
  if (!packs.ok) { return fail(packs.error); }
  const result = await runInSandbox({ code, hermetic: true, timeoutMs: GAME_BAKE_TIMEOUT_MS,
    limits: { secretScope: [], maxFetchCalls: 0, maxOutputSize: MAX_DOCUMENT_BYTES }, modules: packs.modules });
  const logs = result.logs ?? [];
  if (!result.success) { return fail(result.error ?? "Game construction failed", logs); }
  const envelope = result.result;
  if (!envelope || typeof envelope !== "object" || !("document" in envelope) ||
    !("parameters" in envelope) || !("prefabs" in envelope) || !("instances" in envelope)) { return fail("Construction output exceeds its budget or is invalid", logs); }
  const parsed = anyGameDocument.safeParse(envelope.document);
  if (!parsed.success) { return fail(`Invalid construction document: ${parsed.error.message}`, logs); }
  if (parsed.data.authoring) { return fail("Construction output cannot supply its own authoring metadata", logs); }
  const validated = validateAnyGame(parsed.data);
  if (!validated.valid || !validated.document) { return fail(`Invalid construction references: ${JSON.stringify(validated.diagnostics)}`, logs); }
  const metadata = z.strictObject({ parameters: gameAuthoring.shape.parameters,
    prefabs: gameAuthoring.shape.prefabs, instances: gameAuthoring.shape.instances }).safeParse({
    parameters: envelope.parameters, prefabs: envelope.prefabs, instances: envelope.instances
  });
  if (!metadata.success) { return fail(`Invalid retained definitions: ${metadata.error.message}`, logs); }
  return { ok: true, document: validated.document, logs, ...metadata.data };
}

/** Matching two fresh executions is required before attaching retained source. */
export async function reproducibleGameBake(context: ProcessingContext, program: GameConstructionProgram): Promise<BakeGameResult> {
  const first = await bakeGameCode(context, program);
  if (!first.ok) { return first; }
  const second = await bakeGameCode(context, program);
  if (!second.ok) { return second; }
  if (gameDocumentDigest({ ...first, logs: [] }) !== gameDocumentDigest({ ...second, logs: [] })) {
    return { ok: false, error: "Retained construction did not reproduce its document", logs: first.logs };
  }
  return first;
}
