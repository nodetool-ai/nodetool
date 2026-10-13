import { useState } from "react";
import { GAME_ENVIRONMENT_PRESET_IDS_3D, gameEnvironmentPresetId3D, getGameEnvironmentPreset3D, type GameEnvironmentPresetId3D } from "@nodetool-ai/protocol";
import { gameDocumentOp3D, type GameDocumentOp3D } from "@nodetool-ai/game-runtime";

import { Caption, EditorButton, FlexColumn, InspectorFieldRow, InspectorSelect, SPACING } from "../../../ui_primitives";

interface EnvironmentPresetEditorProps {
  readonly sceneId: string;
  readonly onOps: (ops: GameDocumentOp3D[], label?: string) => void;
}

const OPTIONS = GAME_ENVIRONMENT_PRESET_IDS_3D.map((value) => ({ value, label: getGameEnvironmentPreset3D(value).label }));

export default function EnvironmentPresetEditor({ sceneId, onOps }: EnvironmentPresetEditorProps) {
  const [preset, setPreset] = useState<GameEnvironmentPresetId3D>("sunny-day");
  return <FlexColumn gap={SPACING.sm}>
    <InspectorFieldRow label="Environment preset">
      <InspectorSelect label="Environment preset" grow value={preset} options={OPTIONS}
        onChange={(value) => setPreset(gameEnvironmentPresetId3D.parse(value))} />
    </InspectorFieldRow>
    <Caption>Replaces the scene environment. Keeps existing lights and adds or reuses a preset sun.</Caption>
    <EditorButton onClick={() => onOps([gameDocumentOp3D.parse({ op: "apply_environment_preset", scene_id: sceneId, preset })], "Apply Environment Preset")}>
      Apply preset
    </EditorButton>
  </FlexColumn>;
}
