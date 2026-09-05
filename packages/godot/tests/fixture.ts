import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  filledManifest,
  gameAssetManifest,
  type FilledManifest,
  type GameAssetManifest
} from "@nodetool-ai/protocol";

import type { GodotProjectInput } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, "../../protocol/fixtures/game-assets");

export const GOLDEN_DIR = resolve(here, "golden/platformer");

export function platformerManifest(): GameAssetManifest {
  return gameAssetManifest.parse(
    JSON.parse(readFileSync(resolve(fixtures, "platformer.manifest.json"), "utf8"))
  );
}

export function platformerFilled(): FilledManifest {
  return filledManifest.parse(
    JSON.parse(readFileSync(resolve(fixtures, "platformer.filled.json"), "utf8"))
  );
}

export function platformerInput(): GodotProjectInput {
  return {
    name: "Platformer",
    godot: "4.3",
    mainScene: "res://scenes/level_01.tscn",
    manifest: platformerManifest(),
    filled: platformerFilled()
  };
}
