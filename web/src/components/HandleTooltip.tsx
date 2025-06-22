/** @jsxImportSource @emotion/react */
import { memo, useState, useCallback } from "react";
import { css } from "@emotion/react";
import { colorForType, textColorForType } from "../config/data_types";
import ThemeNodetool from "./themes/ThemeNodetool";
import { typeToString } from "../utils/TypeHandler";
import { createPortal } from "react-dom";

const tooltipStyles = css`
  position: fixed;
  transform: translateX(-100%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 150ms ease-in-out;
  z-index: 999999;

  &.show {
    opacity: 1;
  }
`;

type HandleTooltipProps = {
  type: string;
  paramName: string;
  className?: string;
  children: React.ReactNode;
};

const HandleTooltip = memo(function HandleTooltip({
  type,
  paramName,
  className = "",
  children
}: HandleTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltipPosition({ x: rect.left, y: rect.top });
    setShowTooltip(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setShowTooltip(false);
  }, []);

  const tooltipContent = (
    <div
      css={tooltipStyles}
      className={showTooltip ? "show" : ""}
      style={{
        left: `${tooltipPosition.x - 20}px`,
        top: `${tooltipPosition.y + 2}px`
      }}
    >
      <div
        style={{
          backgroundColor: colorForType(type),
          color: textColorForType(type),
          borderRadius: ".5em",
          fontSize: ThemeNodetool.fontSizeSmall,
          padding: "0.4em",
          display: "block",
          visibility: "visible",
          whiteSpace: "nowrap"
        }}
      >
        <div
          style={{
            fontWeight: "bold",
            border: 0,
            padding: 0,
            lineHeight: 1
          }}
        >
          {paramName}
        </div>
        <div
          style={{
            fontSize: "0.8em",
            opacity: 0.8,
            border: 0,
            textAlign: "center",
            padding: 0,
            lineHeight: 1
          }}
        >
          {typeToString({ type, optional: false, type_args: [] })}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div
        className={`handle-tooltip-wrapper ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>
      {showTooltip && createPortal(tooltipContent, document.body)}
    </>
  );
});

export default HandleTooltip;
