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
    description: "Read an owned built-in game and its current or specified immutable source revision.",
    inputSchema: { type: "object", properties: { game_id: id, revision }, required: ["game_id"] },
    category: "read",
    userMessage: () => "Reading game"
  },
  {
    name: "publish_native_game",
    description: "Validate and publish an edited built-in game document only if base_revision is still current. Returns a conflict on stale edits.",
    inputSchema: { type: "object", properties: { game_id: id, base_revision: revision, document: { type: "object" } }, required: ["game_id", "base_revision", "document"] },
    category: "write",
    userMessage: () => "Saving game"
  },
  {
    name: "install_native_game_asset",
    description: "Install one staged, content-addressed candidate asset binding into a game while preserving scene edits. The staged bytes must match binding.digest.",
    inputSchema: { type: "object", properties: { game_id: id, base_revision: revision, slot: { type: "string" }, candidate_workspace_id: { type: "string" }, binding: { type: "object" } }, required: ["game_id", "base_revision", "slot", "binding"] },
    category: "write",
    userMessage: () => "Installing game asset"
  },
  {
    name: "playtest_native_game",
    description: "Run a bounded deterministic headless playtest of a pinned built-in game revision and return final state and events.",
    inputSchema: { type: "object", properties: { game_id: id, revision, seed: { type: "number" }, inputs: { type: "array", items: { type: "object", properties: { pressed: { type: "array", items: { type: "string" } }, justPressed: { type: "array", items: { type: "string" } } }, required: ["pressed"] } } }, required: ["game_id", "inputs"] },
    category: "execute",
    userMessage: () => "Playtesting game"
  },
  {
    name: "build_native_game",
    description: "Build a standalone web player for an owned immutable game revision under game-builds/<game-id>/<revision> in its project workspace. Assets are verified and bundled without credentials.",
    inputSchema: { type: "object", properties: { game_id: id, revision }, required: ["game_id"] },
    category: "write",
    userMessage: () => "Building game"
  }
];
