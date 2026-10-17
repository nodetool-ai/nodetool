/** @jsxImportSource @emotion/react */
/**
 * A channel strip's insert slots: one row per effect in signal order, each
 * with its bypass toggle and a button that opens the effect's device, then an
 * add button listing the built-in effects and the FableSynth FX.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import type { TrackEffect } from "@nodetool-ai/timeline";

import {
  BORDER_RADIUS,
  CONTROL,
  EditorMenu,
  MenuItemPrimitive,
  MOTION,
  SPACING,
  TYPOGRAPHY,
  Divider,
  Tooltip,
  thinScrollbarStyles
} from "../../../ui_primitives";
import { AUDIO_EFFECT_TYPES, EFFECT_LABELS } from "../../Tracks/trackEffectsConstants";
import { FABLE_FX_KINDS, FABLE_FX_LABELS, makeFableEffect } from "../fx/fableFxParams";
import { effectTitle } from "../dock/DeviceChainView";

export interface InsertSlotsProps {
  /** Channel name, for accessible labels. */
  channel: string;
  effects: readonly TrackEffect[];
  onAdd: (effect: TrackEffect["type"] | TrackEffect) => void;
  onToggle: (effectId: string, enabled: boolean) => void;
  onOpen: (effectId: string, anchor: HTMLElement) => void;
}

const NATIVE_TYPES = AUDIO_EFFECT_TYPES.filter((type) => type !== "fable");

const slotsStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(SPACING.micro),
    width: "100%",
    // On a short strip the list shrinks and scrolls; the add button stays.
    flex: "0 1 auto",
    minHeight: CONTROL.height.xs - 4,
    ".inserts__list": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(SPACING.micro),
      minHeight: 0,
      maxHeight: theme.spacing(SPACING.xxxl * 3),
      overflowY: "auto",
      ...thinScrollbarStyles(theme)
    },
    ".insert": {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing(SPACING.micro),
      height: CONTROL.height.xs - 4,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: theme.vars.palette.action.hover,
      flexShrink: 0
    },
    ".insert__power, .insert__add": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      width: CONTROL.height.xs - 4,
      height: CONTROL.height.xs - 4,
      padding: 0,
      border: "none",
      background: "transparent",
      borderRadius: BORDER_RADIUS.sm,
      color: theme.vars.palette.text.disabled,
      cursor: "pointer",
      transition: MOTION.background,
      "& svg": { fontSize: TYPOGRAPHY.sans.label.fontSize }
    },
    ".insert__power[aria-pressed='true']": {
      color: theme.vars.palette.success.main
    },
    ".insert__name": {
      flex: "1 1 auto",
      minWidth: 0,
      height: "100%",
      padding: `0 ${theme.spacing(SPACING.xs)}`,
      border: "none",
      background: "transparent",
      textAlign: "left",
      ...TYPOGRAPHY.sans.caption,
      color: theme.vars.palette.text.primary,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      cursor: "pointer",
      borderRadius: BORDER_RADIUS.sm
    },
    ".insert[data-enabled='false'] .insert__name": {
      color: theme.vars.palette.text.disabled
    },
    ".insert__add": {
      width: "100%",
      transition: `${MOTION.background}, ${MOTION.border}, color ${MOTION.fast}`,
      border: `1px dashed ${theme.vars.palette.divider}`,
      color: theme.vars.palette.text.secondary
    },
    "button:hover": {
      backgroundColor: theme.vars.palette.action.selected
    },
    ".insert__add:hover": {
      borderColor: theme.vars.palette.text.secondary,
      color: theme.vars.palette.text.primary
    },
    "button:focus-visible": {
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: -2
    }
  });

export const InsertSlots: React.FC<InsertSlotsProps> = memo(
  ({ channel, effects, onAdd, onToggle, onOpen }) => {
    const theme = useTheme();
    const styles = useMemo(() => slotsStyles(theme), [theme]);
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
    const closeMenu = useCallback(() => setMenuAnchor(null), []);
    const add = useCallback(
      (effect: TrackEffect["type"] | TrackEffect) => {
        setMenuAnchor(null);
        onAdd(effect);
      },
      [onAdd]
    );

    return (
      <div css={styles}>
        {effects.length > 0 && (
          <div className="inserts__list" role="list" aria-label={`${channel} inserts`}>
            {effects.map((effect) => {
              const title = effectTitle(effect);
              return (
                <div
                  key={effect.id}
                  className="insert"
                  role="listitem"
                  data-enabled={effect.enabled}
                >
                  <button
                    type="button"
                    className="insert__power"
                    aria-pressed={effect.enabled}
                    aria-label={`${effect.enabled ? "Bypass" : "Enable"} ${title}`}
                    onClick={() => onToggle(effect.id, !effect.enabled)}
                  >
                    <PowerSettingsNewIcon />
                  </button>
                  <Tooltip title={`Open ${title}`}>
                    <button
                      type="button"
                      className="insert__name"
                      aria-haspopup="dialog"
                      onClick={(event) => onOpen(effect.id, event.currentTarget)}
                    >
                      {title}
                    </button>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        )}
        <button
          type="button"
          className="insert__add"
          aria-label={`Add an effect to ${channel}`}
          aria-haspopup="menu"
          aria-expanded={!!menuAnchor}
          onClick={(event) => setMenuAnchor(event.currentTarget)}
        >
          <AddIcon />
        </button>
        <EditorMenu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeMenu}>
          {NATIVE_TYPES.map((type) => (
            <MenuItemPrimitive
              key={type}
              label={(EFFECT_LABELS as Record<string, string>)[type] ?? type}
              onClick={() => add(type)}
            />
          ))}
          <Divider sx={{ my: SPACING.xs }} />
          {FABLE_FX_KINDS.map((kind) => (
            <MenuItemPrimitive
              key={`fable:${kind}`}
              label={`FableSynth ${FABLE_FX_LABELS[kind]}`}
              onClick={() => add(makeFableEffect(kind))}
            />
          ))}
        </EditorMenu>
      </div>
    );
  }
);
InsertSlots.displayName = "InsertSlots";
