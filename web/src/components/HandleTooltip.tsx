import { memo, useState, useCallback, useRef, useEffect } from "react";
import { colorForType, textColorForType } from "../config/data_types";
import { typeToString } from "../utils/TypeHandler";
import { createPortal } from "react-dom";
import { getMousePosition } from "../utils/MousePosition";
import { TypeMetadata } from "../stores/ApiTypes";
import useConnectionStore from "../stores/ConnectionStore";

const LEFT_OFFSET_X = -32;
const RIGHT_OFFSET_X = 32;
const Y_OFFSET = -20;
const ENTER_DELAY = 1200;

// Generate a unique ID for tooltip descriptions
let tooltipIdCounter = 0;
const generateTooltipId = () => `handle-tooltip-${tooltipIdCounter++}`;

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
  enableHover?: boolean;
  variant?: "handle" | "property";
};

const HandleTooltip = memo(function HandleTooltip({
  typeMetadata,
  paramName,
  className = "",
  children,
  handlePosition,
  isStreamingOutput,
  isCollectInput,
  enableHover = true,
  variant = "handle"
}: HandleTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const tooltipIdRef = useRef<string>(generateTooltipId());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isConnecting = useConnectionStore(
    (state) => state.connecting || state.isReconnecting
  );

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

  useEffect(() => {
    if (!isConnecting) {
      return;
    }
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    setShowTooltip(false);
  }, [isConnecting]);

  const prettyName = paramName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  
  const displayType = formatTypeString(typeMetadata);
  // Use "float" for color when displaying "number" (float|int union), 
  // since both float and int use the same color
  const typeString = displayType === "number" ? "float" : typeMetadata.type;

  const handleMouseEnter = useCallback(() => {
    if (!enableHover || isConnecting) {
      return;
    }
    const position = getMousePosition();
    // Start a timer; show tooltip only after ENTER_DELAY ms
    showTimerRef.current = window.setTimeout(() => {
      setTooltipPosition(position);
      setShowTooltip(true);
    }, ENTER_DELAY);
  }, [enableHover, isConnecting]);

  const handleMouseLeave = useCallback(() => {
    // Cancel pending timer if it exists
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    setShowTooltip(false);
  }, []);

  const handleFocus = useCallback(() => {
    if (!enableHover) {
      return;
    }
    // Show tooltip immediately on keyboard focus for accessibility
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setTooltipPosition({
        x: rect.left + rect.width / 2,
        y: rect.top
      });
    }
    setShowTooltip(true);
  }, [enableHover]);

  const handleBlur = useCallback(() => {
    setShowTooltip(false);
  }, []);

  const isPropertyVariant = variant === "property";

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
          backgroundColor: isPropertyVariant
            ? "var(--palette-grey-800)"
            : colorForType(typeString),
          color: isPropertyVariant
            ? "var(--palette-grey-100)"
            : textColorForType(typeString)
        }}
      >
        <div className="handle-tooltip-name">
          {prettyName}
        </div>
        <div className="handle-tooltip-type">
          {displayType}
        </div>
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
        ref={wrapperRef}
        className={`handle-tooltip-wrapper ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        tabIndex={0}
        role="button"
        aria-label={`${prettyName} (${displayType})`}
        aria-describedby={showTooltip ? tooltipIdRef.current : undefined}
      >
        {children}
      </div>
      {showTooltip && createPortal(
        <div
          role="tooltip"
          id={tooltipIdRef.current}
          aria-live="polite"
        >
          {tooltipContent}
        </div>,
        document.body
      )}
    </>
  );
});

export { HandleTooltip };
export default HandleTooltip;
