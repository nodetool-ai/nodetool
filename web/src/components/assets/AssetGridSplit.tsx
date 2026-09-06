/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useState } from "react";

import { ResizeHandle } from "../ui_primitives";

export type SplitOrientation = "horizontal" | "vertical";

interface AssetGridSplitProps {
  /** `horizontal` puts the folder pane beside the grid, `vertical` above it. */
  orientation: SplitOrientation;
  /** Starting size of the folder pane, in pixels along the split axis. */
  initialSize: number;
  minSize?: number;
  maxSize?: number;
  /** The folder pane. */
  first: React.ReactNode;
  /** The file grid — takes the remaining space. */
  second: React.ReactNode;
  separatorLabel: string;
}

const styles = (orientation: SplitOrientation) =>
  css({
    display: "flex",
    flexDirection: orientation === "horizontal" ? "row" : "column",
    width: "100%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,

    ".asset-split-pane": {
      minWidth: 0,
      minHeight: 0,
      overflow: "hidden"
    },
    ".asset-split-pane.first": {
      flexGrow: 0,
      flexShrink: 0
    },
    ".asset-split-pane.second": {
      flexGrow: 1,
      flexBasis: 0
    }
  });

/**
 * Two-pane resizable split for the asset browser: a folder pane at a fixed
 * size along the split axis, a file grid taking the rest, and a separator the
 * user can drag or move with the keyboard.
 *
 * This replaces a Dockview layout. Dockview brought a full docking framework —
 * draggable tabs, floating groups, serialized layouts — for what has only ever
 * been one immovable split, and cost 310 KB plus a stylesheet of overrides to
 * hide the parts that were never wanted.
 */
const AssetGridSplit: React.FC<AssetGridSplitProps> = ({
  orientation,
  initialSize,
  minSize = 120,
  maxSize = 600,
  first,
  second,
  separatorLabel
}) => {
  const [size, setSize] = useState(initialSize);

  const handleResize = useCallback(
    (delta: number) =>
      setSize((current) =>
        Math.min(maxSize, Math.max(minSize, current + delta))
      ),
    [minSize, maxSize]
  );

  const firstPaneStyle: React.CSSProperties =
    orientation === "horizontal" ? { width: size } : { height: size };

  return (
    <div css={styles(orientation)} className="asset-split">
      <div className="asset-split-pane first" style={firstPaneStyle}>
        {first}
      </div>
      <ResizeHandle
        className="asset-split-separator"
        orientation={orientation === "horizontal" ? "vertical" : "horizontal"}
        value={size}
        min={minSize}
        max={maxSize}
        onResize={handleResize}
        ariaLabel={separatorLabel}
      />
      <div className="asset-split-pane second">{second}</div>
    </div>
  );
};

export default AssetGridSplit;
