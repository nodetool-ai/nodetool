import type { JsonSchema } from "@nodetool-ai/runtime";
import type { CapabilitySpec } from "./types.js";

const id: JsonSchema = { type: "string", description: "Full game id or exact 12-character prefix." };
const revision: JsonSchema = { type: "string", description: "Full immutable game revision." };

export const gameSpecs: readonly CapabilitySpec[] = [
  {
    name: "create_native_game",
    description: "Create a built-in game in an owned project and seed a playable top-down room. Returns its full id and revision.",
    inputSchema: { type: "object", properties: { project_id: { type: "string" }, name: { type: "string" } }, required: ["project_id", "name"] },
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
    description: "Publish the current draft when the user asks. The document argument remains for compatibility. Returns a conflict on stale revisions.",
    inputSchema: { type: "object", properties: { game_id: id, base_revision: revision, document: { type: "object" }, message: { type: "string" } }, required: ["game_id", "base_revision"] },
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
    description: "Run up to 18,000 ticks of a draft or revision with run-length inputs, assertions, contact counts, and optional captured frames. Use a win assertion to verify a completion route.",
    inputSchema: { type: "object", properties: { game_id: id, source: { type: "string", enum: ["draft", "revision"] }, revision, seed: { type: "number" }, inputs: { type: "array", items: { type: "object", properties: { pressed: { type: "array", items: { type: "string" } }, justPressed: { type: "array", items: { type: "string" } }, ticks: { type: "integer", minimum: 1 } }, required: ["pressed"] } }, assertions: { type: "array", items: { type: "object" } }, capture_ticks: { type: "array", items: { type: "integer", minimum: 0 }, maxItems: 8 } }, required: ["game_id"] },
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
    inputSchema: { type: "object", properties: { game_id: id, base_updated_at: { type: "string" }, ops: { type: "array", items: { type: "object" }, minItems: 1 } }, required: ["game_id", "ops"] },
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
    description: "Generate or import game assets, prepare images as aligned sprite sheets, edge tilesets, or grade LUTs, and bind the result to a draft. Audio is speech, music is a music model, sfx uses an explicit sound-effect node_type and params, and font imports a TTF/OTF input_file. For background media generations, resume with generation_id and the same preparation.",
    inputSchema: { type: "object", properties: { game_id: id, slot: { type: "string" }, kind: { type: "string", enum: ["image", "audio", "music", "sfx", "font"] }, prompt: { type: "string" }, input_file: { type: "string", description: "Owned asset URI or current workspace path to import. Required for font." }, node_type: { type: "string", description: "Registered sound-effect node for sfx generation." }, params: { type: "object" }, reference_slot: { type: "string" }, preparation: { type: "object" }, provider: { type: "string" }, model: { type: "string" }, background: { type: "boolean" }, generation_id: { type: "string" } }, required: ["game_id", "slot", "kind"] },
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
    description: "Search for a deterministic route to an entity prefix or a win using standard movement controls. Returns replayable run-length inputs, win tick, and level statistics. An exhausted budget is inconclusive. Custom controls and scripted goals may need a target prefix or a supplied route.",
    inputSchema: { type: "object", properties: { game_id: id, source: { type: "string", enum: ["draft", "revision"] }, revision, target_prefix: { type: "string" }, win: { type: "boolean" }, seed: { type: "integer" }, player_id: { type: "string" }, max_ticks: { type: "integer", minimum: 1, maximum: 18000 } }, required: ["game_id"] },
    category: "execute",
    userMessage: () => "Finding a game route"
  }
];
