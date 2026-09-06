/**
 * VirtualList Component
 *
 * The TanStack `useVirtualizer` scaffold every long list in the app was
 * hand-rolling: a themed scroll container, a spacer sized to
 * `getTotalSize()`, and absolutely-positioned rows offset with
 * `transform: translateY(start)`.
 *
 * The list owns the scroll element and the row positioning. Everything a
 * call site still needs — measuring after row sizes change, scrolling a row
 * into view, reading scroll position — is reachable through the ref handle.
 */

import React, { forwardRef, memo, useCallback, useImperativeHandle, useMemo, useRef } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { useVirtualizer } from "@tanstack/react-virtual";

import { ScrollArea } from "./ScrollArea";
import { scrollbarStyles } from "./tokens";

export type VirtualListAlign = "start" | "center" | "end" | "auto";

export interface VirtualListHandle {
  /** The scroll container, for measuring or reading scroll position. */
  getScrollElement: () => HTMLDivElement | null;
  /** Scroll a row into view. */
  scrollToIndex: (index: number, options?: { align?: VirtualListAlign }) => void;
  /** Drop the cached row measurements — call when `estimateSize` inputs change. */
  measure: () => void;
}

export interface VirtualListProps<T> {
  /** Rows to render, in order. */
  items: readonly T[];
  /** Row height in px, or a function of the row index. */
  estimateSize: number | ((index: number) => number);
  /** Stable key per row. Defaults to the index. */
  getItemKey?: (item: T, index: number) => string | number;
  /** Rows rendered outside the viewport. Defaults to `theme.virtualScroll.overscan.normal`. */
  overscan?: number;
  /** Row content. The wrapper div and its positioning belong to the list. */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Extra props merged onto a row's wrapper div (className, role, style). */
  getItemProps?: (item: T, index: number) => React.HTMLAttributes<HTMLDivElement>;
  /** Row to keep scrolled into view. `null`/`undefined` scrolls nothing. */
  scrollToIndex?: number | null;
  /** Alignment used by `scrollToIndex`. */
  scrollAlign?: VirtualListAlign;
  /** Accessible name for the list. */
  ariaLabel?: string;
  /** Role on the inner list element. Defaults to `list`. */
  role?: string;
  /** Scroll axes the container handles. */
  direction?: "vertical" | "both";
  onScroll?: React.UIEventHandler<HTMLDivElement>;
  sx?: SxProps<Theme>;
  className?: string;
  style?: React.CSSProperties;
}

const SPACER_BASE_STYLE: React.CSSProperties = {
  width: "100%",
  position: "relative"
};

function VirtualListInner<T>(
  {
    items,
    estimateSize,
    getItemKey,
    overscan,
    renderItem,
    getItemProps,
    scrollToIndex,
    scrollAlign = "auto",
    ariaLabel,
    role = "list",
    direction = "vertical",
    onScroll,
    sx,
    className,
    style
  }: VirtualListProps<T>,
  ref: React.Ref<VirtualListHandle>
) {
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);

  const sizeFor = useCallback(
    (index: number) =>
      typeof estimateSize === "function" ? estimateSize(index) : estimateSize,
    [estimateSize]
  );

  const keyFor = useMemo(() => {
    if (!getItemKey) {
      return undefined;
    }
    return (index: number) => getItemKey(items[index], index);
  }, [getItemKey, items]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: sizeFor,
    overscan: overscan ?? theme.virtualScroll.overscan.normal,
    getItemKey: keyFor
  });

  useImperativeHandle(
    ref,
    () => ({
      getScrollElement: () => scrollRef.current,
      scrollToIndex: (index, options) =>
        virtualizer.scrollToIndex(index, { align: options?.align ?? "auto" }),
      measure: () => virtualizer.measure()
    }),
    [virtualizer]
  );

  React.useEffect(() => {
    if (scrollToIndex == null || scrollToIndex < 0) {
      return;
    }
    virtualizer.scrollToIndex(scrollToIndex, { align: scrollAlign });
  }, [scrollToIndex, scrollAlign, virtualizer]);

  const containerSx = useMemo<SxProps<Theme>>(
    () => ({ ...scrollbarStyles(theme), ...(sx as object) }),
    [theme, sx]
  );

  return (
    <ScrollArea
      ref={scrollRef}
      direction={direction}
      className={className}
      style={style}
      onScroll={onScroll}
      sx={containerSx}
    >
      <div
        role={role}
        aria-label={ariaLabel}
        style={{ ...SPACER_BASE_STYLE, height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          const extra = getItemProps?.(item, virtualItem.index);
          return (
            <div
              {...extra}
              key={virtualItem.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: virtualItem.size,
                transform: `translateY(${virtualItem.start}px)`,
                ...extra?.style
              }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

/**
 * @example
 * <VirtualList
 *   items={rows}
 *   estimateSize={36}
 *   getItemKey={(row) => row.id}
 *   ariaLabel="Log messages"
 *   renderItem={(row) => <LogRow row={row} />}
 * />
 */
export const VirtualList = memo(forwardRef(VirtualListInner)) as <T>(
  props: VirtualListProps<T> & { ref?: React.Ref<VirtualListHandle> }
) => React.ReactElement;
