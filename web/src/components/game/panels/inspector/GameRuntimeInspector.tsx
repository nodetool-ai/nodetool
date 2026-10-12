import type { GameSnapshot } from "@nodetool-ai/protocol/game.js";

import { Caption, FlexColumn, InspectorFieldRow, SPACING, Text, TYPOGRAPHY } from "../../../ui_primitives";

interface GameRuntimeInspectorProps {
  tick: number;
  entity: GameSnapshot["entities"][number] | null;
}

const VALUE_SX = { ...TYPOGRAPHY.mono.code, color: "text.primary", minWidth: 0, overflowWrap: "anywhere" } as const;

export default function GameRuntimeInspector({ tick, entity }: GameRuntimeInspectorProps) {
  return <FlexColumn gap={SPACING.micro} role="status" aria-label="Runtime entity state"
    sx={{ px: SPACING.lg, py: SPACING.sm, borderBottom: 1, borderColor: "divider" }}>
    <Text weight={500}>Runtime state · tick {tick}</Text>
    {entity ? <>
      <InspectorFieldRow label="Entity"><Caption sx={VALUE_SX}>{entity.id} · {entity.active ? "Active" : "Inactive"}</Caption></InspectorFieldRow>
      <InspectorFieldRow label="Position"><Caption sx={VALUE_SX}>{entity.x.toFixed(2)}, {entity.y.toFixed(2)}</Caption></InspectorFieldRow>
      <InspectorFieldRow label="Velocity"><Caption sx={VALUE_SX}>{entity.velocityX.toFixed(2)}, {entity.velocityY.toFixed(2)}</Caption></InspectorFieldRow>
      {entity.health !== undefined && <InspectorFieldRow label="Health"><Caption sx={VALUE_SX}>{entity.health}</Caption></InspectorFieldRow>}
    </> : <Caption>Select a runtime entity in the viewport</Caption>}
  </FlexColumn>;
}
