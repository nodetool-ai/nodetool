/** @jsxImportSource @emotion/react */
import { memo, useState, useCallback } from "react";
import { css } from "@emotion/react";
import { colorForType, textColorForType } from "../config/data_types";
import { typeToString } from "../utils/TypeHandler";
import { createPortal } from "react-dom";

const LEFT_OFFSET_X = -32;
const RIGHT_OFFSET_X = 50;
const LEFT_OFFSET_Y = -5;
const RIGHT_OFFSET_Y = -25;

const tooltipStyles = css`
  position: fixed;
  transform: translateX(-100%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 150ms ease-in-out;
  z-index: 999;
  &.show {
    opacity: 1;
  }
`;

type HandleTooltipProps = {
  type: string;
  paramName: string;
  className?: string;
  children: React.ReactNode;
  handlePosition: "left" | "right";
};

const HandleTooltip = memo(function HandleTooltip({
  type,
  paramName,
  className = "",
  children,
  handlePosition
}: HandleTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [handleWidth, setHandleWidth] = useState(0);

  const prettyName = paramName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltipPosition({ x: rect.left, y: rect.top });
    setHandleWidth(rect.width);
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
        left:
          handlePosition === "left"
            ? `${tooltipPosition.x + LEFT_OFFSET_X}px`
            : `${tooltipPosition.x + handleWidth + RIGHT_OFFSET_X}px`,
        top:
          handlePosition === "left"
            ? `${tooltipPosition.y + LEFT_OFFSET_Y}px`
            : `${tooltipPosition.y + RIGHT_OFFSET_Y}px`,
        transform:
          handlePosition === "left" ? "translateX(-100%)" : "translateX(0%)"
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colorForType(type),
          color: textColorForType(type),
          borderRadius: ".5em",
          textAlign: "center",
          padding: "0.4em",
          visibility: "visible",
          whiteSpace: "nowrap"
        }}
      >
        <div
          style={{
            fontSize: "var(--fontSizeNormal)",
            fontWeight: "bold",
            border: 0,
            textShadow: "0 0 3px rgba(0, 0, 0, 0.35)",
            backgroundColor: "rgba(0, 0, 0, 0.1)",
            borderRadius: "0.4em",
            width: "100%",
            padding: "0.25em 0.5em",
            marginBottom: "0.2em",
            lineHeight: 1.2
          }}
        >
          {prettyName}
        </div>
        <div
          style={{
            width: "fit-content",
            fontFamily: "var(--fontFamily2)",
            fontSize: "var(--fontSizeSmall)",
            backgroundColor: "var(--palette-c_gray1)",
            color: "var(--palette-c_gray6)",
            opacity: 0.8,
            border: 0,
            borderRadius: "0.4em",
            padding: "0.2em 0.5em",
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
