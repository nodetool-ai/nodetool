/** @jsxImportSource @emotion/react */
/**
 * Grid over a bound collection: every member is a tile, and picking one sets
 * the binding's `ResourceRef` — the same selection a `ResourcePicker` makes,
 * with the assets visible.
 *
 * The grid is a listbox with a roving tabindex: one tab stop for the whole
 * gallery, arrows to move, Enter or Space to pick.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  Box,
  Caption,
  FlexColumn,
  Label,
  BORDER_RADIUS,
  MOTION,
  SPACING,
  TYPOGRAPHY
} from "../../ui_primitives";
import { trpc } from "../../../trpc/client";
import { useBoundResource, type ResourceItem } from "./useBoundResource";

interface ResourceGalleryProps {
  /** Puck injects the placed widget's id. */
  id?: string;
  /** Id of the `ResourceBinding` in the app document. */
  resourceBindingId?: string;
  label?: string;
  /** Tile edge length in px. */
  tileSize?: number;
  disabled?: boolean;
}

const TILE_SIZE = 140;

/**
 * An asset's preview. The listing envelope carries no URL, so the tile reads
 * the asset record for one — cached per id by TanStack Query and batched with
 * its siblings by the tRPC link.
 */
const AssetThumbnail: React.FC<{ id: string; enabled: boolean }> = ({
  id,
  enabled
}) => {
  const { data } = trpc.assets.get.useQuery({ id }, { enabled });
  const src = data?.thumb_url ?? data?.get_url ?? null;
  if (!src) {
    return (
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          borderRadius: BORDER_RADIUS.sm,
          backgroundColor: "action.hover"
        }}
      />
    );
  }
  return (
    <Box
      component="img"
      src={src}
      alt=""
      sx={{
        flex: 1,
        minHeight: 0,
        width: "100%",
        objectFit: "cover",
        borderRadius: BORDER_RADIUS.sm
      }}
    />
  );
};

interface TileProps {
  item: ResourceItem;
  isAsset: boolean;
  selected: boolean;
  focusable: boolean;
  size: number;
  onSelect: () => void;
  onFocus: () => void;
  registerRef: (el: HTMLDivElement | null) => void;
}

const GalleryTile: React.FC<TileProps> = ({
  item,
  isAsset,
  selected,
  focusable,
  size,
  onSelect,
  onFocus,
  registerRef
}) => (
  <FlexColumn
    ref={registerRef}
    role="option"
    aria-selected={selected}
    tabIndex={focusable ? 0 : -1}
    onClick={onSelect}
    onFocus={onFocus}
    gap={SPACING.xs}
    sx={{
      height: size,
      p: SPACING.xs,
      cursor: "pointer",
      borderRadius: BORDER_RADIUS.md,
      border: "1px solid",
      borderColor: selected ? "primary.main" : "divider",
      outlineOffset: 2,
      backgroundColor: selected ? "action.selected" : "transparent",
      transition: `${MOTION.border}, ${MOTION.background}`,
      "&:hover": { borderColor: "primary.light" }
    }}
  >
    {isAsset ? <AssetThumbnail id={item.ref.id} enabled /> : null}
    <Box
      sx={{
        ...TYPOGRAPHY.sans.caption,
        color: "text.secondary",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }}
      title={item.name}
    >
      {item.name}
    </Box>
  </FlexColumn>
);

/** Which tile an arrow key moves to. Columns are unknown, so up/down step by one. */
const nextIndex = (key: string, index: number, count: number): number | null => {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return Math.min(index + 1, count - 1);
    case "ArrowLeft":
    case "ArrowUp":
      return Math.max(index - 1, 0);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
};

export const ResourceGalleryWidget: React.FC<ResourceGalleryProps> = ({
  resourceBindingId,
  label,
  tileSize,
  disabled
}) => {
  const { binding, items, isLoading, designMode, selected, select } =
    useBoundResource(resourceBindingId);

  const [focusIndex, setFocusIndex] = useState(0);
  const tileRefs = useRef<Array<HTMLDivElement | null>>([]);
  // Pending focus move, applied after render so the tile exists to receive it.
  const pendingFocus = useRef<number | null>(null);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    tileRefs.current[target]?.focus();
  });

  const moveFocus = useCallback((index: number) => {
    setFocusIndex(index);
    pendingFocus.current = index;
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const item = items[focusIndex];
        if (item) select(item.ref);
        return;
      }
      const next = nextIndex(event.key, focusIndex, items.length);
      if (next === null || next === focusIndex) return;
      event.preventDefault();
      moveFocus(next);
    },
    [disabled, focusIndex, items, moveFocus, select]
  );

  if (!binding) {
    return (
      <Caption color="secondary">
        {designMode
          ? "Pick a resource binding for this gallery."
          : "This gallery is not bound to a resource."}
      </Caption>
    );
  }

  const title = label || binding.name;

  if (designMode) {
    return (
      <FlexColumn gap={SPACING.xs} fullWidth>
        <Label>{title}</Label>
        <Caption color="secondary">
          {binding.kind} collection — tiles appear when the app runs.
        </Caption>
      </FlexColumn>
    );
  }

  return (
    <FlexColumn gap={SPACING.xs} fullWidth>
      <Label>{title}</Label>
      {items.length === 0 ? (
        <Caption color="secondary">
          {isLoading
            ? "Loading…"
            : `No ${binding.kind} resources in this collection yet.`}
        </Caption>
      ) : (
        <Box
          role="listbox"
          aria-label={title}
          aria-disabled={disabled || undefined}
          onKeyDown={onKeyDown}
          sx={{
            display: "grid",
            gap: SPACING.sm,
            width: "100%",
            gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize ?? TILE_SIZE}px, 1fr))`
          }}
        >
          {items.map((item, index) => (
            <GalleryTile
              key={item.ref.id}
              item={item}
              isAsset={binding.kind === "asset"}
              size={tileSize ?? TILE_SIZE}
              selected={selected?.id === item.ref.id}
              focusable={index === focusIndex}
              onSelect={() => {
                if (disabled) return;
                setFocusIndex(index);
                select(item.ref);
              }}
              onFocus={() => setFocusIndex(index)}
              registerRef={(el) => {
                tileRefs.current[index] = el;
              }}
            />
          ))}
        </Box>
      )}
    </FlexColumn>
  );
};

export default ResourceGalleryWidget;
