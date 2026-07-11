import React, { memo, useState, useCallback, useContext, useMemo, useRef, useEffect, isValidElement, cloneElement, type ReactElement } from "react";
import { colorForType } from "../config/data_types";
import { typeToString } from "../utils/TypeHandler";
import { TypeMetadata } from "../stores/ApiTypes";
import useConnectionStore from "../stores/ConnectionStore";
import { NodeSelectionContext } from "./node/NodeSelectionContext";

const ENTER_DELAY = 1200;

let tooltipIdCounter = 0;
const generateTooltipId = () => `handle-tooltip-${tooltipIdCounter++}`;

/**
 * Checks if a TypeMetadata is a union of float and int (in any order)
 * and returns "number" if so, otherwise returns the formatted type string.
 */
const formatTypeString = (typeMetadata: TypeMetadata): string => {
  if (
    typeMetadata.type === "union" &&
    typeMetadata.type_args &&
    typeMetadata.type_args.length === 2
  ) {
    const typeArgs = typeMetadata.type_args;
    const types = [typeArgs[0].type, typeArgs[1].type].sort();

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
  enableHover = true,
  variant = "handle"
}: HandleTooltipProps) {
  const isPropertyVariant = variant === "property";
  const [showTooltip, setShowTooltip] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const tooltipIdRef = useRef<string>(generateTooltipId());
  const isConnecting = useConnectionStore(
    (state) => state.connecting || state.isReconnecting
  );
  // When the owning node is selected, force every handle's tooltip visible
  // so the user can see every port's name + type at a glance without
  // hovering each one. Selection toggles cleanly via the context provider.
  const nodeSelected = useContext(NodeSelectionContext);

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
    // Tear down hover/selection-driven tooltip when a drag starts; the
    // connect-time name label is rendered separately below.
    setShowTooltip(false);
    setIsHovering(false);
  }, [isConnecting]);

  useEffect(() => {
    if (isPropertyVariant || !nodeSelected || isConnecting || !enableHover) {
      if (!isPropertyVariant) {
        setShowTooltip(false);
      }
      return;
    }
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    setShowTooltip(true);
  }, [nodeSelected, isConnecting, enableHover, isPropertyVariant]);

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
      setIsHovering(true);
    }, ENTER_DELAY);
  }, [enableHover, isConnecting]);

  const handleMouseLeave = useCallback(() => {
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    setIsHovering(false);
    if (!isPropertyVariant && nodeSelected) {
      return;
    }
    setShowTooltip(false);
  }, [nodeSelected, isPropertyVariant]);

  const handleFocus = useCallback(() => {
    if (!enableHover) {
      return;
    }
    setShowTooltip(true);
    setIsHovering(true);
  }, [enableHover]);

  const handleBlur = useCallback(() => {
    setIsHovering(false);
    if (!isPropertyVariant && nodeSelected) {
      return;
    }
    setShowTooltip(false);
  }, [nodeSelected, isPropertyVariant]);

  // While a connection is being dragged, expose the names of every handle
  // that ReactFlow marked as compatible (the same `is-connectable` class
  // used for the scale-up effect). Caller passes className as either
  // "is-connectable" or "not-connectable".
  const isCompatibleForConnect = useMemo(
    () => className.split(/\s+/).includes("is-connectable"),
    [className]
  );
  const connectingShow = !isPropertyVariant && isConnecting && isCompatibleForConnect;
  const propertyHoverShow = isPropertyVariant && isHovering && showTooltip;
  const handleShow = !isPropertyVariant && (showTooltip || connectingShow);
  const effectiveShow = isPropertyVariant ? propertyHoverShow : handleShow;

  const tooltipColor = isPropertyVariant
    ? "var(--palette-grey-100)"
    : colorForType(typeString);

  type InteractiveChildProps = {
    onMouseEnter?: (event: React.MouseEvent<HTMLElement>) => void;
    onMouseLeave?: (event: React.MouseEvent<HTMLElement>) => void;
    onFocus?: (event: React.FocusEvent<HTMLElement>) => void;
    onBlur?: (event: React.FocusEvent<HTMLElement>) => void;
  };

  const interactiveChildren = useMemo(() => {
    if (isPropertyVariant || !isValidElement(children)) {
      return children;
    }

    const child = children as ReactElement<InteractiveChildProps>;
    return cloneElement(child, {
      onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
        child.props.onMouseEnter?.(event);
        handleMouseEnter();
      },
      onMouseLeave: (event: React.MouseEvent<HTMLElement>) => {
        child.props.onMouseLeave?.(event);
        handleMouseLeave();
      }
    });
  }, [children, handleMouseEnter, handleMouseLeave, isPropertyVariant]);

  return (
    <div
      className={`handle-tooltip-wrapper${isPropertyVariant ? " property-tooltip-wrapper" : ""} ${className}`.trim()}
      onMouseEnter={isPropertyVariant ? handleMouseEnter : undefined}
      onMouseLeave={isPropertyVariant ? handleMouseLeave : undefined}
      onFocus={handleFocus}
      onBlur={handleBlur}
      tabIndex={isPropertyVariant ? -1 : 0}
      role={isPropertyVariant ? undefined : "button"}
      aria-label={isPropertyVariant ? undefined : `${prettyName} (${displayType})`}
      aria-describedby={effectiveShow ? tooltipIdRef.current : undefined}
    >
      {interactiveChildren}
      {handleShow && (
        <div
          role="tooltip"
          id={tooltipIdRef.current}
          aria-live="polite"
          className={`handle-tooltip handle-${handlePosition} show${
            connectingShow ? " connecting" : ""
          }`}
        >
          <div
            className="handle-tooltip-content"
            style={{
              backgroundColor: "transparent",
              color: tooltipColor
            }}
          >
            <div className="handle-tooltip-label">
              <div className="handle-tooltip-name">
                {prettyName}
              </div>
              {isHovering && (
                <div className="handle-tooltip-details">
                  <div className="handle-tooltip-type">
                    {displayType}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {propertyHoverShow && (
        <div
          role="tooltip"
          id={tooltipIdRef.current}
          aria-live="polite"
          className="property-handle-tooltip"
          style={{ color: tooltipColor }}
        >
          <div className="property-handle-tooltip-type">{displayType}</div>
        </div>
      )}
    </div>
  );
});

export { HandleTooltip };
export default HandleTooltip;
