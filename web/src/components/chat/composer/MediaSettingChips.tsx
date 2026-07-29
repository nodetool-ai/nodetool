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
import React, { useState } from "react";
import AspectRatioIcon from "@mui/icons-material/CropOriginal";
import MediaControlChip from "./MediaControlChip";
import MediaOptionMenu, { type MediaOption } from "./MediaOptionMenu";
import MediaAspectRatioMenu from "./MediaAspectRatioMenu";
import type { AspectRatioOption } from "../../../stores/MediaGenerationStore";

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
