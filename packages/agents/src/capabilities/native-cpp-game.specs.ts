import { z } from "zod";
import { nativeGameDocument } from "@nodetool-ai/protocol/native-game";
import { nativeEditorRequest } from "@nodetool-ai/game-runtime/native";
import type { CapabilitySpec } from "./types.js";

const id = z.string().min(1).max(128);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const input = z.record(z.string(), z.json());
const runFields = {
  game_id: id, ticks: z.number().int().min(0).max(18_000).default(60),
  seed: z.number().int().min(0).max(4_294_967_295).default(1),
  inputs: z.array(input).max(18_000).default([])
};
export const nativeCppGameSchemas = {
  schema: z.object({ dimension: z.enum(["2d", "3d"]).default("3d") }),
  editor: z.object({ game_id: id, request: nativeEditorRequest }),
  create: z.object({ project_id: id, workspace_id: id, document: nativeGameDocument }),
  get: z.object({ game_id: id, view: z.enum(["outline", "document", "entity", "script", "assets"]).default("outline"),
    entity_id: id.optional(), script_id: id.optional(), source_offset: z.number().int().min(0).max(1_048_576).default(0), source_limit: z.number().int().min(1).max(65_536).default(16_384), offset: z.number().int().min(0).max(100_000).default(0), limit: z.number().int().min(1).max(100).default(50),
    fields: z.array(z.enum(["id", "name", "transform", "props", "behaviors", "body", "collider", "character", "gameplay", "visual", "parentId", "body2d", "collider2d", "sprite", "animator", "tilemap", "camera2d", "light2d"])).max(12).optional() }),
  edit: z.object({ game_id: id, expected_revision: revision, operations: z.array(z.record(z.string(), z.json())).min(1).max(1024) }),
  simulate: z.object({ ...runFields, verify_replay: z.boolean().default(true), assertions: z.array(z.object({ tick: z.number().int().min(0).max(18_000), path: z.array(z.union([z.string(), z.number().int().nonnegative()])).max(16), equals: z.json() })).max(256).default([]) }),
  capture: z.object({ ...runFields, seed: z.literal(1).default(1) }),
  bench: z.object({ ...runFields, warmup: z.number().int().min(0).max(18_000).default(30) }),
  export: z.object({ game_id: id, target: z.enum(["desktop", "web"]).default("desktop") }),
  install: z.object({ game_id: id, expected_revision: revision, asset_id: id, source_path: z.string().min(1).max(4096), kind: z.enum(["model", "image", "audio", "font", "collider", "buffer"]) })
};
function spec(name: string, description: string, schema: z.ZodType, category: "read" | "write"): CapabilitySpec {
  return { name, description, inputSchema: z.toJSONSchema(schema, { io: "input" }), zodSchema: schema, category, userMessage: () => description };
}
export const nativeCppGameSpecs: readonly CapabilitySpec[] = [
  spec("native_cpp_game_schema", "Read native-cpp-1 document and script command schemas plus runtime capabilities. This engine uses QuickJS with dimension-specific native physics, separately from legacy web games.", nativeCppGameSchemas.schema, "read"),
  spec("native_cpp_game_create", "Create a native-cpp-1 game in an owned project/workspace. The server assigns the game resource ID and initial revision.", nativeCppGameSchemas.create, "write"),
  spec("native_cpp_game_get", "Inspect an owned native-cpp-1 game. Outline is paginated. Use entity or script views for focused authoring, or document for a bounded complete source.", nativeCppGameSchemas.get, "read"),
  spec("native_cpp_game_edit", "Apply typed document operations atomically against expected_revision. Invalid source, references or stale revisions leave the durable document unchanged.", nativeCppGameSchemas.edit, "write"),
  spec("native_cpp_game_simulate", "Run bounded fixed-tick QuickJS simulation with recorded inputs and assertions. Verify midpoint snapshot replay inside the same worker session. Returns diagnostics and committed state.", nativeCppGameSchemas.simulate, "read"),
  spec("native_cpp_game_capture", "Capture the native QRhi player at the requested tick. Stages only this game's verified assets and returns an image reference and run report.", nativeCppGameSchemas.capture, "write"),
  spec("native_cpp_game_bench", "Measure bounded native simulation latency after warmup. Reports engine identity, committed tick and per-run timing statistics.", nativeCppGameSchemas.bench, "read"),
  spec("native_cpp_game_export", "Export the owned native game as a standalone desktop or static web player bundle. Returns a workspace artifact reference.", nativeCppGameSchemas.export, "write"),
  spec("native_cpp_game_editor", "Inspect or edit the owned game in the configured live native editor. Uses the same revisioned operations and local save/conflict rules. Socket paths are host-configured and never supplied by the agent.", nativeCppGameSchemas.editor, "write"),
  spec("native_cpp_game_install_asset", "Install a workspace file into an owned native game as an immutable digest-addressed asset and commit its manifest entry atomically.", nativeCppGameSchemas.install, "write")
];
