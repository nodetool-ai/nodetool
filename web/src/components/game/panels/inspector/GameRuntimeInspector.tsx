import type { GameSnapshot } from "@nodetool-ai/protocol/game.js";
import { useTranslation } from "react-i18next";

import { Caption, FlexColumn, InspectorFieldRow, SPACING, Text, TYPOGRAPHY } from "../../../ui_primitives";

interface GameRuntimeInspectorProps {
  tick: number;
  entity: GameSnapshot["entities"][number] | null;
}

const VALUE_SX = { ...TYPOGRAPHY.mono.code, color: "text.primary", minWidth: 0, overflowWrap: "anywhere" } as const;

export default function GameRuntimeInspector({ tick, entity }: GameRuntimeInspectorProps) {
  const { t } = useTranslation();
  return <FlexColumn gap={SPACING.micro} role="status" aria-label={t("game.runtime.ariaLabel")}
    sx={{ px: SPACING.lg, py: SPACING.sm, borderBottom: 1, borderColor: "divider" }}>
    <Text weight={500}>{t("game.runtime.state", { tick })}</Text>
    {entity ? <>
      <InspectorFieldRow label={t("game.runtime.fields.entity")}><Caption sx={VALUE_SX}>{entity.id} · {entity.active ? t("game.runtime.active") : t("game.runtime.inactive")}</Caption></InspectorFieldRow>
      <InspectorFieldRow label={t("game.runtime.fields.position")}><Caption sx={VALUE_SX}>{entity.x.toFixed(2)}, {entity.y.toFixed(2)}</Caption></InspectorFieldRow>
      <InspectorFieldRow label={t("game.runtime.fields.velocity")}><Caption sx={VALUE_SX}>{entity.velocityX.toFixed(2)}, {entity.velocityY.toFixed(2)}</Caption></InspectorFieldRow>
      {entity.health !== undefined && <InspectorFieldRow label={t("game.runtime.fields.health")}><Caption sx={VALUE_SX}>{entity.health}</Caption></InspectorFieldRow>}
    </> : <Caption>{t("game.runtime.selectEntity")}</Caption>}
  </FlexColumn>;
}
