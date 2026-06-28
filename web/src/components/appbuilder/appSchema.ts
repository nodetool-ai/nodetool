/**
 * App Builder schema.
 *
 * An AppSpec describes a WYSIWYG application built on top of a workflow. The
 * model is reactive and event-driven:
 *
 *   - The app has a flat reactive **state** dictionary (`Record<string, unknown>`).
 *   - Workflow **inputs** are state keys (keyed by the input node `name`).
 *   - Workflow **outputs** stream into state keys (keyed by the output node
 *     `name`) as the graph runs — this is where the NodeTool streaming model
 *     drives the UI.
 *   - **Widgets** bind a single state key (read for displays, two-way for
 *     inputs) and emit **events** (click/change) that dispatch **actions**
 *     (run the workflow, set state, ...).
 *
 * The spec is persisted on the workflow under `settings[APP_SPEC_SETTINGS_KEY]`
 * as a JSON string (see persistence.ts), so no backend schema change is needed.
 */

export const APP_SPEC_VERSION = 1 as const;
export const APP_SPEC_SETTINGS_KEY = "__appbuilder__" as const;

export type WidgetType =
  | "heading"
  | "text"
  | "markdown"
  | "image"
  | "json"
  | "textInput"
  | "numberInput"
  | "slider"
  | "switch"
  | "select"
  | "button"
  | "container"
  | "divider"
  | "progress";

/** Static prop values are restricted to JSON scalars (and string arrays for options). */
export type WidgetPropValue = string | number | boolean | null | string[];

export type EventTrigger = "click" | "change";

export type AppAction =
  /** Run the bound workflow with the current input state. */
  | { kind: "run" }
  /** Cancel a running workflow. */
  | { kind: "cancel" }
  /** Set a state key to a literal value. */
  | { kind: "setState"; key: string; value: WidgetPropValue }
  /** Flip a boolean state key. */
  | { kind: "toggleState"; key: string };

export interface AppEvent {
  trigger: EventTrigger;
  action: AppAction;
}

export interface WidgetLayout {
  /** Column index (grid units, 0-based). */
  x: number;
  /** Row index (grid units, 0-based). */
  y: number;
  /** Width in grid columns. */
  w: number;
  /** Height in grid rows. */
  h: number;
}

export interface Widget {
  id: string;
  type: WidgetType;
  layout: WidgetLayout;
  /** Static configuration (label, placeholder, min/max, ...). */
  props: Record<string, WidgetPropValue>;
  /** State key this widget reads (displays) or reads+writes (inputs). */
  binding?: string;
  /** Interaction handlers. */
  events?: AppEvent[];
}

export interface AppGridConfig {
  cols: number;
  rowHeight: number;
  gap: number;
}

export interface AppSpec {
  version: typeof APP_SPEC_VERSION;
  title?: string;
  grid: AppGridConfig;
  widgets: Widget[];
}

export const DEFAULT_GRID: AppGridConfig = {
  cols: 12,
  rowHeight: 48,
  gap: 8
};

export const createEmptyAppSpec = (title?: string): AppSpec => ({
  version: APP_SPEC_VERSION,
  title,
  grid: { ...DEFAULT_GRID },
  widgets: []
});

const isLayout = (value: unknown): value is WidgetLayout => {
  if (typeof value !== "object" || value === null) return false;
  const l = value as Record<string, unknown>;
  return (
    typeof l.x === "number" &&
    typeof l.y === "number" &&
    typeof l.w === "number" &&
    typeof l.h === "number"
  );
};

const isWidget = (value: unknown): value is Widget => {
  if (typeof value !== "object" || value === null) return false;
  const w = value as Record<string, unknown>;
  return (
    typeof w.id === "string" &&
    typeof w.type === "string" &&
    isLayout(w.layout) &&
    typeof w.props === "object" &&
    w.props !== null
  );
};

/**
 * Validate and normalize an unknown value into an AppSpec. Returns null when the
 * value is not a usable spec (so callers can fall back to the default UI).
 */
export const parseAppSpec = (value: unknown): AppSpec | null => {
  if (typeof value !== "object" || value === null) return null;
  const spec = value as Record<string, unknown>;
  if (!Array.isArray(spec.widgets)) return null;

  const widgets = spec.widgets.filter(isWidget).map((w) => ({
    ...w,
    events: Array.isArray(w.events) ? w.events : undefined,
    props: w.props ?? {}
  }));

  const grid = spec.grid as Partial<AppGridConfig> | undefined;
  return {
    version: APP_SPEC_VERSION,
    title: typeof spec.title === "string" ? spec.title : undefined,
    grid: {
      cols: grid?.cols ?? DEFAULT_GRID.cols,
      rowHeight: grid?.rowHeight ?? DEFAULT_GRID.rowHeight,
      gap: grid?.gap ?? DEFAULT_GRID.gap
    },
    widgets
  };
};

/** True when a spec carries at least one widget worth rendering. */
export const isRenderableAppSpec = (
  spec: AppSpec | null | undefined
): spec is AppSpec => Boolean(spec && spec.widgets.length > 0);
