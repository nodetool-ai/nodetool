import type { GameSystemContext2D } from "./context2d.js";
import { stepInput2D } from "./input2d.js";
import { stepPhysics2D } from "./physics2d.js";
import { GameSystemPipeline, gameSystem, type GameSystem } from "./pipeline.js";
type StatefulStage = "scripts" | "contacts" | "gameplay" | "presentation";
/** 2D movement stays with behavior preparation so scripts observe the same state as before. */
export function create2DSystemPipeline<Document, Scene, Snapshot>(
  systems: Readonly<Record<StatefulStage, GameSystem<Document, Scene, GameSystemContext2D, Snapshot>>>
): GameSystemPipeline<Document, Scene, GameSystemContext2D, Snapshot | null> {
  return new GameSystemPipeline([
    gameSystem("input", stepInput2D),
    systems.scripts,
    gameSystem("physics", stepPhysics2D),
    systems.contacts,
    systems.gameplay,
    systems.presentation
  ]);
}
