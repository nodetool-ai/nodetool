/**
 * A grid of preset tiles, each showing a media sample, with a trailing
 * `Add your own` tile (PRD § 6.3). Used for the storyboard and image style
 * presets, the video and image model presets, and the script voice presets.
 *
 * Presets are pictures (PRD § 6.2), so every sample goes through a
 * locator-aware primitive — `ResponsiveImage` for a still, `VideoPlayer` for a
 * clip — never a raw element with a locator in `src`.
 *
 * **One shape per grid.** A tile is either a text card or a framed card with a
 * reserved preview area above a select control, and which one it is is decided
 * for the whole grid rather than per tile. Model samples arrive one at a time,
 * long after the grid first paints (`modelSamples.ts`); when the shape was
 * per-tile, a sample landing turned a whole-card button into a title-only
 * button, moved the click target, dropped the description and shifted the row
 * under whoever was reading it. The preview area is reserved once and its
 * content changes inside it, so late media never replaces the focused element.
 *
 * The select control is always its own button beneath the preview, because a
 * clip or a voice sample carries controls of its own and no focusable control
 * may be nested inside another.
 *
 * Selection is mutually exclusive, so the tiles are radios with one tab stop
 * and arrow-key movement (`useRovingRadioGroup`), not a row of pressed
 * toggles.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import { useTheme } from "@mui/material/styles";

import {
  AudioPlayback,
  BORDER_RADIUS,
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  PADDING,
  ResponsiveImage,
  Text,
  Tooltip,
  VideoPlayer
} from "../ui_primitives";
import type { MediaLocator } from "../../hooks/useResolvedMediaUri";
import {
  SetupCardButton,
  setupCardRoleProps,
  setupCardSx,
  useRovingRadioGroup
} from "./SetupCardButton";
import type { RovingRadioItemProps } from "./SetupCardButton";

export interface PresetTile {
  id: string;
  title: string;
  /**
   * One line under the title — what the preset looks or sounds like. A tile
   * whose art has not been drawn is a text card, and a bare name says nothing
   * about the choice.
   */
  description?: string;
  /** The still sample. */
  image?: MediaLocator;
  /** A clip sample. When set it replaces the still. */
  video?: MediaLocator;
  /** An audio sample. When set it replaces the still. */
  audio?: MediaLocator;
  /**
   * Make this tile's sample. Set when the sample costs something to produce,
   * so it is made once, when someone asks for it, rather than on every render.
   */
  onPlaySample?: () => void;
  /** True while {@link PresetTile.onPlaySample} is in flight. */
  samplePending?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export interface PresetTileGridProps {
  /** Accessible name for the group, e.g. "Art style". */
  label: string;
  presets: readonly PresetTile[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  /** The trailing tile. */
  onAddOwn: () => void;
  addOwnLabel?: string;
  addOwnDisabled?: boolean;
  addOwnDisabledReason?: string;
  /**
   * Turns the trailing tile into a normal selectable option carrying this id —
   * the image flow's "No style", which is a real choice rather than something
   * to add. It is picked through `onSelect` and shows the same selected state
   * as any other tile, and `onAddOwn` is never called for it.
   */
  addOwnOptionId?: string;
  /** One line under the trailing tile's label, when it is an option. */
  addOwnDescription?: string;
  /** Sample aspect ratio, e.g. "1/1" for a voice tile. */
  aspectRatio?: string;
  minColumnWidth?: number;
  /**
   * Reserves the preview area from the first paint. Set it where the samples
   * are fetched rather than shipped, so the grid never starts as text cards
   * and turn into picture cards when the first sample lands.
   */
  reservePreview?: boolean;
}

/** What a tile puts in its preview area. */
type PreviewKind = "none" | "still" | "clip" | "audition";

const previewKind = (preset: PresetTile, broken: boolean): PreviewKind => {
  if (preset.video !== undefined) {
    return "clip";
  }
  if (preset.audio !== undefined || preset.onPlaySample !== undefined) {
    return "audition";
  }
  if (preset.image !== undefined && !broken) {
    return "still";
  }
  return "none";
};

/**
 * A preset's still sample. `showErrorFallback` is off because the grid owns
 * the failure: the primitive's broken-image glyph would replace the very thing
 * the fallback is for. A locator that fails to load leaves the reserved area
 * empty rather than collapsing it, so the row does not shift.
 */
const StillSample: React.FC<{
  preset: PresetTile;
  aspectRatio: string;
  onFailed: (id: string) => void;
}> = ({ preset, aspectRatio, onFailed }) => {
  const handleError = useCallback(() => {
    onFailed(preset.id);
  }, [onFailed, preset.id]);

  if (preset.image === undefined) {
    return null;
  }
  return (
    <ResponsiveImage
      locator={preset.image}
      alt=""
      aspectRatio={aspectRatio}
      borderRadius={BORDER_RADIUS.sm}
      showErrorFallback={false}
      onError={handleError}
    />
  );
};

/**
 * The sample half of a voice tile: a button until the audio exists, then the
 * player.
 *
 * `autoPlay` is true only for the sample this interaction asked for. Every
 * cached tile used to mount with autoplay, so returning to the step restarted
 * every voice at once. When the request moves to another tile this one is
 * stopped, so two samples never overlap; the element is reached through the
 * holder because the primitive owns it.
 */
const VoiceSample: React.FC<{ preset: PresetTile; autoPlay: boolean }> = ({
  preset,
  autoPlay
}) => {
  const holder = useRef<HTMLDivElement>(null);
  const handlePlay = useCallback(() => {
    preset.onPlaySample?.();
  }, [preset]);

  useEffect(() => {
    if (autoPlay) {
      return;
    }
    holder.current?.querySelector("audio")?.pause();
  }, [autoPlay]);

  if (preset.audio !== undefined) {
    return (
      <Box ref={holder} sx={{ width: "100%", padding: PADDING.compact }}>
        <AudioPlayback
          locator={preset.audio}
          label={`${preset.title} sample`}
          autoPlay={autoPlay}
        />
      </Box>
    );
  }
  return (
    <Box sx={{ padding: PADDING.compact }}>
      <EditorButton
        variant="outlined"
        onClick={handlePlay}
        disabled={preset.samplePending === true || preset.disabled === true}
      >
        {preset.samplePending === true
          ? "Generating sample…"
          : `Hear ${preset.title}`}
      </EditorButton>
    </Box>
  );
};

/**
 * The select control every tile carries, whatever its preview holds. It is the
 * radio: one tab stop for the grid, arrow keys between the tiles. The disabled
 * reason reaches assistive tech the way `SetupCardButton` does it — a tooltip
 * with `describeChild`, on a button that still takes pointer events.
 */
const TileSelectControl: React.FC<{
  preset: PresetTile;
  radio: RovingRadioItemProps;
  onSelect: (id: string) => void;
}> = ({ preset, radio, onSelect }) => {
  const handleSelect = useCallback(() => {
    if (preset.disabled !== true) {
      onSelect(preset.id);
    }
  }, [onSelect, preset.disabled, preset.id]);

  const button = (
    <Box
      component="button"
      type="button"
      ref={radio.ref}
      {...setupCardRoleProps("radio", radio.selected)}
      aria-disabled={preset.disabled || undefined}
      tabIndex={radio.tabIndex}
      onKeyDown={radio.onKeyDown}
      onClick={handleSelect}
      sx={{
        appearance: "none",
        background: "none",
        border: "none",
        color: "inherit",
        font: "inherit",
        textAlign: "left",
        width: "100%",
        padding: PADDING.compact,
        cursor: preset.disabled === true ? "not-allowed" : "pointer"
      }}
    >
      <FlexColumn gap={GAP.tight}>
        <Text size="small" component="span">
          {preset.title}
        </Text>
        {preset.description ? (
          <Caption component="span" color="secondary">
            {preset.description}
          </Caption>
        ) : null}
      </FlexColumn>
    </Box>
  );

  if (preset.disabled !== true || preset.disabledReason === undefined) {
    return button;
  }
  return (
    <Tooltip title={preset.disabledReason} describeChild>
      {button}
    </Tooltip>
  );
};

/**
 * One framed tile: a preview area of a fixed aspect, then the select control.
 * The frame is not itself clickable, so the player's own controls and the
 * select control stay siblings.
 */
const FramedTile: React.FC<{
  preset: PresetTile;
  kind: PreviewKind;
  aspectRatio: string;
  radio: RovingRadioItemProps;
  onSelect: (id: string) => void;
  onSampleFailed: (id: string) => void;
  auditioning: boolean;
}> = ({
  preset,
  kind,
  aspectRatio,
  radio,
  onSelect,
  onSampleFailed,
  auditioning
}) => {
  const theme = useTheme();
  return (
    <FlexColumn
      gap={GAP.none}
      sx={setupCardSx(theme, {
        selected: radio.selected,
        disabled: preset.disabled,
        padding: PADDING.none,
        interactive: false
      })}
    >
      <Box
        sx={{
          aspectRatio,
          width: "100%",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          backgroundColor: theme.vars.palette.background.default,
          "& > *": { width: "100%" }
        }}
      >
        {kind === "clip" && preset.video !== undefined ? (
          <VideoPlayer
            locator={preset.video}
            label={`${preset.title} sample`}
          />
        ) : null}
        {kind === "audition" ? (
          <VoiceSample preset={preset} autoPlay={auditioning} />
        ) : null}
        {kind === "still" ? (
          <StillSample
            preset={preset}
            aspectRatio={aspectRatio}
            onFailed={onSampleFailed}
          />
        ) : null}
      </Box>
      <TileSelectControl preset={preset} radio={radio} onSelect={onSelect} />
    </FlexColumn>
  );
};

const PresetTileGridInternal: React.FC<PresetTileGridProps> = ({
  label,
  presets,
  selectedId,
  onSelect,
  onAddOwn,
  addOwnLabel = "Add your own",
  addOwnDisabled,
  addOwnDisabledReason,
  addOwnOptionId,
  addOwnDescription,
  aspectRatio = "16/9",
  minColumnWidth = 160,
  reservePreview
}) => {
  // The stills whose art did not load. They hold no picture, so they must not
  // keep the grid in picture shape on their own.
  const [brokenIds, setBrokenIds] = useState<ReadonlySet<string>>(new Set());
  const handleSampleFailed = useCallback(
    (id: string) =>
      setBrokenIds((current) =>
        current.has(id) ? current : new Set(current).add(id)
      ),
    []
  );

  // The tile whose sample this interaction asked for. Only it autoplays.
  const [auditionedId, setAuditionedId] = useState<string | null>(null);

  const kinds = presets.map((preset) => ({
    preset,
    kind: previewKind(preset, brokenIds.has(preset.id))
  }));

  // Once the grid has shown a preview area it keeps showing one: a sample
  // arriving must not restructure the tiles under the reader, and a still that
  // fails to load must not take the preview area away from its neighbours.
  const everFramed = useRef(reservePreview === true);
  const framed =
    reservePreview === true ||
    everFramed.current ||
    kinds.some((entry) => entry.kind !== "none");
  everFramed.current = framed;

  // The trailing tile is one of the options when the flow routes a real choice
  // through it, so it joins the radio group and takes the same arrow keys.
  let addOption: PresetTile | null = null;
  if (addOwnOptionId !== undefined) {
    // Each field stays absent rather than present-and-undefined: `preset.audio
    // !== undefined` and its siblings decide what the tile draws.
    addOption = { id: addOwnOptionId, title: addOwnLabel };
    if (addOwnDescription !== undefined) {
      addOption.description = addOwnDescription;
    }
    if (addOwnDisabled !== undefined) {
      addOption.disabled = addOwnDisabled;
    }
    if (addOwnDisabledReason !== undefined) {
      addOption.disabledReason = addOwnDisabledReason;
    }
  }

  const radioItems = addOption === null ? presets : [...presets, addOption];
  const radioProps = useRovingRadioGroup(radioItems, selectedId, onSelect);

  const handleAudition = useCallback(
    (preset: PresetTile) => {
      setAuditionedId(preset.id);
      preset.onPlaySample?.();
    },
    []
  );

  const renderTile = (preset: PresetTile, kind: PreviewKind) => {
    const radio = radioProps(preset);
    if (!framed) {
      return (
        <SetupCardButton
          key={preset.id}
          {...radio}
          disabled={preset.disabled}
          disabledReason={preset.disabledReason}
          onSelect={() => onSelect(preset.id)}
          padding={PADDING.compact}
        >
          <FlexColumn gap={GAP.tight}>
            <Text size="small" component="span">
              {preset.title}
            </Text>
            {preset.description ? (
              <Caption component="span" color="secondary">
                {preset.description}
              </Caption>
            ) : null}
          </FlexColumn>
        </SetupCardButton>
      );
    }
    // The audition button reports the request to the grid, so exactly one
    // sample autoplays and the previous one stops.
    const tile =
      kind === "audition" && preset.onPlaySample !== undefined
        ? { ...preset, onPlaySample: () => handleAudition(preset) }
        : preset;
    return (
      <FramedTile
        key={preset.id}
        preset={tile}
        kind={kind}
        aspectRatio={aspectRatio}
        radio={radio}
        onSelect={onSelect}
        onSampleFailed={handleSampleFailed}
        auditioning={auditionedId === preset.id}
      />
    );
  };

  return (
    // The trailing add control is a button rather than an option, and it sits
    // in the grid so the last row is not ragged. A screen reader announces it
    // as the button it is; taking the radio group off the whole grid to keep
    // it out would cost every tile its selection semantics.
    <Box
      role="radiogroup"
      aria-label={label}
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minColumnWidth}px), 1fr))`,
        gap: GAP.comfortable
      }}
    >
      {kinds.map((entry) => renderTile(entry.preset, entry.kind))}
      {addOption !== null ? (
        renderTile(addOption, "none")
      ) : (
        <SetupCardButton
          role="navigation"
          disabled={addOwnDisabled}
          disabledReason={addOwnDisabledReason}
          onSelect={onAddOwn}
          padding={PADDING.compact}
        >
          {framed ? (
            <FlexColumn gap={GAP.tight} align="center" justify="center">
              <Box sx={{ aspectRatio, display: "grid", placeItems: "center" }}>
                <AddIcon aria-hidden />
              </Box>
              <Text size="small" component="span">
                {addOwnLabel}
              </Text>
            </FlexColumn>
          ) : (
            // Text cards are one line tall, so the trailing tile is one line
            // too — a stacked icon over a label leaves the last row ragged.
            <FlexRow gap={GAP.tight} align="center">
              <AddIcon aria-hidden fontSize="small" />
              <Text size="small" component="span">
                {addOwnLabel}
              </Text>
            </FlexRow>
          )}
        </SetupCardButton>
      )}
    </Box>
  );
};

export const PresetTileGrid = memo(PresetTileGridInternal);
PresetTileGrid.displayName = "PresetTileGrid";

export default PresetTileGrid;
