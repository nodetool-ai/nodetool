/** @jsxImportSource @emotion/react */
import { memo, useState, useCallback, useRef, useEffect } from "react";
import { css } from "@emotion/react";
import { colorForType, textColorForType } from "../config/data_types";
import { typeToString } from "../utils/TypeHandler";
import { createPortal } from "react-dom";
import { getMousePosition } from "../utils/MousePosition";
import { TypeMetadata } from "../stores/ApiTypes";

const LEFT_OFFSET_X = -32;
const RIGHT_OFFSET_X = 32;
const Y_OFFSET = -20;
const ENTER_DELAY = 600;

const tooltipStyles = css`
  position: fixed;
  pointer-events: none;
  opacity: 0;
  transition: opacity 150ms ease-in-out;
  z-index: 999;
  &.show {
    opacity: 0.85;
    transition: opacity 150ms ease-in-out 500ms;
  }
`;

/**
 * Checks if a TypeMetadata is a union of float and int (in any order)
 * and returns "number" if so, otherwise returns the formatted type string.
 */
const formatTypeString = (typeMetadata: TypeMetadata): string => {
  // Check if it's a union type with exactly 2 type args
  console.log("typeMetadata", typeMetadata);
  if (
    typeMetadata.type === "union" &&
    typeMetadata.type_args &&
    typeMetadata.type_args.length === 2
  ) {
    const typeArgs = typeMetadata.type_args;
    const types = [typeArgs[0].type, typeArgs[1].type].sort();
    
    // Check if it's a union of float and int (in any order)
    if (types[0] === "float" && types[1] === "int") {
      return "number";
    }
  }
  
  return typeToString(typeMetadata);
};

type HandleTooltipProps = {
  typeMetadata: TypeMetadata;
  paramName: string;
  className?: string;
  children: React.ReactNode;
  handlePosition: "left" | "right";
};

const HandleTooltip = memo(function HandleTooltip({
  typeMetadata,
  paramName,
  className = "",
  children,
  handlePosition
}: HandleTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  // Ref to keep track of the timer used for delaying tooltip appearance
  const showTimerRef = useRef<number | null>(null);

  // Clear any pending timers on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (showTimerRef.current !== null) {
        clearTimeout(showTimerRef.current);
      }
    };
  }, []);

  const prettyName = paramName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  
  const displayType = formatTypeString(typeMetadata);
  // Use "float" for color when displaying "number" (float|int union), 
  // since both float and int use the same color
  const typeString = displayType === "number" ? "float" : typeMetadata.type;

  const handleMouseEnter = useCallback(() => {
    const position = getMousePosition();
    // Start a timer; show tooltip only after ENTER_DELAY ms
    showTimerRef.current = window.setTimeout(() => {
      setTooltipPosition(position);
      setShowTooltip(true);
    }, ENTER_DELAY);
  }, []);

  const handleMouseLeave = useCallback(() => {
    // Cancel pending timer if it exists
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    setShowTooltip(false);
  }, []);

  const tooltipContent = (
    <div
      css={tooltipStyles}
      className={showTooltip ? "show" : ""}
      style={{
        left: `${tooltipPosition.x}px`,
        top: `${tooltipPosition.y}px`,
        transform:
          handlePosition === "left"
            ? `translate(${LEFT_OFFSET_X}px, ${Y_OFFSET}px) translateX(-100%)`
            : `translate(${RIGHT_OFFSET_X}px, ${Y_OFFSET}px)`
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colorForType(typeString),
          color: textColorForType(typeString),
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
            backgroundColor: "var(--palette-grey-800)",
            color: "var(--palette-grey-100)",
            opacity: 0.8,
            border: 0,
            borderRadius: "0.4em",
            padding: "0.2em 0.5em",
            lineHeight: 1
          }}
        >
          {displayType}
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
