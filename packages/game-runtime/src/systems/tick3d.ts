import type { GameSystemContext3D } from "./context3d.js";
import { stepInput3D } from "./input3d.js";
import { stepCharacter3D } from "./character3d.js";
import { GameSystemPipeline, gameSystem, type GameSystem } from "./pipeline.js";
type StatefulStage = "scripts" | "physics" | "contacts" | "gameplay" | "animation" | "presentation";
/** Character preparation includes platform motion and swept sensor observations before physics. */
export function create3DSystemPipeline<Document, Scene, Snapshot>(
  systems: Readonly<Record<StatefulStage, GameSystem<Document, Scene, GameSystemContext3D, Snapshot>>>
): GameSystemPipeline<Document, Scene, GameSystemContext3D, Snapshot | null> {
  return new GameSystemPipeline([
    gameSystem("input", stepInput3D),
    systems.scripts,
    gameSystem("character", stepCharacter3D),
    systems.physics,
    systems.contacts,
    systems.gameplay,
    systems.animation,
    systems.presentation
  ]);
}
