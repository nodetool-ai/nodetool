import { memo, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { colorForType, textColorForType } from "../config/data_types";
import { typeToString } from "../utils/TypeHandler";
import { createPortal } from "react-dom";
import { getMousePosition } from "../utils/MousePosition";
import { TypeMetadata } from "../stores/ApiTypes";
import OutputRenderer from "./node/OutputRenderer";

const LEFT_OFFSET_X = -32;
const RIGHT_OFFSET_X = 32;
const Y_OFFSET = -20;
const ENTER_DELAY = 600;

/**
 * Checks if a TypeMetadata is a union of float and int (in any order)
 * and returns "number" if so, otherwise returns the formatted type string.
 */
const formatTypeString = (typeMetadata: TypeMetadata): string => {
  // Check if it's a union type with exactly 2 type args
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
  isStreamingOutput?: boolean;
  isCollectInput?: boolean;
  value?: unknown;
};

const HandleTooltip = memo(function HandleTooltip({
  typeMetadata,
  paramName,
  className = "",
  children,
  handlePosition,
  isStreamingOutput,
  isCollectInput,
  value
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

  const hasRenderableValue = useMemo(() => {
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === "string" && value.trim() === "") {
      return false;
    }
    if (Array.isArray(value) && value.length === 0) {
      return false;
    }
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      return false;
    }
    return true;
  }, [value]);

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
      className={`handle-tooltip ${showTooltip ? "show" : ""}`}
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
        className="handle-tooltip-content"
        style={{
          backgroundColor: colorForType(typeString),
          color: textColorForType(typeString)
        }}
      >
        <div className="handle-tooltip-name">
          {prettyName}
        </div>
        <div className="handle-tooltip-type">
          {displayType}
        </div>
        {value !== undefined && (
          <div className="handle-tooltip-value">
            {hasRenderableValue ? (
              <OutputRenderer value={value} showTextActions={false} />
            ) : (
              <div className="handle-tooltip-value-empty">No value</div>
            )}
          </div>
        )}
        {isStreamingOutput && (
          <div className="handle-tooltip-info">
            Streaming output - emits values continuously during execution
          </div>
        )}
        {isCollectInput && (
          <div className="handle-tooltip-info">
            Collect input - accepts multiple connections that are combined into a list
          </div>
        )}
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
