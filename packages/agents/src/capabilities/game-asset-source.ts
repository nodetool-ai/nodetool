import { z } from "zod";
import { loadMediaRefBytes, sniffAudioMimeOrNull, type Workspace } from "@nodetool-ai/runtime";
import { Asset } from "@nodetool-ai/models";
import type { CapabilityRun } from "./types.js";

export const GAME_ASSET_NODE_RUNNER_CONTEXT_KEY = "game_asset.run_node";
export type GameAssetNodeRunner = (args: { readonly node_type: string; readonly inputs: Record<string, unknown> }) => Promise<unknown>;

export const gameGenerationResult = z.object({
  error: z.string().optional(),
  asset_uri: z.string().optional(),
  path: z.string().optional(),
  generation_id: z.string().optional(),
  mime_type: z.string().optional(),
  background: z.boolean().optional()
});
export const gameModelResult = z.object({ ref: z.object({ provider: z.string().optional(), id: z.string().optional() }).optional() });

export async function readGameAssetInput(run: CapabilityRun, gameWorkspace: Workspace, input: string): Promise<Uint8Array | null> {
  if (input.startsWith("asset://")) {
    const id = input.slice("asset://".length).replace(/\.(png|jpe?g|webp|wav|ogg|mp3|ttf|otf|glb|gltf|json)$/i, "");
    const owner = run.context.userId;
    const asset = owner ? await Asset.find(owner, id) : null;
    return asset ? (await run.context.resolveAssetBytes(`asset://${asset.id}`)).bytes : null;
  }
  if (input.includes(":") || input.startsWith("/") || input.split(/[\\/]/).includes("..")) {
    throw new Error("input_file must be an owned asset URI or workspace-relative path");
  }
  return (await run.context.workspace?.read(input)) ?? gameWorkspace.read(input);
}

const soundRef = z.object({
  type: z.literal("audio").optional(),
  uri: z.string().optional(),
  asset_id: z.string().optional(),
  data: z.union([z.instanceof(Uint8Array), z.string()]).optional()
});

export async function generateGameSoundEffect(run: CapabilityRun, args: Record<string, unknown>): Promise<
  { bytes: Uint8Array; mime_type: string } | { error: string; readonly [key: string]: unknown }
> {
  const nodeType = args["node_type"];
  if (typeof nodeType !== "string" || !nodeType.trim()) {
    return { error: "sfx generation needs node_type and params. Discover an audio generator with search_nodes and get_node_info, or import input_file." };
  }
  if (args["background"] === true || args["generation_id"] !== undefined) {
    return { error: "sfx node generation runs synchronously. Import input_file for a previously generated sound effect." };
  }
  const inputs = z.record(z.string(), z.unknown()).safeParse(args["params"] ?? {});
  if (!inputs.success) { return { error: "params must be an object containing the sound-effect node's inputs" }; }
  const hostRunner = run.context.get?.<GameAssetNodeRunner>(GAME_ASSET_NODE_RUNNER_CONTEXT_KEY);
  const nodeArgs = { node_type: nodeType, inputs: inputs.data };
  let result: unknown;
  try {
    result = typeof hostRunner === "function" ? await hostRunner(nodeArgs) : await run.invoke("run_node", nodeArgs);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'no capability is registered for "run_node"') { throw error; }
    return { error: "This host has no sound-effect node runner. Generate the sound with run_node in the app and import its asset URI through input_file." };
  }
  const envelope = z.record(z.string(), z.unknown()).safeParse(result);
  if (envelope.success && typeof envelope.data["error"] === "string") {
    return { ...envelope.data, error: envelope.data["error"] };
  }
  const candidates = envelope.success ? [envelope.data["audio"], envelope.data["output"], envelope.data["result"], result] : [result];
  for (const candidate of candidates) {
    const parsed = soundRef.safeParse(candidate);
    if (!parsed.success || !(parsed.data.uri || parsed.data.asset_id || parsed.data.data)) { continue; }
    const persisted = parsed.data.asset_id
      ? (await run.context.resolveAssetBytes(`asset://${parsed.data.asset_id}`)).bytes
      : null;
    const bytes = persisted ?? await loadMediaRefBytes({ ...parsed.data, type: "audio" }, run.context);
    if (!bytes) { continue; }
    const mime = sniffAudioMimeOrNull(bytes);
    if (!mime || !["audio/wav", "audio/ogg", "audio/mpeg"].includes(mime)) {
      return { error: "Sound-effect node output must be encoded WAV, Ogg or MP3 audio" };
    }
    return { bytes, mime_type: mime };
  }
  return { error: "Sound-effect node returned no readable audio ref in audio or output" };
}
