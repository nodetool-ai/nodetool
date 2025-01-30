/** @jsxImportSource @emotion/react */
import { memo, useState } from "react";
import { css } from "@emotion/react";
import {
  useFloating,
  offset,
  autoUpdate,
  FloatingPortal
} from "@floating-ui/react";
import { colorForType, textColorForType } from "../config/data_types";
import ThemeNodetool from "./themes/ThemeNodetool";
import { typeToString, Slugify } from "../utils/TypeHandler";
import React from "react";

// Shared tooltip content component to reduce rerenders
const TooltipContent = memo(({ type }: { type: string }) => (
  <span
    style={{
      backgroundColor: colorForType(type),
      color: textColorForType(type),
      borderRadius: ".5em",
      fontSize: ThemeNodetool.fontSizeSmall,
      padding: "4px 8px",
      display: "block",
      whiteSpace: "nowrap",
      transform: "translateX(-20px) translateY(50%)"
    }}
  >
    {typeToString({
      type,
      optional: false,
      type_args: []
    })}
  </span>
));

type HandleTooltipProps = {
  type: string;
  className?: string;
  placement?: "left" | "right";
  children: React.ReactNode;
};

const tooltipStyles = css`
  pointer-events: none;
  &:hover {
    opacity: 1;
  }
  transition: opacity 0.2s;
`;

const HandleTooltip = memo(
  ({
    type,
    className = "",
    placement = "left",
    children
  }: HandleTooltipProps) => {
    const [isHovered, setIsHovered] = useState(false);

    const { refs, floatingStyles } = useFloating({
      placement,
      whileElementsMounted: autoUpdate,
      strategy: "fixed",
      middleware: [
        offset({
          mainAxis: 0,
          crossAxis: 0
        })
      ]
    });

    const child = React.Children.only(children);
    const enhancedChild = React.cloneElement(child as React.ReactElement, {
      ref: refs.setReference,
      onMouseEnter: () => setIsHovered(true),
      onMouseLeave: () => setIsHovered(false)
    });

    return (
      <>
        {enhancedChild}
        {isHovered && (
          <FloatingPortal>
            <div
              ref={refs.setFloating}
              css={tooltipStyles}
              style={{
                ...floatingStyles,
                transformOrigin: "left bottom",
                top: "-15px",
                left: "6px",
                position: "fixed",
                zIndex: 999999
              }}
              className={`tooltip-handle ${className} ${Slugify(type)}`}
            >
              <TooltipContent type={type} />
            </div>
          </FloatingPortal>
        )}
      </>
    );
  }
);

export default HandleTooltip;
