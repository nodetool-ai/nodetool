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
import {
  useAppRuntimeContext,
  useBindingRef,
  useBindingValue
} from "../runtime/AppRuntimeContext";
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

/**
 * One array element and the source it resolved to, kept paired so a click
 * writes the element the run produced rather than its display URL.
 */
interface GalleryEntry {
  item: unknown;
  src: string;
}

/**
 * Two bound values are the same choice when they carry the same data: the
 * selection slot holds a copy of the array element (serialized on reload), so
 * reference equality would lose the mark the moment the app is reopened.
 */
const sameSelection = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    // Cyclic or otherwise unserializable values: reference equality already lost.
    return false;
  }
};

interface GalleryTileProps {
  index: number;
  src: string;
  size: number;
  /** Set when the widget carries a `selectionBinding` and can write to it. */
  selectable: boolean;
  selected: boolean;
  disabled?: boolean;
  onSelect: (index: number) => void;
}

const tileSx = (size: number) => ({
  height: size,
  p: SPACING.xs,
  borderRadius: BORDER_RADIUS.md,
  border: "1px solid",
  borderColor: "divider",
  transition: MOTION.border,
  "&:hover": { borderColor: "primary.light" }
});

const imageSx = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  borderRadius: BORDER_RADIUS.sm
} as const;

// The grid is fed by a streaming output that grows an item at a time, so
// without the memo each emitted image rebuilds the styles of every tile before
// it.
const GalleryTile: React.FC<GalleryTileProps> = React.memo(
  ({ index, src, size, selectable, selected, disabled, onSelect }) => {
    const image = <Box component="img" src={src} alt="" sx={imageSx} />;
    if (!selectable) {
      return <Box sx={tileSx(size)}>{image}</Box>;
    }
    return (
      <Box
        component="button"
        type="button"
        aria-pressed={selected}
        aria-label={`Select item ${index + 1}`}
        disabled={disabled}
        onClick={() => onSelect(index)}
        sx={{
          ...tileSx(size),
          display: "block",
          width: "100%",
          background: "none",
          font: "inherit",
          cursor: disabled ? "default" : "pointer",
          borderColor: selected ? "primary.main" : "divider",
          backgroundColor: selected ? "action.selected" : "transparent",
          transition: `${MOTION.border}, ${MOTION.background}`,
          "&:focus-visible": {
            outline: "2px solid",
            outlineColor: "primary.main",
            outlineOffset: 2
          }
        }}
      >
        {image}
      </Box>
    );
  }
);
GalleryTile.displayName = "GalleryTile";

/**
 * A bound array of media refs as a tiled grid — the shape a batch run that emits
 * N images has. Tiles match the resource gallery's look so the two read as one
 * component.
 *
 * With a `selectionBinding` the grid becomes the generate-N-pick-one loop:
 * picking a tile writes that array element — the ref as the run emitted it, not
 * the resolved URL — to the bound slot and emits `change`, so a wired `run`
 * event carries the choice into the next operation. The mark is read back out
 * of that slot, so a reopened app shows the same choice.
 */
export const GalleryWidget: React.FC<
  ReadWidgetProps & {
    label?: string;
    tileSize?: number;
    /** Write slot the picked array element lands in. */
    selectionBinding?: string;
  }
> = (props) => {
  const { value, emit, designMode } = useReadBinding(props);
  const { write } = useAppRuntimeContext();
  const selectionRef = useBindingRef(props.selectionBinding, "write");
  const selectedValue = useBindingValue(selectionRef);
  const selectable = props.selectionBinding != null && !designMode;

  const entries = React.useMemo<GalleryEntry[]>(() => {
    const paired: GalleryEntry[] = [];
    for (const item of asItems(value)) {
      const src = resolveImageSrc(item);
      // An item that resolves to nothing has no tile, so it must not take an
      // index either — the click handler indexes into this same list.
      if (src !== null) paired.push({ item, src });
    }
    return paired;
  }, [value]);

  const size = props.tileSize ?? TILE_SIZE;

  const onSelect = React.useCallback(
    (index: number) => {
      const entry = entries[index];
      if (!entry || !selectionRef || !selectable) return;
      write(selectionRef, entry.item);
      emit("change");
    },
    [emit, entries, selectable, selectionRef, write]
  );

  if (entries.length === 0) {
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
        {entries.map((entry, index) => (
          <GalleryTile
            key={index}
            index={index}
            src={entry.src}
            size={size}
            selectable={selectable}
            selected={selectable && sameSelection(selectedValue, entry.item)}
            disabled={props.disabled}
            onSelect={onSelect}
          />
        ))}
      </Box>
    </FlexColumn>
  );
};
