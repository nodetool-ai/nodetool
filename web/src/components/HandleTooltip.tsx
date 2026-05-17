import { memo, useState, useCallback, useContext, useRef, useEffect } from "react";
import { colorForType } from "../config/data_types";
import { typeToString } from "../utils/TypeHandler";
import { TypeMetadata } from "../stores/ApiTypes";
import useConnectionStore from "../stores/ConnectionStore";
import { NodeSelectionContext } from "./node/NodeSelectionContext";

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
  displayName?: string;
  className?: string;
  children: React.ReactNode;
  handlePosition: "left" | "right";
  isCollectInput?: boolean;
  enableHover?: boolean;
  variant?: "handle" | "property";
};

const HandleTooltip = memo(function HandleTooltip({
  typeMetadata,
  paramName,
  displayName,
  className = "",
  children,
  handlePosition,
  isCollectInput,
  enableHover = true,
  variant = "handle"
}: HandleTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipIdRef = useRef<string>(generateTooltipId());
  const isConnecting = useConnectionStore(
    (state) => state.connecting || state.isReconnecting
  );
  // When the owning node is selected, force every handle's tooltip visible
  // so the user can see every port's name + type at a glance without
  // hovering each one. Selection toggles cleanly via the context provider.
  const nodeSelected = useContext(NodeSelectionContext);

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

  useEffect(() => {
    if (!nodeSelected || isConnecting || !enableHover) {
      setShowTooltip(false);
      return;
    }
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    setShowTooltip(true);
  }, [nodeSelected, isConnecting, enableHover]);

  const prettyName = displayName ?? paramName
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
    showTimerRef.current = window.setTimeout(() => {
      setShowTooltip(true);
    }, ENTER_DELAY);
  }, [enableHover, isConnecting]);

  const handleMouseLeave = useCallback(() => {
    if (nodeSelected) {
      return;
    }
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    setShowTooltip(false);
  }, [nodeSelected]);

  const handleFocus = useCallback(() => {
    if (!enableHover) {
      return;
    }
    setShowTooltip(true);
  }, [enableHover]);

  const handleBlur = useCallback(() => {
    if (nodeSelected) {
      return;
    }
    setShowTooltip(false);
  }, [nodeSelected]);

  const isPropertyVariant = variant === "property";

  return (
    <div
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
      {showTooltip && (
        <div
          role="tooltip"
          id={tooltipIdRef.current}
          aria-live="polite"
          className={`handle-tooltip handle-${handlePosition} show`}
        >
          <div
            className="handle-tooltip-content"
            style={{
              backgroundColor: "transparent",
              color: isPropertyVariant
                ? "var(--palette-grey-100)"
                : colorForType(typeString)
            }}
          >
            <div className="handle-tooltip-name">
              {prettyName}
            </div>
            {isCollectInput && (
              <div className="handle-tooltip-info">
                Collect input - accepts multiple connections that are combined into a list
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export { HandleTooltip };
export default HandleTooltip;
