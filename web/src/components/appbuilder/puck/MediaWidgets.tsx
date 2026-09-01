/** @jsxImportSource @emotion/react */
/**
 * Display widgets for the media a run emits that the plain `Image`/`Video` pair
 * cannot show: a 3D model ref, a PDF document ref, and a whole array of media
 * refs at once.
 *
 * Each ref is `{type, uri}`, so without these a 3D or PDF result lands in an app
 * as an opaque JSON blob. The 3D and PDF viewers are the ones the asset viewer
 * already ships, both behind their `Lazy*` wrappers so three.js and pdf.js stay
 * out of the app editor's bundle.
 */
import React from "react";

import {
  Box,
  Caption,
  FlexColumn,
  BORDER_RADIUS,
  MOTION,
  SPACING
} from "../../ui_primitives";
import LazyModel3DViewer from "../../asset_viewer/LazyModel3DViewer";
import LazyPDFViewer from "../../asset_viewer/LazyPDFViewer";
import { AppEvent } from "../types";
import { useWidgetRuntime } from "./useWidgetRuntime";
import { resolveImageSrc } from "./widgets";

interface ReadWidgetProps {
  id: string;
  binding?: string;
  events?: AppEvent[];
  disabled?: boolean;
  placeholder?: string;
}

const useReadBinding = (props: ReadWidgetProps) =>
  useWidgetRuntime({
    id: props.id,
    bindingMode: "read",
    binding: props.binding,
    events: props.events
  });

/** A bound output holds one value or the accumulated list of streamed items. */
const asItems = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value == null ? [] : [value];

const lastSrc = (value: unknown): string | null => {
  const items = asItems(value);
  return items.length > 0 ? resolveImageSrc(items[items.length - 1]) : null;
};

const Empty: React.FC<{ height: number; text: string }> = ({ height, text }) => (
  <FlexColumn
    align="center"
    justify="center"
    fullWidth
    sx={{
      height,
      border: "1px dashed",
      borderColor: "divider",
      borderRadius: BORDER_RADIUS.md
    }}
  >
    <Caption color="secondary">{text}</Caption>
  </FlexColumn>
);

export const Model3DWidget: React.FC<
  ReadWidgetProps & { height?: number }
> = (props) => {
  const { value } = useReadBinding(props);
  const src = lastSrc(value);
  const height = props.height ?? 320;
  if (!src) {
    return (
      <Empty height={height} text={props.placeholder ?? "No 3D model yet"} />
    );
  }
  return (
    <Box
      sx={{
        width: "100%",
        height,
        borderRadius: BORDER_RADIUS.md,
        overflow: "hidden"
      }}
    >
      <LazyModel3DViewer url={src} compact />
    </Box>
  );
};

export const PDFWidget: React.FC<ReadWidgetProps & { height?: number }> = (
  props
) => {
  const { value } = useReadBinding(props);
  const src = lastSrc(value);
  const height = props.height ?? 480;
  if (!src) {
    return <Empty height={height} text={props.placeholder ?? "No document yet"} />;
  }
  return (
    <Box
      sx={{
        width: "100%",
        height,
        borderRadius: BORDER_RADIUS.md,
        overflow: "hidden"
      }}
    >
      <LazyPDFViewer url={src} />
    </Box>
  );
};

const TILE_SIZE = 140;

// The grid is fed by a streaming output that grows an item at a time, so
// without the memo each emitted image rebuilds the styles of every tile before
// it.
const GalleryTile: React.FC<{ src: string; size: number }> = React.memo(
  ({ src, size }) => (
    <Box
      sx={{
        height: size,
        p: SPACING.xs,
        borderRadius: BORDER_RADIUS.md,
        border: "1px solid",
        borderColor: "divider",
        transition: MOTION.border,
        "&:hover": { borderColor: "primary.light" }
      }}
    >
      <Box
        component="img"
        src={src}
        alt=""
        sx={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          borderRadius: BORDER_RADIUS.sm
        }}
      />
    </Box>
  )
);
GalleryTile.displayName = "GalleryTile";

/**
 * A bound array of media refs as a tiled grid — the shape a batch run that emits
 * N images has. Tiles match the resource gallery's look so the two read as one
 * component.
 */
export const GalleryWidget: React.FC<
  ReadWidgetProps & { label?: string; tileSize?: number }
> = (props) => {
  const { value } = useReadBinding(props);
  const sources = React.useMemo(
    () =>
      asItems(value)
        .map(resolveImageSrc)
        .filter((src): src is string => src !== null),
    [value]
  );
  const size = props.tileSize ?? TILE_SIZE;

  if (sources.length === 0) {
    return (
      <Caption color="secondary">
        {props.placeholder ?? "Nothing to show yet"}
      </Caption>
    );
  }

  return (
    <FlexColumn gap={SPACING.xs} fullWidth>
      {props.label ? <Caption color="secondary">{props.label}</Caption> : null}
      <Box
        sx={{
          display: "grid",
          gap: SPACING.sm,
          width: "100%",
          gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))`
        }}
      >
        {sources.map((src, index) => (
          <GalleryTile key={index} src={src} size={size} />
        ))}
      </Box>
    </FlexColumn>
  );
};
