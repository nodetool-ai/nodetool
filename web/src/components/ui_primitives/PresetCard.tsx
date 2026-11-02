/**
 * PresetCard
 *
 * One generation preset as a selectable tile: a poster with a short muted loop
 * that plays while the tile is hovered or focused, the preset name, badges for
 * the model families it was written for, and an optional cost hint. A preset
 * with no preview shows its description instead of a poster.
 *
 * The card is presentational. The caller owns selection and passes the cost,
 * which usually comes from `useMediaCostEstimate` in the composer. Preview
 * URLs are public https URLs, resolved through `resolveStaticMediaUri` before
 * they reach an element. The loop never plays under `prefers-reduced-motion`.
 */

import React, { forwardRef, memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box } from "@mui/material";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import {
  MODEL_FAMILIES,
  type ModelFamily,
  type Preset
} from "@nodetool-ai/presets";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { resolveStaticMediaUri } from "../../utils/resolveMediaUri";
import { presetText } from "../../utils/presetText";
import { Caption } from "./Caption";
import { Chip } from "./Chip";
import { FlexColumn } from "./FlexColumn";
import { FlexRow } from "./FlexRow";
import { Label } from "./Label";
import { ResponsiveImage } from "./ResponsiveImage";
import { selectableTileStyles } from "./selectionStyles";
import { SPACING } from "./spacing";
import { Tooltip } from "./Tooltip";
import { TruncatedText } from "./TruncatedText";
import { VideoPlayer } from "./VideoPlayer";

const FAMILY_LABELS: Record<ModelFamily, string> = {
  kling: "Kling",
  seedance: "Seedance",
  veo: "Veo",
  wan: "Wan",
  sora: "Sora",
  minimax: "MiniMax",
  ltx: "LTX",
  "local-wan": "Local WAN",
  default: "Default"
};

/** The model families a preset carries its own wording for, in catalogue order. */
export const presetFamilies = (
  preset: Pick<Preset, "prompt" | "families">
): ModelFamily[] => {
  const named = new Set<string>(
    preset.families ?? Object.keys(preset.prompt)
  );
  return MODEL_FAMILIES.filter(
    (family) => family !== "default" && named.has(family)
  );
};

export interface PresetCardProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "onClick" | "type"
  > {
  preset: Preset;
  /** The preset is part of the current selection. */
  selected?: boolean;
  /**
   * The preset cannot be chosen. The card stays focusable and shows
   * `disabledReason` in its tooltip, so a keyboard user can read why.
   */
  disabled?: boolean;
  disabledReason?: string;
  /** The model family of the chosen model. Its badge reads as active. */
  activeFamily?: ModelFamily | null;
  /** The list price of using the preset, such as a `MediaCostEstimate`. */
  costHint?: React.ReactNode;
  onClick?: (preset: Preset) => void;
}

const PresetCardInner = forwardRef<HTMLButtonElement, PresetCardProps>(
  (
    {
      preset,
      selected = false,
      disabled = false,
      disabledReason,
      activeFamily,
      costHint,
      onClick,
      onMouseEnter,
      onMouseLeave,
      onFocus,
      onBlur,
      ...rest
    },
    ref
  ) => {
    const { t } = useTranslation();
    const reducedMotion = usePrefersReducedMotion();
    const [engaged, setEngaged] = useState(false);

    const { name, description } = presetText(t, preset);
    const families = useMemo(() => presetFamilies(preset), [preset]);
    const previewUrl = preset.preview
      ? resolveStaticMediaUri(preset.preview.url)
      : null;
    const posterUrl = preset.preview
      ? resolveStaticMediaUri(preset.preview.poster)
      : null;
    const hasPreview = Boolean(previewUrl);
    const playing = engaged && !reducedMotion && Boolean(previewUrl);

    const engage = useCallback(() => setEngaged(true), []);
    const release = useCallback(() => setEngaged(false), []);

    return (
      <Tooltip
        title={disabled && disabledReason ? disabledReason : description}
        placement="top"
      >
        <Box
          {...rest}
          ref={ref}
          component="button"
          type="button"
          aria-disabled={disabled || undefined}
          aria-pressed={rest.role === "option" ? undefined : selected}
          aria-selected={rest.role === "option" ? selected : undefined}
          aria-label={name}
          data-preset-id={preset.id}
          onClick={() => {
            if (!disabled) {
              onClick?.(preset);
            }
          }}
          onMouseEnter={(event: React.MouseEvent<HTMLButtonElement>) => {
            engage();
            onMouseEnter?.(event);
          }}
          onMouseLeave={(event: React.MouseEvent<HTMLButtonElement>) => {
            release();
            onMouseLeave?.(event);
          }}
          onFocus={(event: React.FocusEvent<HTMLButtonElement>) => {
            engage();
            onFocus?.(event);
          }}
          onBlur={(event: React.FocusEvent<HTMLButtonElement>) => {
            release();
            onBlur?.(event);
          }}
          sx={(theme) => ({
            ...selectableTileStyles(theme, { selected, disabled }),
            display: "block",
            width: "100%",
            p: 0,
            overflow: "hidden",
            textAlign: "left",
            font: "inherit",
            color: "text.primary",
            bgcolor: "background.paper",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.5 : 1
          })}
        >
          <FlexColumn>
            <Box
              sx={{
                position: "relative",
                width: "100%",
                aspectRatio: "16/9",
                overflow: "hidden",
                bgcolor: "action.hover"
              }}
            >
              {hasPreview ? (
                <>
                  {posterUrl ? (
                    <ResponsiveImage
                      src={posterUrl}
                      alt=""
                      loading="lazy"
                      aspectRatio="16/9"
                    />
                  ) : null}
                  {playing && previewUrl ? (
                    <Box sx={{ position: "absolute", inset: 0 }}>
                      <VideoPlayer
                        src={previewUrl}
                        poster={posterUrl ?? undefined}
                        label={name}
                        autoplay
                        loop
                        muted
                        bare
                      />
                    </Box>
                  ) : null}
                </>
              ) : (
                <FlexColumn
                  gap={SPACING.xs}
                  padding={SPACING.lg}
                  sx={{ height: "100%", color: "text.secondary" }}
                  data-testid="preset-card-text-only"
                >
                  <MovieOutlinedIcon fontSize="small" />
                  <TruncatedText maxLines={3} sx={{ color: "text.secondary" }}>
                    {description}
                  </TruncatedText>
                </FlexColumn>
              )}
            </Box>
            <FlexColumn gap={SPACING.xs} padding={SPACING.md}>
              <FlexRow align="center" justify="space-between" gap={SPACING.md}>
                <Label sx={{ minWidth: 0 }}>
                  <TruncatedText>{name}</TruncatedText>
                </Label>
                {costHint ? (
                  <Caption color="secondary" sx={{ flexShrink: 0 }}>
                    {costHint}
                  </Caption>
                ) : null}
              </FlexRow>
              {preset.author ? (
                <Caption color="secondary">{t("preset_picker.author", { author: preset.author })}</Caption>
              ) : null}
              {families.length > 0 ? (
                <FlexRow wrap gap={SPACING.xs}>
                  {families.map((family) => (
                    <Chip
                      key={family}
                      compact
                      label={FAMILY_LABELS[family]}
                      active={activeFamily === family}
                    />
                  ))}
                </FlexRow>
              ) : null}
            </FlexColumn>
          </FlexColumn>
        </Box>
      </Tooltip>
    );
  }
);
PresetCardInner.displayName = "PresetCard";

export const PresetCard = memo(PresetCardInner);
PresetCard.displayName = "PresetCard";
