/**
 * Widget definition model. Each widget type declares how it renders, what
 * static props it exposes in the inspector, and how it binds to reactive state.
 */
import { ReactNode } from "react";
import {
  EventTrigger,
  WidgetPropValue,
  WidgetType,
  Widget
} from "../appSchema";
import { RuntimeRunnerState } from "../runtime/appRuntimeStore";

export type WidgetCategory = "input" | "display" | "action" | "layout";

/** How a widget uses its data binding. */
export type BindingMode = "none" | "read" | "write";

export type InspectorFieldType =
  | "text"
  | "multiline"
  | "number"
  | "boolean"
  | "select"
  | "color";

export interface InspectorField {
  key: string;
  label: string;
  type: InspectorFieldType;
  /** For `select`. */
  options?: { label: string; value: string }[];
  placeholder?: string;
}

export interface WidgetRenderContext {
  widget: Widget;
  props: Record<string, WidgetPropValue>;
  /** Typed prop accessor with a fallback. */
  prop: <T extends WidgetPropValue>(key: string, fallback: T) => T;
  /** Current value of the bound state key (read bindings). */
  value: unknown;
  /** Write the bound state key (write bindings). */
  setValue: (value: unknown) => void;
  /** Fire the widget's events for a trigger. */
  emit: (trigger: EventTrigger) => void;
  designMode: boolean;
  runnerState: RuntimeRunnerState;
  /** Render nested widgets (for layout widgets). */
  renderChild?: (widget: Widget) => ReactNode;
}

export interface WidgetDefinition {
  type: WidgetType;
  label: string;
  category: WidgetCategory;
  /** MUI icon element shown in the palette. */
  icon: ReactNode;
  defaultSize: { w: number; h: number };
  defaultProps: Record<string, WidgetPropValue>;
  bindingMode: BindingMode;
  /** Default trigger emitted by interactive widgets (button → click). */
  defaultTrigger?: EventTrigger;
  /** Static props editable in the inspector. */
  inspector: InspectorField[];
  render: (ctx: WidgetRenderContext) => ReactNode;
}
