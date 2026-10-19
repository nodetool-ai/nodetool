import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_ENVIRONMENT_PRESET_IDS_3D, gameEnvironmentPresetId3D, getGameEnvironmentPreset3D, type GameEnvironmentPresetId3D } from "@nodetool-ai/protocol";
import { gameDocumentOp3D, type GameDocumentOp3D } from "@nodetool-ai/game-runtime";

import { Caption, EditorButton, FlexColumn, InspectorFieldRow, InspectorSelect, SPACING } from "../../../ui_primitives";

interface EnvironmentPresetEditorProps {
  readonly sceneId: string;
  readonly onOps: (ops: GameDocumentOp3D[], label?: string) => void;
}

export default function EnvironmentPresetEditor({ sceneId, onOps }: EnvironmentPresetEditorProps) {
  const { t } = useTranslation();
  const [preset, setPreset] = useState<GameEnvironmentPresetId3D>("sunny-day");
  return <FlexColumn gap={SPACING.sm}>
    <InspectorFieldRow label={t("game.environment.fields.preset")}>
      <InspectorSelect label={t("game.environment.fields.preset")} grow value={preset} options={GAME_ENVIRONMENT_PRESET_IDS_3D.map((value) => ({ value, label: t(`game.environment.presets.${value}`, { defaultValue: getGameEnvironmentPreset3D(value).label }) }))}
        onChange={(value) => setPreset(gameEnvironmentPresetId3D.parse(value))} />
    </InspectorFieldRow>
    <Caption>{t("game.environment.presetDescription")}</Caption>
    <EditorButton onClick={() => onOps([gameDocumentOp3D.parse({ op: "apply_environment_preset", scene_id: sceneId, preset })], t("game.environment.actions.applyPreset"))}>
      {t("game.environment.actions.applyPresetButton")}
    </EditorButton>
  </FlexColumn>;
}
