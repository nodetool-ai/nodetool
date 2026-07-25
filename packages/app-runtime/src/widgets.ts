/**
 * The widget catalog: what every placed component type can do in the runtime.
 *
 * One table, three consumers — the Puck editor config, the CLI `app debug`
 * harness, and the `app-tools` eval suite. Before this existed the harness kept
 * a hand-copied list that had already fallen behind the editor by five widget
 * types, so apps using them failed validation with "unknown widget type".
 */

/** How a widget participates in the reactive layer. */
export type WidgetBindingMode = "read" | "write" | "action" | "layout";

export interface WidgetDescriptor {
  /** Palette label, matching the editor. */
  label: string;
  mode: WidgetBindingMode;
  /** Which trigger the widget's events fire on, if it has any. */
  trigger?: "click" | "change";
  /**
   * True when the control reports a settled value (slider release, input
   * blur), which is what makes `pace: "release"` meaningful.
   */
  commits?: boolean;
  /** Props holding child widgets, for tree traversal. */
  slots?: ReadonlyArray<string>;
}

export const WIDGET_CATALOG: Readonly<Record<string, WidgetDescriptor>> = {
  // Display
  Heading: { label: "Heading", mode: "read" },
  Text: { label: "Text", mode: "read" },
  Markdown: { label: "Markdown", mode: "read" },
  Image: { label: "Image", mode: "read" },
  Audio: { label: "Audio", mode: "read" },
  Video: { label: "Video", mode: "read" },
  Json: { label: "JSON", mode: "read" },
  Output: { label: "Output", mode: "read" },
  Progress: { label: "Progress", mode: "read" },
  // Inputs
  WorkflowInput: {
    label: "Workflow Input",
    mode: "write",
    trigger: "change",
    commits: false
  },
  TextInput: { label: "Text Input", mode: "write", trigger: "change", commits: true },
  NumberInput: {
    label: "Number Input",
    mode: "write",
    trigger: "change",
    commits: true
  },
  Slider: { label: "Slider", mode: "write", trigger: "change", commits: true },
  Switch: { label: "Switch", mode: "write", trigger: "change", commits: false },
  Select: { label: "Select", mode: "write", trigger: "change", commits: false },
  ImageInput: {
    label: "Image Input",
    mode: "write",
    trigger: "change",
    commits: false
  },
  AudioInput: {
    label: "Audio Input",
    mode: "write",
    trigger: "change",
    commits: false
  },
  VideoInput: {
    label: "Video Input",
    mode: "write",
    trigger: "change",
    commits: false
  },
  DocumentInput: {
    label: "Document Input",
    mode: "write",
    trigger: "change",
    commits: false
  },
  ColorInput: {
    label: "Color Input",
    mode: "write",
    trigger: "change",
    commits: false
  },
  // Actions
  Button: { label: "Button", mode: "action", trigger: "click" },
  // Layout
  Container: { label: "Panel", mode: "layout", slots: ["content"] },
  Columns: { label: "Columns", mode: "layout", slots: ["left", "right"] },
  Divider: { label: "Divider", mode: "layout" }
};

export const widgetMode = (type: string): WidgetBindingMode | "unknown" =>
  WIDGET_CATALOG[type]?.mode ?? "unknown";

export const isKnownWidget = (type: string): boolean => type in WIDGET_CATALOG;

/** Props every widget accepts on top of its own fields. */
export interface CommonWidgetProps {
  binding?: string;
  /** Hide the widget unless this condition holds. */
  visibleWhen?: { binding?: string; op?: string; value?: string };
  /** Disable the widget while this condition holds. */
  disabledWhen?: { binding?: string; op?: string; value?: string };
  /** `{binding|filter}` template rendered in place of the raw value. */
  format?: string;
}
