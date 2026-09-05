/**
 * One resizable side/bottom panel store, parameterized by its view union.
 *
 * The left, right and bottom panels are the same state machine — a size the
 * user drags, a visibility flag, and one active view — differing only in their
 * view union, their four size constants and what they migrate. Everything
 * below is shared so a fix lands in all three at once (the sliver-reopen guard
 * in `setVisibility` previously existed only in the right panel).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isBoolean, isNumber, isObjectLike } from "../utils/typePredicates";

export interface ResizablePanelState<View extends string> {
  panelSize: number;
  isVisible: boolean;
  isDragging: boolean;
  hasDragged: boolean;
  minSize: number;
  maxSize: number;
  defaultSize: number;
  activeView: View;
}

export interface ResizablePanelActions<View extends string> {
  setSize: (newSize: number) => void;
  setIsDragging: (isDragging: boolean) => void;
  setHasDragged: (hasDragged: boolean) => void;
  initializePanelSize: (size?: number) => void;
  setActiveView: (view: View) => void;
  closePanel: () => void;
  setVisibility: (isVisible: boolean) => void;
  handleViewChange: (view: View) => void;
}

type NoExtra = Record<string, never>;

export type ResizablePanelStore<
  View extends string,
  Extra extends object = NoExtra,
  ExtraActions extends object = NoExtra
> = {
  panel: ResizablePanelState<View> & Extra;
} & ResizablePanelActions<View> &
  ExtraActions;

export interface PanelSizes {
  /** Smallest size a drag can leave behind: the collapsed sliver. */
  drag: number;
  /** Smallest size the panel reopens at. */
  min: number;
  max: number;
  initial: number;
}

interface PanelStoreOptions<
  View extends string,
  Extra extends object,
  ExtraActions extends object
> {
  name: string;
  version: number;
  sizes: PanelSizes;
  defaultView: View;
  isView: (value: unknown) => value is View;
  /**
   * False when visibility is derived rather than chosen — the right panel
   * opens because a node is selected, so a persisted `true` would restore an
   * empty inspector on a fresh load.
   */
  persistVisibility: boolean;
  /** Extra panel fields this panel owns (the left panel's node sub-tab). */
  extraState?: Extra;
  extraActions?: (
    patch: (
      update: (
        panel: ResizablePanelState<View> & Extra
      ) => Partial<ResizablePanelState<View> & Extra>
    ) => void
  ) => ExtraActions;
  /** Which extra fields to persist. */
  partializeExtra?: (panel: Extra) => Record<string, unknown>;
  /**
   * Last word on the rehydrated panel — remaps legacy persisted values the
   * plain `isView` check would drop.
   */
  mergeExtra?: (
    persisted: Record<string, unknown>,
    merged: ResizablePanelState<View> & Extra
  ) => Partial<ResizablePanelState<View> & Extra>;
  migrate?: (persistedState: unknown, version: number) => unknown;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  isObjectLike(value) && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export function createResizablePanelStore<
  View extends string,
  Extra extends object = NoExtra,
  ExtraActions extends object = NoExtra
>(options: PanelStoreOptions<View, Extra, ExtraActions>) {
  type Panel = ResizablePanelState<View> & Extra;
  type Store = ResizablePanelStore<View, Extra, ExtraActions>;

  const { sizes, isView } = options;
  const extraState = options.extraState ?? ({} as Extra);
  const clamp = (size: number) =>
    Math.max(sizes.drag, Math.min(size, sizes.max));

  const initialPanel = (): Panel => ({
    panelSize: sizes.initial,
    isVisible: false,
    isDragging: false,
    hasDragged: false,
    minSize: sizes.drag,
    maxSize: sizes.max,
    defaultSize: sizes.initial,
    activeView: options.defaultView,
    ...extraState
  });

  return create<Store>()(
    persist(
      (set) => {
        const patch = (update: (panel: Panel) => Partial<Panel>) =>
          set(
            (state) =>
              ({ panel: { ...state.panel, ...update(state.panel) } }) as Partial<Store>
          );

        const actions: ResizablePanelActions<View> = {
          setSize: (newSize) =>
            patch(() => ({
              panelSize:
                newSize <= sizes.drag ? sizes.drag : Math.min(newSize, sizes.max)
            })),

          setIsDragging: (isDragging) => patch(() => ({ isDragging })),

          setHasDragged: (hasDragged) => patch(() => ({ hasDragged })),

          initializePanelSize: (size) =>
            patch(() => ({
              panelSize: Math.max(
                sizes.min,
                Math.min(size || sizes.initial, sizes.max)
              )
            })),

          setActiveView: (activeView) => patch(() => ({ activeView })),

          closePanel: () =>
            patch(() => ({ panelSize: sizes.drag, isVisible: false })),

          // A drag-collapse persists a sliver-sized panel. Reopening restores
          // at least the usable minimum so it doesn't come back unusable.
          setVisibility: (isVisible) =>
            patch((panel) => ({
              isVisible,
              panelSize:
                isVisible && panel.panelSize < sizes.min
                  ? sizes.min
                  : panel.panelSize
            })),

          handleViewChange: (view) =>
            patch((panel) => {
              if (panel.activeView !== view) {
                return { activeView: view, isVisible: true };
              }
              if (!panel.isVisible && panel.panelSize < sizes.min) {
                return { panelSize: sizes.min, isVisible: true };
              }
              return { isVisible: !panel.isVisible };
            })
        };

        return {
          panel: initialPanel(),
          ...actions,
          ...(options.extraActions?.(patch) ?? ({} as ExtraActions))
        } as Store;
      },
      {
        name: options.name,
        version: options.version,
        migrate: options.migrate,
        partialize: (state) =>
          ({
            panel: {
              panelSize: state.panel.panelSize,
              activeView: state.panel.activeView,
              ...(options.persistVisibility
                ? { isVisible: state.panel.isVisible }
                : {}),
              ...(options.partializeExtra?.(state.panel) ?? {})
            }
          }) as Store,
        merge: (persistedState, currentState) => {
          const persisted = asRecord(persistedState);
          const persistedPanel = persisted && asRecord(persisted.panel);
          if (!persistedPanel) {
            return currentState;
          }

          const merged: Panel = {
            ...currentState.panel,
            panelSize: isNumber(persistedPanel.panelSize)
              ? clamp(persistedPanel.panelSize)
              : currentState.panel.panelSize,
            ...(options.persistVisibility && isBoolean(persistedPanel.isVisible)
              ? { isVisible: persistedPanel.isVisible }
              : {}),
            activeView: isView(persistedPanel.activeView)
              ? persistedPanel.activeView
              : currentState.panel.activeView
          };

          return {
            ...currentState,
            panel: {
              ...merged,
              ...(options.mergeExtra?.(persistedPanel, merged) ?? {})
            }
          };
        }
      }
    )
  );
}
