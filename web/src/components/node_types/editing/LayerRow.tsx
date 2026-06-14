/** @jsxImportSource @emotion/react */
/**
 * LayerRow — single row in CompositorBody's layer list.
 *
 * Layout: [thumbnail] [opacity slider] [blend-mode select] [visibility]
 *          [delete]. Thumbnail is a 36×36 thumb sourced from the
 *         upstream-edge value, or a placeholder when nothing is wired.
 *
 * Pure controlled component — all callbacks take the row index so the
 * parent body (CompositorBody) owns mutation of `properties.layers`
 * and `dynamic_properties`.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ImageIcon from "@mui/icons-material/Image";

import { SelectField, StateIconButton, MOTION } from "../../ui_primitives";
import NumberInput from "../../inputs/NumberInput";

import {
  BLEND_MODES,
  type CompositorBlendMode,
  type CompositorLayerState
} from "./CompositorBody";
import {
  type ImageRefLike,
  useImageUrl
} from "./CompositorBody.helpers";

const styles = (theme: Theme) =>
  css({
    "&.layer-row": {
      display: "grid",
      gridTemplateColumns: "40px minmax(0, 1fr) 96px 28px 28px",
      alignItems: "center",
      gap: theme.spacing(1),
      minHeight: 46,
      padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`,
      borderRadius: "var(--rounded-sm)",
      background: theme.vars.palette.grey[800],
      border: `1px solid ${theme.vars.palette.divider}`,
      transition: `background ${MOTION.fast}, border-color ${MOTION.fast}`,
      "&:hover": {
        background: theme.vars.palette.action.hover
      },
      "&.is-hidden": {
        opacity: 0.5
      }
    },
    ".thumb": {
      width: 40,
      height: 40,
      borderRadius: "var(--rounded-sm)",
      background: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.divider}`,
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: theme.vars.palette.text.disabled,
      "& img": {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block"
      }
    },
    ".opacity": {
      minWidth: 0,
      "& .number-input": { width: "100%" }
    },
    ".blend": {
      minWidth: 0,
      justifySelf: "stretch"
    },
    ".blend-select": {
      marginBottom: "0 !important",
      "& .MuiSelect-select": {
        fontSize: theme.fontSizeSmall,
        padding: `${theme.spacing(0.5)} ${theme.spacing(4)} ${theme.spacing(
          0.5
        )} ${theme.spacing(0.5)}`,
        minHeight: "unset"
      },
      "& .MuiInput-root": { marginTop: 0 },
      "& .MuiSvgIcon-root": { fontSize: 16, right: 0 }
    },
    ".vis-btn, .del-btn": {
      justifySelf: "center",
      padding: theme.spacing(1),
      "& svg": {
        fontSize: 18
      }
    },
    ".del-btn:hover": {
      color: theme.vars.palette.error.main
    }
  });

export interface LayerRowProps {
  /** Positional index of this layer in CompositorBody's sorted list. */
  index: number;
  /** The `image_N` dynamic-property key this row binds to. */
  propertyKey: string;
  state: CompositorLayerState;
  image?: ImageRefLike;
  onOpacityChange: (index: number, value: number) => void;
  onOpacityComplete: () => void;
  onBlendChange: (index: number, value: CompositorBlendMode) => void;
  onToggleVisible: (index: number) => void;
  onDelete: (index: number) => void;
}

const LayerRowImpl: React.FC<LayerRowProps> = ({
  index,
  propertyKey,
  state,
  image,
  onOpacityChange,
  onOpacityComplete,
  onBlendChange,
  onToggleVisible,
  onDelete
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const thumbnail = useImageUrl(image);

  const handleOpacity = useCallback(
    (_: React.ChangeEvent<HTMLInputElement> | null, value: number) =>
      onOpacityChange(index, value),
    [index, onOpacityChange]
  );

  const handleBlend = useCallback(
    (value: string) => onBlendChange(index, value as CompositorBlendMode),
    [index, onBlendChange]
  );

  const handleToggleVisible = useCallback(
    () => onToggleVisible(index),
    [index, onToggleVisible]
  );

  const handleDelete = useCallback(() => onDelete(index), [index, onDelete]);

  return (
    <div
      css={cssStyles}
      className={`layer-row ${state.visible ? "" : "is-hidden"}`}
      data-layer-key={propertyKey}
    >
      <div className="thumb" aria-label={`Layer ${index + 1} thumbnail`}>
        {thumbnail ? (
          <img src={thumbnail} alt="" />
        ) : (
          <ImageIcon fontSize="small" />
        )}
      </div>

      <div className="opacity">
        <NumberInput
          id={`layer-opacity-${propertyKey}`}
          nodeId=""
          name="opacity"
          description="Layer opacity (0 – 1)"
          value={state.opacity}
          min={0}
          max={1}
          size="small"
          color="secondary"
          inputType="float"
          showSlider={true}
          hideLabel
          onChange={handleOpacity}
          onChangeComplete={onOpacityComplete}
        />
      </div>

      <div className="blend">
        <SelectField
          label=""
          hideLabel
          value={state.blend_mode}
          onChange={handleBlend}
          options={BLEND_MODES}
          size="small"
          variant="standard"
          className="blend-select"
        />
      </div>

      <StateIconButton
        className="vis-btn"
        icon={state.visible ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}
        onClick={handleToggleVisible}
        ariaLabel={state.visible ? "Hide layer" : "Show layer"}
        tooltip={state.visible ? "Hide layer" : "Show layer"}
      />

      <StateIconButton
        className="del-btn"
        icon={<DeleteOutlineIcon fontSize="small" />}
        onClick={handleDelete}
        ariaLabel="Delete layer"
        tooltip="Delete layer"
      />
    </div>
  );
};

export const LayerRow = memo(LayerRowImpl);
LayerRow.displayName = "LayerRow";

export default LayerRow;
