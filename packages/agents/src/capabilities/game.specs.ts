import type { JsonSchema } from "@nodetool-ai/runtime";
import type { CapabilitySpec } from "./types.js";

const id: JsonSchema = { type: "string", description: "Full game id or exact 12-character prefix." };
const revision: JsonSchema = { type: "string", description: "Full immutable game revision." };

export const previewGameAuthoringSpec: CapabilitySpec = {
  name: "preview_native_game_authoring",
  description: "Hermetically rebuild retained game construction into a read-only candidate. Preparation cannot run. Returns conflicts, changed entities and dependencies, and restart policy.",
  inputSchema: { type: "object", properties: { game_id: id, program: { type: "object" }, expected_document: { type: "object" }, base_updated_at: { type: "string" }, replace_existing: { type: "boolean", description: "Explicitly authorize replacing a legacy draft when initially attaching construction." } }, required: ["game_id"] },
  category: "read", userMessage: () => "Previewing game construction"
};
export const applyGameAuthoringSpec: CapabilitySpec = {
  name: "apply_native_game_authoring",
  description: "Rebuild and apply a reviewed construction candidate only if its base draft is unchanged and its content matches preview. Rejects conflicts and does not publish or migrate a running session.",
  inputSchema: { type: "object", properties: { game_id: id, candidate: { type: "object" } }, required: ["game_id", "candidate"] },
  category: "write", userMessage: () => "Applying game construction"
};

export const BROWSE_GAME_ASSET_KINDS = ["image", "audio", "font", "model", "collider", "hdri"] as const;

export const browseGameAssetsSpec: CapabilitySpec = {
  name: "browse_native_game_assets",
  description: "List a game draft's assets with where each is used, its prefabs and scenes, staged candidates under the game's assets folder, and the generation request (kind, prompt, preparation) for each slot. Filter with query and kind. Pass digest (and slot) to get one candidate's installable binding for install_native_game_asset.",
  inputSchema: { type: "object", properties: {
    game_id: { type: "string", description: "Full game id or exact 12-character prefix." },
    query: { type: "string", description: "Case-insensitive match on slot, digest prefix or user name." },
    kind: { type: "string", enum: [...BROWSE_GAME_ASSET_KINDS] },
    digest: { type: "string", description: "A staged candidate's 64-character content digest." },
    slot: { type: "string", description: "With digest: the slot the candidate will replace. Its pivot and sampling carry over." }
  }, required: ["game_id"] },
  category: "read",
  userMessage: () => "Browsing game assets"
};

export const gameSpecs: readonly CapabilitySpec[] = [
  {
    name: "create_native_game",
    description: "Create a built-in 2D top-down room or 3D exploration blockout in an owned project. Omitted dimension keeps 2D. Returns its full id and revision.",
    inputSchema: { type: "object", properties: { project_id: { type: "string" }, name: { type: "string" }, dimension: { type: "string", enum: ["2d", "3d"] }, template: { type: "string", enum: ["topdown", "exploration"] } }, required: ["project_id", "name"] },
    category: "write",
    userMessage: () => "Creating game"
  },
  {
    name: "get_native_game",
    description: "Read an owned game's draft or immutable revision. The compact outline is the default; read one entity or the full document when needed.",
    inputSchema: { type: "object", properties: { game_id: id, source: { type: "string", enum: ["draft", "revision"] }, revision, view: { type: "string", enum: ["outline", "full", "entity"] }, entity_id: { type: "string" } }, required: ["game_id"] },
    category: "read",
    userMessage: () => "Reading game"
  },
  {
    name: "publish_native_game",
    description: "Publish the current draft when the user asks. For an explicit document, pass the paired draft_updated_at returned by get_native_game as base_updated_at. Returns a conflict on stale revisions or drafts.",
    inputSchema: { type: "object", properties: { game_id: id, base_revision: revision, base_updated_at: { type: "string" }, document: { type: "object" }, message: { type: "string" } }, required: ["game_id", "base_revision"] },
    category: "write",
    userMessage: () => "Saving game"
  },
  {
    name: "install_native_game_asset",
    description: "Install one staged asset with its source format and bind it to the mutable game draft. The staged bytes must match binding.digest.",
    inputSchema: { type: "object", properties: { game_id: id, base_revision: revision, base_updated_at: { type: "string" }, slot: { type: "string" }, candidate_workspace_id: { type: "string" }, binding: { type: "object" } }, required: ["game_id", "slot", "binding"] },
    category: "write",
    userMessage: () => "Installing game asset"
  },
  {
    name: "playtest_native_game",
    description: "Run up to 18,000 ticks of a draft or revision with run-length inputs, assertions, contact counts, and optional captured frames. Use a win assertion to verify a completion route. 3D inputs accept axes/look, and assertions support XYZ near, region, grounded and replay_matches with restore_at_tick.",
    inputSchema: { type: "object", properties: { game_id: id, source: { type: "string", enum: ["draft", "revision"] }, revision, seed: { type: "number" }, inputs: { type: "array", items: { type: "object", properties: { pressed: { type: "array", items: { type: "string" } }, justPressed: { type: "array", items: { type: "string" } }, axes: { type: "object", additionalProperties: { type: "number", minimum: -1, maximum: 1 } }, look: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] }, ticks: { type: "integer", minimum: 1 } }, required: ["pressed"] } }, assertions: { type: "array", items: { type: "object" } }, capture_ticks: { type: "array", items: { type: "integer", minimum: 0 }, maxItems: 8 }, snapshot: { type: "object" }, restore_at_tick: { type: "integer", minimum: 0, maximum: 18000 } }, required: ["game_id"] },
    category: "execute",
    userMessage: () => "Playtesting game"
  },
  {
    name: "build_native_game",
    description: "Build a standalone web player for an owned immutable game revision under game-builds/<game-id>/<revision> in its project workspace. Assets are verified and bundled without credentials.",
    inputSchema: { type: "object", properties: { game_id: id, revision }, required: ["game_id"] },
    category: "write",
    userMessage: () => "Building game"
  },
  {
    name: "edit_native_game",
    description: "Apply ordered native game edits to the mutable draft atomically. Use set_document with a complete document for a generated level. Returns validation issues with op index and path; does not publish a revision.",
    inputSchema: { type: "object", properties: { game_id: id, base_updated_at: { type: "string" }, ops: { type: "array", items: { type: "object" }, minItems: 1, description: "3D prefab operations: set_prefab {prefab_id, prefab}, remove_prefab {prefab_id}, instantiate_prefab {scene_id, prefab_id, instance_id, transform?}. Each prefab contains rootId, entities, externalAssets and externalScenes. Captured manual ownership: set_override_membership {scene_id, entity_id, path, override:{value, remove?}|null, index?}; set_authoring_membership {scene_id, entity_id, membership:suppression|detachment, present, positions?}. These preserve retained definitions and reject inconsistent ownership. Audio mixer (2D and 3D): set_audio {mixer|null} replaces document audio.mixer: buses {id: {parent?, volume, muted, lowpassHz?, reverbSend}} beside the built-in master, music, sfx, voice and ui; assetBuses {slot: bus}; ducking [{bus, when, gain, attackTicks, releaseTicks}]; snapshots {id: {buses}}; transitions [{on: {kind: trigger, event}|{kind: scene, sceneId}|{kind: win}, snapshot, fadeTicks}]. The mix is presentation only and never changes simulation. Script parameters: set_script_params {entity_id, scene_id?, index, params?, values?} on a script behavior. params replaces the declarations ({name: {type:number, default, minimum?, maximum?, integer?} | {type:boolean|color, default} | {type:enum, options, default?} | {type:entity|asset, default?, kind?} | {type:vector, dimensions:2|3, default:{x,y,z?}}}), null removes them. values merges stored values and null resets one to its default. Scripts read them on input.params. Entity params name entities of the same scene and asset params name asset slots. 2D needs schema 4. Input map: set_game {input_bindings: {actions: {action: [{kind: key, code} | {kind: keyValue, key} | {kind: mouseButton, button} | {kind: gamepadButton, button} | {kind: gamepadAxis, axis, direction, threshold?} | {kind: touchButton, label?} | {kind: touchStick, direction}]}, axes (3D): {axis: [{kind: keys, negative, positive} | {kind: gamepadAxis, axis, deadZone?, invert?} | {kind: gamepadButtons, negative, positive} | {kind: touchStick, axis, invert?}]}, look (3D): [mouse | gamepadStick | touchDrag]} | null}. Listed actions and axes use exactly those bindings; others keep defaults from their names. HUD widget tree (2D): set_ui {scene_id?, ui: {safeArea?, focusNavigation?, nodes: [node]} | null} replaces the document tree, or a scene tree drawn above it. A node is {kind, id, parent?, anchor?: {x, y} in 0..1 of the parent or HUD rectangle, pivot? (defaults to anchor), offset?: {x, y} pixels, width?, height?, visible?, opacity?} with kind panel {color?, cornerRadius?}, image {assetId}, text {text, size?, color?, align?, fontId?}, bar {source?: {kind: value}|{kind: health, entityId}, value?, max?, color?, background?, direction?}, button {action, text?, background?} pressing a declared input action, stack {direction?, gap?, padding?, align?} or grid {columns, gap?, padding?}. Children follow an earlier panel, stack or grid. Panels, images, bars and buttons need width and height. Scripts change nodes with the command {kind: ui, id, text?, value?, max?, visible?}. 3D animation graphs: set_animation_graph {graph_id, graph:{parameters:{name:{kind:float|bool|trigger, default?}}, layers:[{id, mode?:override|additive, weight?, mask?:[nodeId], initialState, states:{id:{motion:{kind:clip,clip}|{kind:blend1d,parameter,points:[{value,clip}]}|{kind:blend2d,parameterX,parameterY,points:[{x,y,clip}]}, speed?, loop?}}, transitions:[{from:stateId|*, to, conditions:[{parameter, op:gt|gte|lt|lte|eq|neq|true|false|set, value?}], exitTicks?, durationTicks?}]}]}}, remove_animation_graph {graph_id}. Attach with update_entity set animator3d.graph. Clip names are animator3d.clips aliases. Scripts drive parameters with {kind:setAnimParam, name, value}. Render culling and frame budgets (3D, presentation only): set_performance {performance|null} replaces document performance: cullLayers {name: {maxDistance}}, budgets {drawCalls?, triangles?, particles?, voices?}. update_entity set renderCulling {layer?, maxDistance?}|null hides that entity beyond the camera distance; its own maxDistance wins over its layer. Players warn in the console when a frame exceeds the draw call, triangle or voice budget. No player counts particles yet, so the particles budget does not warn. Spatial audio (2D and 3D, presentation only): update_entity set audioSource {spatial: true, minDistance?, maxDistance?, rolloff?, distanceModel?: linear|inverse|exponential, cone?: {innerAngle, outerAngle, outerGain}|null, doppler?} pans and attenuates that effect from the active camera; null returns a field to its default (1, 50, 1, inverse, no cone, 0)." } }, required: ["game_id", "ops"] },
    category: "write",
    userMessage: () => "Editing game draft"
  },
  {
    name: "capture_native_game_frame",
    description: "Render up to eight frames from a native game draft or revision and return images for visual review.",
    inputSchema: { type: "object", properties: { game_id: id, source: { type: "string", enum: ["draft", "revision"] }, revision, ticks: { type: "array", items: { type: "integer", minimum: 0 }, maxItems: 8 }, inputs: { type: "array", items: { type: "object" } }, seed: { type: "integer" }, camera: { type: "object" }, overlays: { type: "array", items: { type: "string" } }, scale: { type: "number" }, sheet: { type: "boolean" } }, required: ["game_id"] },
    category: "execute",
    userMessage: () => "Capturing game frames"
  },
  {
    name: "generate_game_asset",
    description: "Generate or import game assets, prepare images as aligned sprite sheets, edge tilesets, or grade LUTs, and bind the result to a draft. Audio is speech, music is a music model, sfx uses an explicit sound-effect node_type and params, and font imports a TTF/OTF input_file. For 3D model generation, pass an explicit provider node_type and params or an owned glTF/GLB input_file. Model import preparation accepts scale, forward (-z, +z, +x, -x), and origin (preserve, ground, centerGround). Source dependencies resolve from sibling workspace files or dependency_files mappings to owned files/assets. Collider imports use preparation.shape and accept prepared JSON or glTF/GLB geometry. 3D results are verified candidates requiring explicit install_native_game_asset. For background media generations, resume with generation_id and the same preparation.",
    inputSchema: { type: "object", properties: { game_id: id, slot: { type: "string" }, kind: { type: "string", enum: ["image", "audio", "music", "sfx", "font", "model", "collider"] }, prompt: { type: "string" }, input_file: { type: "string", description: "Owned asset URI or current workspace path to import. Required for font." }, node_type: { type: "string", description: "Registered provider node for sfx or model generation." }, params: { type: "object" }, dependency_files: { type: "object", additionalProperties: { type: "string" }, description: "Map a glTF buffer/image URI to an owned asset URI or current workspace path." }, reference_slot: { type: "string" }, preparation: { type: "object" }, provider: { type: "string" }, model: { type: "string" }, background: { type: "boolean" }, generation_id: { type: "string" }, install: { type: "boolean", description: "false stages a 2D candidate and returns its binding, frames and tiles without binding it. Default true." } }, required: ["game_id", "slot", "kind"] },
    category: "write",
    userMessage: () => "Generating game asset"
  },
  {
    name: "list_example_games",
    description: "List shipped example games, including Kindle, with controls and scene and asset counts. Filter by query before reading a benchmark.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100 } } },
    category: "read",
    userMessage: () => "Listing example games"
  },
  {
    name: "get_example_game",
    description: "Read a shipped game benchmark by exact slug. The outline is the default. Use entity view for script and feel parameters or full view for the entire document. Package asset bindings are installed through install_example_game.",
    inputSchema: { type: "object", properties: { slug: { type: "string" }, view: { type: "string", enum: ["outline", "full", "entity"] }, entity_id: { type: "string" } }, required: ["slug"] },
    category: "read",
    userMessage: () => "Reading example game"
  },
  {
    name: "install_example_game",
    description: "Copy a shipped example game and its verified media into an owned project. Returns a new game with user-owned asset bindings and a draft ready to edit.",
    inputSchema: { type: "object", properties: { project_id: { type: "string" }, slug: { type: "string" }, name: { type: "string" } }, required: ["project_id", "slug"] },
    category: "write",
    userMessage: () => "Installing example game"
  },
  {
    name: "autoplay_native_game",
    description: "Search for a deterministic route to an entity prefix or a win using standard movement controls. Returns replayable run-length inputs, win tick, and level statistics. An exhausted budget is inconclusive. Custom controls and scripted goals may need a target prefix or a supplied route. 3D returns structured unsupported; use recorded playtest inputs.",
    inputSchema: { type: "object", properties: { game_id: id, source: { type: "string", enum: ["draft", "revision"] }, revision, target_prefix: { type: "string" }, win: { type: "boolean" }, seed: { type: "integer" }, player_id: { type: "string" }, max_ticks: { type: "integer", minimum: 1, maximum: 18000 } }, required: ["game_id"] },
    category: "execute",
    userMessage: () => "Finding a game route"
  },
  previewGameAuthoringSpec,
  applyGameAuthoringSpec,
  browseGameAssetsSpec
];
