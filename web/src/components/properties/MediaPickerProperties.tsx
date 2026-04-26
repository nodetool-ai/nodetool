/** @jsxImportSource @emotion/react */
import React, { memo, useMemo, useRef, useState } from "react";
import isEqual from "fast-deep-equal";
import AspectRatioIcon from "@mui/icons-material/AspectRatio";
import DisplaySettingsIcon from "@mui/icons-material/DisplaySettings";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import TuneIcon from "@mui/icons-material/Tune";
import type { PropertyProps } from "../node/PropertyInput";
import PropertyLabel from "../node/PropertyLabel";
import MediaControlChip from "../chat/composer/MediaControlChip";
import MediaAspectRatioMenu from "../chat/composer/MediaAspectRatioMenu";
import MediaOptionMenu, {
  type MediaOption
} from "../chat/composer/MediaOptionMenu";
import {
  IMAGE_ASPECT_RATIOS,
  VIDEO_ASPECT_RATIOS,
  IMAGE_RESOLUTIONS,
  VIDEO_RESOLUTIONS,
  VIDEO_DURATIONS,
  IMAGE_EDIT_STRENGTHS,
  type AspectRatioOption
} from "../../stores/MediaGenerationStore";

interface AspectRatioBaseProps extends PropertyProps {
  options: AspectRatioOption[];
  defaultId: string;
}

const AspectRatioPicker: React.FC<AspectRatioBaseProps> = ({
  property,
  propertyIndex,
  value,
  onChange,
  options,
  defaultId
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const id = `media-aspect-${property.name}-${propertyIndex}`;
  const current = String(value ?? defaultId);
  return (
    <div className="media-aspect-ratio-property">
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={id}
      />
      <MediaControlChip
        ref={ref}
        icon={<AspectRatioIcon fontSize="small" />}
        label={current}
        active={open}
        onClick={() => setOpen(true)}
        showChevron={false}
      />
      <MediaAspectRatioMenu
        anchorEl={ref.current}
        open={open}
        onClose={() => setOpen(false)}
        value={current}
        options={options}
        onChange={(v) => onChange(v)}
      />
    </div>
  );
};

export const MediaAspectRatioImageProperty = memo<PropertyProps>(
  (props) => (
    <AspectRatioPicker
      {...props}
      options={IMAGE_ASPECT_RATIOS}
      defaultId="1:1"
    />
  ),
  isEqual
);
MediaAspectRatioImageProperty.displayName = "MediaAspectRatioImageProperty";

export const MediaAspectRatioVideoProperty = memo<PropertyProps>(
  (props) => (
    <AspectRatioPicker
      {...props}
      options={VIDEO_ASPECT_RATIOS}
      defaultId="16:9"
    />
  ),
  isEqual
);
MediaAspectRatioVideoProperty.displayName = "MediaAspectRatioVideoProperty";

interface OptionPickerProps<T extends string | number> extends PropertyProps {
  options: MediaOption<T>[];
  header?: string;
  icon: React.ReactNode;
  formatLabel?: (value: T) => string;
  defaultValue: T;
}

function OptionPicker<T extends string | number>({
  property,
  propertyIndex,
  value,
  onChange,
  options,
  header,
  icon,
  formatLabel,
  defaultValue
}: OptionPickerProps<T>) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const id = `media-option-${property.name}-${propertyIndex}`;
  const current = (value ?? defaultValue) as T;
  const labelText = formatLabel
    ? formatLabel(current)
    : String(current);
  return (
    <div className="media-option-property">
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={id}
      />
      <MediaControlChip
        icon={icon}
        label={labelText}
        active={!!anchor}
        onClick={(e) => setAnchor(e.currentTarget)}
        showChevron={false}
      />
      <MediaOptionMenu<T>
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        header={header}
        value={current}
        options={options}
        onChange={(v) => onChange(v as unknown)}
      />
    </div>
  );
}

export const MediaResolutionImageProperty = memo<PropertyProps>((props) => {
  const options = useMemo<MediaOption<string>[]>(
    () =>
      IMAGE_RESOLUTIONS.map((r) => ({
        id: r,
        label: r,
        icon: <DisplaySettingsIcon fontSize="small" />
      })),
    []
  );
  return (
    <OptionPicker<string>
      {...props}
      options={options}
      header="Image Resolution"
      icon={<DisplaySettingsIcon fontSize="small" />}
      defaultValue="1K"
    />
  );
}, isEqual);
MediaResolutionImageProperty.displayName = "MediaResolutionImageProperty";

export const MediaResolutionVideoProperty = memo<PropertyProps>((props) => {
  const options = useMemo<MediaOption<string>[]>(
    () =>
      VIDEO_RESOLUTIONS.map((r) => ({
        id: r,
        label: r,
        icon: <DisplaySettingsIcon fontSize="small" />
      })),
    []
  );
  return (
    <OptionPicker<string>
      {...props}
      options={options}
      header="Video Resolution"
      icon={<DisplaySettingsIcon fontSize="small" />}
      defaultValue="1080p"
    />
  );
}, isEqual);
MediaResolutionVideoProperty.displayName = "MediaResolutionVideoProperty";

export const MediaDurationProperty = memo<PropertyProps>((props) => {
  const options = useMemo<MediaOption<number>[]>(
    () =>
      VIDEO_DURATIONS.map((d) => ({
        id: d,
        label: `${d} Sec`,
        icon: <AccessTimeIcon fontSize="small" />
      })),
    []
  );
  return (
    <OptionPicker<number>
      {...props}
      options={options}
      header="Duration"
      icon={<AccessTimeIcon fontSize="small" />}
      defaultValue={4}
      formatLabel={(v) => `${v} Sec`}
    />
  );
}, isEqual);
MediaDurationProperty.displayName = "MediaDurationProperty";

const strengthDescription = (s: number): string =>
  s <= 0.35 ? "subtle" : s >= 0.85 ? "strong" : "balanced";

export const MediaStrengthProperty = memo<PropertyProps>((props) => {
  const options = useMemo<MediaOption<number>[]>(
    () =>
      IMAGE_EDIT_STRENGTHS.map((s) => ({
        id: s,
        label: s.toFixed(2),
        description: strengthDescription(s),
        icon: <TuneIcon fontSize="small" />
      })),
    []
  );
  return (
    <OptionPicker<number>
      {...props}
      options={options}
      header="Strength"
      icon={<TuneIcon fontSize="small" />}
      defaultValue={0.65}
      formatLabel={(v) => `${(v as number).toFixed(2)} · ${strengthDescription(v as number)}`}
    />
  );
}, isEqual);
MediaStrengthProperty.displayName = "MediaStrengthProperty";
