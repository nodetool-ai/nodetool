/**
 * The `godot` module's specs — data only, no implementation.
 *
 * The registry's eager spec table imports this file and never `godot.ts`, so
 * the template package and the models package stay out of the entry graph.
 */

import type { JsonSchema } from "@nodetool-ai/runtime";
import type { CapabilitySpec } from "./types.js";

export const LIST_GAME_TEMPLATES_SCHEMA: JsonSchema = {
  type: "object",
  properties: {}
};

export const listGameTemplatesSpec: CapabilitySpec = {
  name: "list_game_templates",
  description:
    "List the Godot game templates and the asset slots each one needs. A " +
    "template is a runnable Godot project (platformer, top-down, shoot-em-up) " +
    "with placeholder art; its manifest names every slot to fill (sprite " +
    "sheets with animation frame counts, tilesets, seamless backgrounds, sound " +
    "effects, a music loop) and the scripts an agent edits after export. Fill " +
    "slots with the nodetool.game.* nodes, then call export_godot_project.",
  inputSchema: LIST_GAME_TEMPLATES_SCHEMA,
  category: "read",
  userMessage: () => "Listing game templates"
};

export const EXPORT_GODOT_PROJECT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    template: {
      type: "string",
      description: "Template id from list_game_templates."
    },
    name: {
      type: "string",
      description: "Project name, shown in Godot's window title and project list."
    },
    dir: {
      type: "string",
      description:
        "Workspace-relative directory to write the project into. Defaults to " +
        "godot/<name>. Existing files there are overwritten."
    },
    slots: {
      type: "array",
      description:
        "One entry per manifest slot: the slot id and the id of the stored " +
        "asset that fills it. The asset must carry the fill a " +
        "nodetool.game.SpriteSheet / Tileset / SeamlessImage / SoundEffect / " +
        "MusicLoop node stamped on it.",
      items: {
        type: "object",
        properties: {
          slot_id: { type: "string" },
          asset_id: { type: "string" }
        },
        required: ["slot_id", "asset_id"]
      }
    },
    verify: {
      type: "boolean",
      description:
        "Run headless Godot over the exported project (import, script check, " +
        "smoke scene) when a Godot binary and a local workspace are available. " +
        "Defaults to true. The result says when it was skipped and why."
    }
  },
  required: ["template", "name", "slots"]
};

export const exportGodotProjectSpec: CapabilitySpec = {
  name: "export_godot_project",
  description:
    "Write a Godot 4 project into the workspace from a game template and the " +
    "assets that fill its slots. Copies the template's scenes and scripts, " +
    "writes SpriteFrames and TileSet resources with atlas regions from each " +
    "asset's slot fill, copies the asset bytes to the paths the scenes " +
    "reference, and checks every resource reference resolves. With a Godot " +
    "binary present it also imports the project, checks every script, and " +
    "runs the smoke scene. Every slot in the template's manifest must be " +
    "filled and every fill must pass the slot's acceptance check; the error " +
    "names what is missing or wrong. Edit the manifest's hook scripts with " +
    "write_file / edit_file afterwards, then re-run with verify to check them.",
  inputSchema: EXPORT_GODOT_PROJECT_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Exporting Godot project ${String(params["name"] ?? "")} from the ${String(params["template"] ?? "")} template`
};

export const VERIFY_GODOT_PROJECT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    dir: {
      type: "string",
      description: "Workspace-relative directory holding the Godot project."
    }
  },
  required: ["dir"]
};

export const verifyGodotProjectSpec: CapabilitySpec = {
  name: "verify_godot_project",
  description:
    "Run headless Godot over a project directory in the workspace: import " +
    "resources, check every GDScript file for parse errors, and run " +
    "test/smoke.gd for sixty physics frames. Use after editing hook scripts. " +
    "Fails with a reason when no Godot binary is installed or the workspace " +
    "is virtual; the checks that ran report their exit code and output.",
  inputSchema: VERIFY_GODOT_PROJECT_SCHEMA,
  category: "read",
  userMessage: (params) =>
    `Verifying Godot project in ${String(params["dir"] ?? "")}`
};

export const godotSpecs: readonly CapabilitySpec[] = [
  listGameTemplatesSpec,
  exportGodotProjectSpec,
  verifyGodotProjectSpec
];
