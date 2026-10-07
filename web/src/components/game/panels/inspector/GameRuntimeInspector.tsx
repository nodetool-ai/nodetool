import type { GameSnapshot } from "@nodetool-ai/protocol/game.js";

import { Caption, FlexColumn, SPACING, Text } from "../../../ui_primitives";

interface GameRuntimeInspectorProps {
  tick: number;
  entity: GameSnapshot["entities"][number] | null;
}

export default function GameRuntimeInspector({ tick, entity }: GameRuntimeInspectorProps) {
  return <FlexColumn gap={SPACING.xs} role="status" aria-label="Runtime entity state">
    <Text>Runtime state · tick {tick}</Text>
    {entity ? <>
      <Caption>{entity.id} · {entity.active ? "Active" : "Inactive"}</Caption>
      <Caption>Position {entity.x.toFixed(2)}, {entity.y.toFixed(2)} · Velocity {entity.velocityX.toFixed(2)}, {entity.velocityY.toFixed(2)}</Caption>
      {entity.health !== undefined && <Caption>Health {entity.health}</Caption>}
    </> : <Caption>Select a runtime entity in the viewport</Caption>}
  </FlexColumn>;
}
