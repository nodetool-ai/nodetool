/**
 * Editor state for the WYSIWYG app builder: the spec being edited, the current
 * selection, design/preview mode, and an undo/redo history. One builder is open
 * at a time, so a single store instance is sufficient.
 */
import { create } from "zustand";

import {
  AppSpec,
  AppEvent,
  Widget,
  WidgetLayout,
  WidgetPropValue,
  WidgetType,
  createEmptyAppSpec
} from "../components/appbuilder/appSchema";
import { getWidgetDefinition } from "../components/appbuilder/widgets/registry";
import { gridRows } from "../components/appbuilder/gridUtils";

const HISTORY_LIMIT = 50;

const newId = (): string => {
  const cryptoObj = (
    globalThis as { crypto?: { randomUUID?: () => string } }
  ).crypto;
  if (cryptoObj?.randomUUID) return `w_${cryptoObj.randomUUID().slice(0, 8)}`;
  return `w_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
};

export type AppBuilderMode = "design" | "preview";

interface AppBuilderState {
  spec: AppSpec;
  selectedWidgetId: string | null;
  mode: AppBuilderMode;
  past: AppSpec[];
  future: AppSpec[];

  /** Replace the spec and reset history (used on load). */
  loadSpec: (spec: AppSpec) => void;
  setMode: (mode: AppBuilderMode) => void;
  setTitle: (title: string) => void;
  selectWidget: (id: string | null) => void;
  addWidget: (type: WidgetType) => void;
  removeWidget: (id: string) => void;
  duplicateWidget: (id: string) => void;
  updateLayout: (id: string, layout: WidgetLayout) => void;
  setProp: (id: string, key: string, value: WidgetPropValue) => void;
  setBinding: (id: string, binding: string | undefined) => void;
  setEvents: (id: string, events: AppEvent[]) => void;
  undo: () => void;
  redo: () => void;
}

const mutateWidgets = (
  state: AppBuilderState,
  updater: (widgets: Widget[]) => Widget[]
): Partial<AppBuilderState> => {
  const nextWidgets = updater(state.spec.widgets);
  return {
    spec: { ...state.spec, widgets: nextWidgets },
    past: [...state.past, state.spec].slice(-HISTORY_LIMIT),
    future: []
  };
};

export const useAppBuilderStore = create<AppBuilderState>((set, get) => ({
  spec: createEmptyAppSpec(),
  selectedWidgetId: null,
  mode: "design",
  past: [],
  future: [],

  loadSpec: (spec) =>
    set({ spec, selectedWidgetId: null, past: [], future: [], mode: "design" }),

  setMode: (mode) => set({ mode }),

  setTitle: (title) =>
    set((state) => ({
      spec: { ...state.spec, title },
      past: [...state.past, state.spec].slice(-HISTORY_LIMIT),
      future: []
    })),

  selectWidget: (selectedWidgetId) => set({ selectedWidgetId }),

  addWidget: (type) => {
    const definition = getWidgetDefinition(type);
    if (!definition) return;
    const widgets = get().spec.widgets;
    const widget: Widget = {
      id: newId(),
      type,
      layout: {
        x: 0,
        y: gridRows(widgets),
        w: definition.defaultSize.w,
        h: definition.defaultSize.h
      },
      props: { ...definition.defaultProps }
    };
    set((state) => ({
      ...mutateWidgets(state, (ws) => [...ws, widget]),
      selectedWidgetId: widget.id
    }));
  },

  removeWidget: (id) =>
    set((state) => ({
      ...mutateWidgets(state, (ws) => ws.filter((w) => w.id !== id)),
      selectedWidgetId:
        state.selectedWidgetId === id ? null : state.selectedWidgetId
    })),

  duplicateWidget: (id) => {
    const source = get().spec.widgets.find((w) => w.id === id);
    if (!source) return;
    const copy: Widget = {
      ...source,
      id: newId(),
      layout: { ...source.layout, y: source.layout.y + source.layout.h },
      props: { ...source.props },
      events: source.events ? [...source.events] : undefined
    };
    set((state) => ({
      ...mutateWidgets(state, (ws) => [...ws, copy]),
      selectedWidgetId: copy.id
    }));
  },

  updateLayout: (id, layout) =>
    set((state) =>
      mutateWidgets(state, (ws) =>
        ws.map((w) => (w.id === id ? { ...w, layout } : w))
      )
    ),

  setProp: (id, key, value) =>
    set((state) =>
      mutateWidgets(state, (ws) =>
        ws.map((w) =>
          w.id === id ? { ...w, props: { ...w.props, [key]: value } } : w
        )
      )
    ),

  setBinding: (id, binding) =>
    set((state) =>
      mutateWidgets(state, (ws) =>
        ws.map((w) => (w.id === id ? { ...w, binding } : w))
      )
    ),

  setEvents: (id, events) =>
    set((state) =>
      mutateWidgets(state, (ws) =>
        ws.map((w) => (w.id === id ? { ...w, events } : w))
      )
    ),

  undo: () =>
    set((state) => {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        spec: prev,
        past: state.past.slice(0, -1),
        future: [state.spec, ...state.future].slice(0, HISTORY_LIMIT)
      };
    }),

  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!next) return state;
      return {
        spec: next,
        past: [...state.past, state.spec].slice(-HISTORY_LIMIT),
        future: state.future.slice(1)
      };
    })
}));
