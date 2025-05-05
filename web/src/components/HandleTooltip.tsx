/** @jsxImportSource @emotion/react */
import { memo } from "react";
import { css } from "@emotion/react";
import { colorForType, textColorForType } from "../config/data_types";
import ThemeNodetool from "./themes/ThemeNodetool";
import { typeToString, Slugify } from "../utils/TypeHandler";

// Global state for the shared tooltip
let tooltipElement: HTMLDivElement | null = null;
let currentType: string | null = null;

const tooltipStyles = css`
  position: fixed;
  transform: translateX(-100%);
  pointer-events: none;
  opacity: 0;a
  transition: opacity 150ms ease-in-out;
  z-index: 999999;

  &[data-show="true"] {
    opacity: 1;
  }
`;

function getTooltip() {
  if (!tooltipElement) {
    tooltipElement = document.createElement("div");
    tooltipElement.className = "handle-tooltip";
    tooltipElement.style.position = "fixed";
    tooltipElement.style.zIndex = "999999";
    tooltipElement.style.pointerEvents = "none";
    document.body.appendChild(tooltipElement);
  }
  return tooltipElement;
}

function updateTooltip(type: string, show: boolean, x?: number, y?: number) {
  const tooltip = getTooltip();

  if (show && type !== currentType) {
    currentType = type;
    tooltip.innerHTML = `
      <span style="
        background-color: ${colorForType(type)};
        color: ${textColorForType(type)};
        border-radius: .5em;
        font-size: ${ThemeNodetool.fontSizeSmall};
        padding: 2px 12px;
        display: block;
        visibility: visible;
        white-space: nowrap;
      ">
        ${typeToString({ type, optional: false, type_args: [] })}
      </span>
    `;
  }

  tooltip.style.opacity = show ? "1" : "0";
  if (x !== undefined && y !== undefined) {
    tooltip.style.left = `${x - 20}px`;
    tooltip.style.top = `${y + 2}px`;
    tooltip.style.transform = "translateX(-100%)";
  }
}

type HandleTooltipProps = {
  type: string;
  className?: string;
  children: React.ReactNode;
};

const HandleTooltip = memo(function HandleTooltip({
  type,
  className = "",
  children
}: HandleTooltipProps) {
  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    updateTooltip(type, true, rect.left, rect.top);
  };

  const handleMouseLeave = () => {
    updateTooltip(type, false);
  };

  return (
    <div
      className="handle-tooltip-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  );
});

export default HandleTooltip;
