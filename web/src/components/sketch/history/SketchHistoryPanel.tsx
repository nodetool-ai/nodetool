/**
 * SketchHistoryPanel — Photoshop-style History panel. Lists every document
 * state in the undo history, oldest first, labelled by the edit that produced
 * it. Clicking a row steps undo or redo until the document is in that state.
 * Rows after the current state are undone edits: dimmed, and still reachable
 * until the next edit replaces them.
 */

import { memo, useCallback, useEffect, useMemo, useRef } from "react";

import { useSketchStore } from "../state/useSketchStore";
import { hasUncommittedHistoryTip } from "../state/slices/historySlice";
import {
  Caption,
  FlexColumn,
  ScrollArea,
  SelectableListItem,
  TruncatedText
} from "../../ui_primitives";
import { buildHistoryRows, type HistoryRow } from "./historyRows";
import { jumpToHistoryIndex } from "./jumpToHistoryIndex";

export interface SketchHistoryPanelProps {
  onUndo: () => void;
  onRedo: () => void;
}

const LIST_MAX_HEIGHT = 220;

export const SketchHistoryPanel = memo(function SketchHistoryPanel({
  onUndo,
  onRedo
}: SketchHistoryPanelProps) {
  const history = useSketchStore((s) => s.history);
  const historyIndex = useSketchStore((s) => s.historyIndex);
  const uncommittedTip = useSketchStore(hasUncommittedHistoryTip);

  const rows = useMemo(
    () => buildHistoryRows(history, historyIndex, uncommittedTip),
    [history, historyIndex, uncommittedTip]
  );

  // Keep the current row visible by scrolling the list only, never the
  // sidebar around it.
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = scrollRef.current;
    const row = currentRef.current;
    if (!list || !row) {
      return;
    }
    const top =
      row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop) {
      list.scrollTop = top;
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }, [rows]);

  const handleSelect = useCallback(
    (row: HistoryRow) => {
      if (row.current || row.index === null) {
        return;
      }
      jumpToHistoryIndex(row.index, onUndo, onRedo);
    },
    [onUndo, onRedo]
  );

  if (rows.length === 0) {
    return (
      <Caption sx={{ px: 1.5, py: 1 }} data-testid="sketch-history-empty">
        Your edits appear here.
      </Caption>
    );
  }

  return (
    <ScrollArea ref={scrollRef} maxHeight={LIST_MAX_HEIGHT} data-testid="sketch-history-panel">
      <FlexColumn role="list" aria-label="History" gap={0}>
        {rows.map((row, i) => (
          <SelectableListItem
            key={row.index ?? "live"}
            ref={row.current ? currentRef : undefined}
            role="listitem"
            selected={row.current}
            onClick={() => handleSelect(row)}
            aria-current={row.current ? "step" : undefined}
            aria-label={row.undone ? `${row.label} (undone)` : row.label}
            data-testid="sketch-history-row"
            data-current={row.current ? "true" : undefined}
            data-undone={row.undone ? "true" : undefined}
            paddingY={0.25}
            sx={{
              opacity: row.undone ? 0.45 : 1,
              cursor: row.current ? "default" : "pointer"
            }}
          >
            <Caption sx={{ minWidth: 18, opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>
              {i + 1}
            </Caption>
            <TruncatedText variant="body2">{row.label}</TruncatedText>
          </SelectableListItem>
        ))}
      </FlexColumn>
    </ScrollArea>
  );
});

export default SketchHistoryPanel;
