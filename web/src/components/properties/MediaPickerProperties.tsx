/** @jsxImportSource @emotion/react */
import React, { memo, useMemo, useRef, useState } from "react";
import isEqual from "../../utils/isEqual";
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
import {
  buildAspectOptions,
  clampToAllowed
} from "../chat/composer/videoModelOptions";
import {
  useNodeImageModelConstraints,
  useNodeVideoModelConstraints
} from "../../hooks/useMediaModelConstraints";

/**
 * Keep only the values the node's own enum can express, and fall back to the
 * whole vocabulary when that leaves nothing.
 *
 * A manifest states resolutions in the provider's spelling — `480p`,
 * `720p-SR`, `1080p`, `4k` — while these properties are declared over a fixed
 * ladder (`720p`/`1080p`/`1440p`/`4K` for video, `1K`/`2K`/`4K` for images)
 * that the runtime maps onto each provider. Offering a rung outside that
 * ladder would write a value the node cannot round-trip; offering none at all
 * would leave the user with an empty menu. So: narrow where the two agree,
 * and treat "no overlap" as "unknown", exactly as `imageModelConstraints`
 * already does for the composer.
 */
function narrowToVocabulary<T extends string>(
  declared: string[] | undefined,
  vocabulary: readonly T[]
): readonly T[] {
  const allowed = (declared ?? []).filter((r): r is T =>
    (vocabulary as readonly string[]).includes(r)
  );
  return allowed.length > 0 ? allowed : vocabulary;
}

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
  // Show a ratio the offered list actually contains. The stored value is left
  // alone until the user picks — see the note on OptionPicker below.
  const optionIds = useMemo(() => options.map((o) => o.id), [options]);
  const current = clampToAllowed(String(value ?? defaultId), optionIds);
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

export const MediaAspectRatioImageProperty = memo<PropertyProps>((props) => {
  const { aspectRatios } = useNodeImageModelConstraints(props.nodeId);
  const options = useMemo(
    () =>
      aspectRatios && aspectRatios.length > 0
        ? buildAspectOptions(aspectRatios, IMAGE_ASPECT_RATIOS)
        : IMAGE_ASPECT_RATIOS,
    [aspectRatios]
  );
  return (
    <AspectRatioPicker {...props} options={options} defaultId="1:1" />
  );
}, isEqual);
MediaAspectRatioImageProperty.displayName = "MediaAspectRatioImageProperty";

export const MediaAspectRatioVideoProperty = memo<PropertyProps>((props) => {
  const { aspectRatios } = useNodeVideoModelConstraints(props.nodeId);
  const options = useMemo(
    () =>
      aspectRatios && aspectRatios.length > 0
        ? buildAspectOptions(aspectRatios, VIDEO_ASPECT_RATIOS)
        : VIDEO_ASPECT_RATIOS,
    [aspectRatios]
  );
  return (
    <AspectRatioPicker {...props} options={options} defaultId="16:9" />
  );
}, isEqual);
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
  const optionIds = useMemo(() => options.map((o) => o.id), [options]);
  // Snap only what is shown. A node saved before its model narrowed the list —
  // 5 seconds on a Veo 3.1 that sells 4, 6 and 8 — displays the nearest
  // offered option, but its stored value is rewritten only when the user
  // picks one: silently editing a saved workflow on render would change what
  // the node runs without anyone asking for it. Until then the cost row for
  // that node stays blank, which is the honest answer — the provider
  // publishes no price for the duration the node still holds.
  const current = clampToAllowed((value ?? defaultValue) as T, optionIds);
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
  const { resolutions } = useNodeImageModelConstraints(props.nodeId);
  const options = useMemo<MediaOption<string>[]>(
    () =>
      narrowToVocabulary(resolutions, IMAGE_RESOLUTIONS).map((r) => ({
        id: r,
        label: r,
        icon: <DisplaySettingsIcon fontSize="small" />
      })),
    [resolutions]
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
  const { resolutions } = useNodeVideoModelConstraints(props.nodeId);
  const options = useMemo<MediaOption<string>[]>(
    () =>
      narrowToVocabulary(resolutions, VIDEO_RESOLUTIONS).map((r) => ({
        id: r,
        label: r,
        icon: <DisplaySettingsIcon fontSize="small" />
      })),
    [resolutions]
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
  const { durations } = useNodeVideoModelConstraints(props.nodeId);
  // Durations are not narrowed to the node's static list the way resolutions
  // are: the property is a plain integer of seconds, so every length the model
  // declares is expressible — including the 7, 9, 11, 13 and 14 second clips
  // the static ladder skips.
  const options = useMemo<MediaOption<number>[]>(
    () =>
      (durations && durations.length > 0 ? durations : VIDEO_DURATIONS).map(
        (d) => ({
          id: d,
          label: `${d} Sec`,
          icon: <AccessTimeIcon fontSize="small" />
        })
      ),
    [durations]
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
      formatLabel={(v) => `${v.toFixed(2)} · ${strengthDescription(v)}`}
    />
  );
}, isEqual);
MediaStrengthProperty.displayName = "MediaStrengthProperty";
