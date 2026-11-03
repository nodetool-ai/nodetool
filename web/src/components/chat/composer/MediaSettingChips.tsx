/**
 * MediaSettingChips — self-contained chip + popover pairs for media
 * generation settings (resolution, duration, strength, steps, aspect ratio).
 *
 * The media composer and the editor prompt bars wire `MediaControlChip` to
 * `MediaOptionMenu` / `MediaAspectRatioMenu` by hand, each with its own
 * anchor state. These wrappers bundle chip + anchor + menu so the inspector
 * prompt panels (sketch `DirectGenLayerPanel`, timeline `DirectGenClipPanel`)
 * present the same controls as the header generation panel without repeating
 * the plumbing.
 */
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import AspectRatioIcon from "@mui/icons-material/CropOriginal";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { Preset } from "@nodetool-ai/presets";
import {
  Caption,
  Dialog,
  FlexColumn,
  PresetPicker,
  SPACING
} from "../../ui_primitives";
import MediaControlChip from "./MediaControlChip";
import MediaOptionMenu, { type MediaOption } from "./MediaOptionMenu";
import MediaAspectRatioMenu from "./MediaAspectRatioMenu";
import {
  PRESET_MODE_FOR_MEDIA_MODE,
  type AspectRatioOption,
  type PresetMediaMode
} from "../../../stores/MediaGenerationStore";
import { MEDIA_PRESETS, presetCatalog } from "../../../lib/presets/catalog";
import {
  presetFamilyOf,
  presetsWithoutFragment
} from "../../../utils/presetFamily";
import { presetText } from "../../../utils/presetText";

interface MediaOptionChipProps<T extends string | number> {
  icon?: React.ReactNode;
  /** Chip label; defaults to the selected option's label. */
  label?: React.ReactNode;
  /** Popover header (e.g. "Resolution"). */
  header: string;
  value: T;
  options: MediaOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}

export function MediaOptionChip<T extends string | number>({
  icon,
  label,
  header,
  value,
  options,
  onChange,
  disabled,
  size = "sm"
}: MediaOptionChipProps<T>) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const selected = options.find((o) => o.id === value);
  return (
    <>
      <MediaControlChip
        icon={icon}
        label={label ?? selected?.label ?? String(value)}
        active={!!anchor}
        onClick={(e) => setAnchor(e.currentTarget)}
        showChevron={false}
        disabled={disabled}
        size={size}
      />
      <MediaOptionMenu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        header={header}
        value={value}
        options={options}
        onChange={onChange}
      />
    </>
  );
}

interface MediaAspectChipProps {
  value: string;
  options: AspectRatioOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}

export function MediaAspectChip({
  value,
  options,
  onChange,
  disabled,
  size = "sm"
}: MediaAspectChipProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <MediaControlChip
        icon={<AspectRatioIcon fontSize="small" />}
        label={value}
        active={!!anchor}
        onClick={(e) => setAnchor(e.currentTarget)}
        showChevron={false}
        disabled={disabled}
        size={size}
      />
      <MediaAspectRatioMenu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        value={value}
        options={options}
        onChange={onChange}
      />
    </>
  );
}

interface MediaPresetChipProps {
  /** The chat mode whose presets the chip edits. */
  mode: PresetMediaMode;
  /** The model the request will run on. Its family decides the warning. */
  model: { id: string; provider?: string | null } | null;
  /** Selected preset ids in stack order. */
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}

/**
 * Preset chip: shows the stacked presets and opens the picker, scoped to the
 * presets that list the current mode. The chip turns to a warning when the
 * chosen model's family has no fragment for a selected preset, because the
 * server then compiles that preset with its default wording.
 */
export function MediaPresetChip({
  mode,
  model,
  value,
  onChange,
  disabled,
  size = "sm"
}: MediaPresetChipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const presetMode = PRESET_MODE_FOR_MEDIA_MODE[mode];
  const filter = useMemo(() => ({ mode: presetMode }), [presetMode]);
  const selected = useMemo(
    () =>
      value
        .map((id) => presetCatalog.getPreset(id))
        .filter((preset): preset is Preset => preset !== undefined),
    [value]
  );
  const names = selected.map((preset) => presetText(t, preset).name);
  const fallbackNames = presetsWithoutFragment(selected, model, presetMode).map(
    (preset) => presetText(t, preset).name
  );
  const warning = fallbackNames.length > 0;
  const activeFamily = presetFamilyOf(model, presetMode);
  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);
  const warningText = t("preset_chip.fallbackWarning", {
    names: fallbackNames.join(", ")
  });

  return (
    <>
      <MediaControlChip
        icon={
          warning ? (
            <WarningAmberIcon fontSize="small" />
          ) : (
            <AutoAwesomeIcon fontSize="small" />
          )
        }
        label={names.length > 0 ? names.join(", ") : t("preset_chip.label")}
        title={warning ? warningText : t("preset_chip.title")}
        active={open}
        warning={warning}
        onClick={handleOpen}
        showChevron={false}
        disabled={disabled}
        size={size}
        truncate
      />
      <Dialog
        open={open}
        onClose={handleClose}
        title={t("preset_chip.dialogTitle")}
        maxWidth="md"
        fullWidth
      >
        <FlexColumn gap={SPACING.lg}>
          {warning && (
            <Caption color="warning">
              {warningText}
            </Caption>
          )}
          <PresetPicker
            presets={MEDIA_PRESETS}
            value={value}
            onChange={onChange}
            filter={filter}
            activeFamily={activeFamily}
          />
        </FlexColumn>
      </Dialog>
    </>
  );
}
