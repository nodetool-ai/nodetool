import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import { AlignmentGuide } from "../../hooks/useAlignmentGuides";

interface SmartAlignmentGuidesProps {
  /** The alignment guides to render */
  guides: AlignmentGuide[];
}

/**
 * Smart Alignment Guides Component
 *
 * Renders visual guide lines that appear when dragging nodes to help with
 * precise alignment. Shows guides for:
 * - Edge alignment (left, right, top, bottom)
 * - Center alignment (horizontal and vertical)
 *
 * The guides use theme colors for consistency and appear only during drag.
 */
const SmartAlignmentGuides: React.FC<SmartAlignmentGuidesProps> = ({
  guides
}) => {
  const theme = useTheme();

  const guideStyle = React.useMemo(
    () => ({
      position: "absolute" as const,
      pointerEvents: "none" as const,
      zIndex: 1000,
      opacity: 0.8
    }),
    []
  );

  const verticalLineStyle = React.useMemo(
    () => ({
      ...guideStyle,
      width: "1px",
      backgroundColor: theme.vars.palette.primary.main
    }),
    [guideStyle, theme.vars.palette.primary.main]
  );

  const horizontalLineStyle = React.useMemo(
    () => ({
      ...guideStyle,
      height: "1px",
      backgroundColor: theme.vars.palette.primary.main
    }),
    [guideStyle, theme.vars.palette.primary.main]
  );

  if (guides.length === 0) {
    return null;
  }

  return (
    <>
      {guides.map((guide, index) => {
        const key = `${guide.orientation}-${guide.position}-${index}`;

        if (guide.orientation === "vertical") {
          return (
            <div
              key={key}
              style={{
                ...verticalLineStyle,
                left: `${guide.position}px`,
                top: `${guide.start}px`,
                height: `${guide.end - guide.start}px`
              }}
            />
          );
        }

        return (
          <div
            key={key}
            style={{
              ...horizontalLineStyle,
              top: `${guide.position}px`,
              left: `${guide.start}px`,
              width: `${guide.end - guide.start}px`
            }}
          />
        );
      })}
    </>
  );
};

export default memo(SmartAlignmentGuides);
