import { useEffect, useState } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { useTimelineStoreApi } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStoreApi } from "../../../stores/timeline/TimelineUIStore";

export interface TrackingRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface TrackingSelection {
  readonly clipId: string;
  readonly sourceAssetId: string;
  readonly sourceMs: number;
  readonly region: TrackingRectangle | null;
}

interface TrackingSelectionState {
  selection: TrackingSelection | null;
  select: (selection: TrackingSelection | null) => void;
}

// The UI store identifies one editor instance. Selection never enters its document history.
const selections = new WeakMap<object, StoreApi<TrackingSelectionState>>();

export function useTrackingSelection(): TrackingSelectionState {
  const doc = useTimelineStoreApi();
  const ui = useTimelineUIStoreApi();
  const [store] = useState(() => {
    let existing = selections.get(ui);
    if (!existing) {
      existing = createStore<TrackingSelectionState>((set) => ({
        selection: null,
        select: (selection) => set({ selection })
      }));
      selections.set(ui, existing);
    }
    return existing;
  });
  useEffect(() => {
    const invalidate = (): void => {
      const selection = store.getState().selection;
      if (!selection) {
        return;
      }
      const clip = doc
        .getState()
        .clips.find((item) => item.id === selection.clipId);
      const selected = ui.getState().selectedClipIds;
      if (
        clip?.currentAssetId !== selection.sourceAssetId ||
        selected.size !== 1 ||
        !selected.has(selection.clipId)
      ) {
        store.getState().select(null);
      }
    };
    invalidate();
    const stopDoc = doc.subscribe(invalidate);
    const stopUi = ui.subscribe(invalidate);
    return () => {
      stopDoc();
      stopUi();
    };
  }, [doc, ui, store]);
  const selection = useStore(store, (state) => state.selection);
  const select = useStore(store, (state) => state.select);
  return { selection, select };
}
