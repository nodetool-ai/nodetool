/**
 * ShotMovementField
 *
 * A shot's camera movement: free text plus a button that opens the camera
 * preset picker. Picking presets writes `camera.preset_ids` and the English
 * preset names into `camera.movement`, so the screenplay camera pass and the
 * CSV export keep reading one string. Typing replaces the movement with the
 * typed words and detaches the presets, because a render compiles the presets
 * in place of `movement` and would otherwise ignore what was typed.
 *
 * A board saved before presets has only `movement`. The card whose alias
 * matches it shows as selected here, and nothing is written until the creator
 * edits the field.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CloseIcon from "@mui/icons-material/CloseOutlined";

import {
  Chip,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  PresetPicker,
  SPACING,
  TextInput
} from "../ui_primitives";
import { modelFamily } from "@nodetool-ai/presets";
import type { ShotRenderMode } from "@nodetool-ai/protocol";

import { presetText } from "../../utils/presetText";
import { presetCatalog } from "../../lib/presets/catalog";
import type { ShotDraft } from "./shotDraft";
import {
  draftPatchForPresets,
  presetModeForRender,
  selectedPresetIds
} from "./shotCameraPresets";

interface ShotMovementFieldProps {
  label: string;
  draft: ShotDraft;
  onChange: (draft: ShotDraft) => void;
  /** The board's video model, so the picker marks the family that has tuned wording. */
  videoModelId?: string | null;
  /** Limits the picker to presets that run in the shot's render mode. */
  renderMode?: ShotRenderMode;
  readOnly?: boolean;
  boardLookIds?: readonly string[];
}

const ShotMovementFieldInner: React.FC<ShotMovementFieldProps> = ({
  label,
  draft,
  onChange,
  videoModelId,
  renderMode,
  readOnly,
  boardLookIds = []
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => selectedPresetIds(draft, presetCatalog),
    [draft]
  );
  const filter = useMemo(
    () => ({
      kind: "camera" as const,
      ...(renderMode && { mode: presetModeForRender(renderMode) })
    }),
    [renderMode]
  );
  const activeFamily = useMemo(
    () => (videoModelId ? modelFamily(videoModelId) : null),
    [videoModelId]
  );

  const handleText = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...draft, movement: event.target.value, presetIds: [] }),
    [draft, onChange]
  );
  const handlePresets = useCallback(
    (ids: string[]) =>
      onChange({ ...draft, ...draftPatchForPresets(ids, presetCatalog) }),
    [draft, onChange]
  );
  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <FlexColumn gap={SPACING.xs}>
      <TextInput
        compact
        size="small"
        label={label}
        disabled={readOnly}
        value={draft.movement}
        onChange={handleText}
      />
      <FlexRow wrap align="center" gap={SPACING.xs}>
        {selected.map((id) => {
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
                  : () => handlePresets(selected.filter((item) => item !== id))
              }
              deleteIcon={
                <CloseIcon
                  titleAccess={t("shot_camera_field.remove", { name })}
                />
              }
            />
          );
        })}
        <EditorButton size="small" disabled={readOnly} onClick={handleOpen}>
          {t("shot_camera_field.browse")}
        </EditorButton>
      </FlexRow>
      <Dialog
        open={open}
        onClose={handleClose}
        title={t("shot_camera_field.title")}
        minWidth="min(900px, 90vw)"
        actions={
          <EditorButton variant="contained" onClick={handleClose}>
            {t("shot_camera_field.done")}
          </EditorButton>
        }
      >
        <PresetPicker
          presets={presetCatalog.presets}
          companionIds={
            draft.lookPresetIds.length ? draft.lookPresetIds : boardLookIds
          }
          value={selected}
          onChange={handlePresets}
          filter={filter}
          activeFamily={activeFamily}
        />
      </Dialog>
    </FlexColumn>
  );
};

export const ShotMovementField = memo(ShotMovementFieldInner);
ShotMovementField.displayName = "ShotMovementField";

export default ShotMovementField;
