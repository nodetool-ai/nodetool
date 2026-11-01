import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import {
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  PresetPicker,
  Chip,
  SPACING
} from "../ui_primitives";
import { modelFamily } from "@nodetool-ai/presets";
import type { ShotRenderMode } from "@nodetool-ai/protocol";
import { presetText } from "../../utils/presetText";
import { presetCatalog } from "../../lib/presets/catalog";
import { presetModeForRender } from "./shotCameraPresets";
import type { ShotDraft } from "./shotDraft";

interface ShotLookFieldProps {
  draft: ShotDraft;
  onChange: (draft: ShotDraft) => void;
  videoModelId?: string | null;
  renderMode: ShotRenderMode;
  readOnly?: boolean;
}

const ShotLookField: React.FC<ShotLookFieldProps> = ({
  draft,
  onChange,
  videoModelId,
  renderMode,
  readOnly
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const filter = useMemo(
    () => ({ kind: "look" as const, mode: presetModeForRender(renderMode) }),
    [renderMode]
  );
  const activeFamily = videoModelId ? modelFamily(videoModelId) : null;
  const handleChange = useCallback(
    (lookPresetIds: string[]) => onChange({ ...draft, lookPresetIds }),
    [draft, onChange]
  );
  return (
    <FlexColumn gap={SPACING.xs}>
      <Caption>{t("look_preset_field.inherit")}</Caption>
      <FlexRow wrap align="center" gap={SPACING.xs}>
        {draft.lookPresetIds.map((id) => {
          const preset = presetCatalog.getPreset(id);
          const name = preset ? presetText(t, preset).name : id;
          return (
            <Chip
              key={id}
              compact
              active
              label={name}
              onDelete={
                readOnly
                  ? undefined
                  : () =>
                      handleChange(
                        draft.lookPresetIds.filter((item) => item !== id)
                      )
              }
              deleteIcon={
                <CloseIcon
                  titleAccess={t("look_preset_field.remove", { name })}
                />
              }
            />
          );
        })}
        <EditorButton
          size="small"
          disabled={readOnly}
          onClick={() => setOpen(true)}
        >
          {t("look_preset_field.browse")}
        </EditorButton>
      </FlexRow>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("look_preset_field.title")}
        minWidth="min(900px, 90vw)"
        actions={
          <EditorButton variant="contained" onClick={() => setOpen(false)}>
            {t("look_preset_field.done")}
          </EditorButton>
        }
      >
        <PresetPicker
          presets={presetCatalog.presets}
          companionIds={draft.presetIds}
          value={draft.lookPresetIds}
          onChange={handleChange}
          filter={filter}
          activeFamily={activeFamily}
        />
      </Dialog>
    </FlexColumn>
  );
};

export default ShotLookField;
