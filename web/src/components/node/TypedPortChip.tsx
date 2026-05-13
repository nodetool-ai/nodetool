/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo } from "react";
import isEqual from "fast-deep-equal";
import { IconForType, colorForType } from "../../config/data_types";
import { TypeMetadata } from "../../stores/ApiTypes";

const CHIP_SIZE_PX = 14;

export interface TypedPortChipProps {
  type: TypeMetadata;
  /**
   * Side of the port the chip belongs to. Used by callers to position it.
   * The component itself stays a small square — positioning is the parent's job.
   */
  side?: "left" | "right";
  /**
   * Optional override for the chip background color. Defaults to
   * `colorForType(type.type)` at low opacity.
   */
  color?: string;
  /**
   * Forwarded inline style overrides (positioning, transforms, etc.).
   */
  style?: React.CSSProperties;
  className?: string;
}

const chipStyles = (chipColor: string) =>
  css({
    width: `${CHIP_SIZE_PX}px`,
    height: `${CHIP_SIZE_PX}px`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 3,
    pointerEvents: "none",
    background: `color-mix(in srgb, ${chipColor} 22%, transparent)`,
    border: `1px solid color-mix(in srgb, ${chipColor} 55%, transparent)`,
    color: chipColor,
    boxSizing: "border-box",
    transition: "background-color 120ms ease-out, border-color 120ms ease-out",
    "& svg": {
      width: "10px",
      height: "10px",
      fill: "currentColor"
    },
    ".icon-container": {
      width: "10px !important",
      height: "10px !important"
    },
    ".icon-bg": {
      background: "transparent !important",
      width: "100%",
      height: "100%"
    }
  });

/**
 * TypedPortChip — a small (~14×14) visual indicator placed adjacent to a port
 * handle that shows the port's type via {@link IconForType}. Purely visual:
 * does not capture pointer events and does not replace the underlying handle.
 */
const TypedPortChipImpl: React.FC<TypedPortChipProps> = ({
  type,
  side,
  color,
  style,
  className
}) => {
  const chipColor = color ?? colorForType(type.type);
  const dataSide = side ?? "left";

  return (
    <span
      css={chipStyles(chipColor)}
      style={style}
      className={`typed-port-chip typed-port-chip-${dataSide}${
        className ? ` ${className}` : ""
      }`}
      aria-hidden
    >
      <IconForType
        iconName={type.type}
        showTooltip={false}
        iconSize="small"
        containerStyle={{ width: 10, height: 10 }}
        bgStyle={{ background: "transparent" }}
      />
    </span>
  );
};

export const TypedPortChip = memo(TypedPortChipImpl, isEqual);
export default TypedPortChip;
