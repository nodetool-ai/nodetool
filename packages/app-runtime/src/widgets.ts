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

/**
 * Editor field kinds, matching Puck's field `type`. `custom` covers the binding,
 * variable, condition, and resource pickers the editor renders itself.
 */
export type WidgetFieldKind =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "radio"
  | "array"
  | "slot"
  | "custom";

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
  /**
   * Binding-carrying props besides `binding`. A chat thread reads its history
   * from one binding and the in-flight reply from another, so validation has to
   * look past the single `binding` prop every other widget uses.
   */
  bindingProps?: ReadonlyArray<{ prop: string; mode: "read" | "write" }>;
  /**
   * The widget's own editor fields, name → kind. The three logic props every
   * widget shares are not listed here — `widgetFields` adds them.
   */
  fields: Readonly<Record<string, WidgetFieldKind>>;
  /**
   * True when the widget renders a value a `format` template can rewrite. Media
   * and control widgets show no formattable text, so the editor omits the field.
   */
  format?: boolean;
}

export const WIDGET_CATALOG: Readonly<Record<string, WidgetDescriptor>> = {
  // Display
  Heading: {
    label: "Heading",
    mode: "read",
    format: true,
    fields: { text: "text", level: "select", binding: "custom" }
  },
  Text: {
    label: "Text",
    mode: "read",
    format: true,
    fields: { text: "textarea", binding: "custom" }
  },
  Markdown: {
    label: "Markdown",
    mode: "read",
    format: true,
    fields: { text: "textarea", binding: "custom" }
  },
  Image: {
    label: "Image",
    mode: "read",
    fields: {
      binding: "custom",
      fit: "select",
      height: "number",
      placeholder: "text"
    }
  },
  Audio: {
    label: "Audio",
    mode: "read",
    fields: { binding: "custom", placeholder: "text" }
  },
  Video: {
    label: "Video",
    mode: "read",
    fields: { binding: "custom", height: "number", placeholder: "text" }
  },
  Json: {
    label: "JSON",
    mode: "read",
    format: true,
    fields: { binding: "custom" }
  },
  // Composites the layers of a bound sketch document — what a run that emits a
  // SketchRef needs, since the raw ref renders as an opaque `{type, id}`.
  Sketch: {
    label: "Sketch",
    mode: "read",
    fields: {
      binding: "custom",
      height: "number",
      showDimensions: "radio",
      placeholder: "text"
    }
  },
  // Previews a bound timeline sequence: its tracks, clips, and current frame.
  Timeline: {
    label: "Timeline",
    mode: "read",
    fields: {
      binding: "custom",
      height: "number",
      showMetadata: "radio",
      placeholder: "text"
    }
  },
  // Lays out an array value as rows — what a run that emits N results needs.
  Table: {
    label: "Table",
    mode: "read",
    fields: {
      binding: "custom",
      label: "text",
      maxHeight: "number",
      placeholder: "text"
    }
  },
  Output: {
    label: "Output",
    mode: "read",
    format: true,
    fields: { binding: "custom", placeholder: "text" }
  },
  Progress: {
    label: "Progress",
    mode: "read",
    fields: { label: "text", binding: "custom" }
  },
  // Reads a bound value as a message rather than as content: an error output,
  // a validation string, a status line the app wants to draw attention to.
  Alert: {
    label: "Alert",
    mode: "read",
    format: true,
    fields: {
      binding: "custom",
      text: "textarea",
      title: "text",
      severity: "select"
    }
  },
  CodeBlock: {
    label: "Code",
    mode: "read",
    format: true,
    fields: {
      binding: "custom",
      text: "textarea",
      language: "text",
      maxHeight: "number"
    }
  },
  // Lays out an array value as items; Table's sibling for values that have no
  // columns.
  List: {
    label: "List",
    mode: "read",
    format: true,
    fields: {
      binding: "custom",
      label: "text",
      ordered: "radio",
      placeholder: "text"
    }
  },
  // An object value as label/value rows — what a single-result operation that
  // emits a record usually wants.
  KeyValue: {
    label: "Key/Value",
    mode: "read",
    fields: { binding: "custom", label: "text", placeholder: "text" }
  },
  Stat: {
    label: "Stat",
    mode: "read",
    format: true,
    fields: {
      binding: "custom",
      label: "text",
      caption: "text",
      placeholder: "text"
    }
  },
  // Offers the bound media/document ref as a file rather than rendering it.
  Download: {
    label: "Download",
    mode: "read",
    fields: {
      binding: "custom",
      label: "text",
      filename: "text",
      placeholder: "text"
    }
  },
  // Renders a bound `Model3DRef` in an orbit viewer. The raw ref is `{type,
  // uri}`, so without this a 3D result shows as an opaque object.
  Model3D: {
    label: "3D Model",
    mode: "read",
    fields: { binding: "custom", height: "number", placeholder: "text" }
  },
  // Plots a bound array or dataframe. `chartKind` picks the trace type rather
  // than asking the app author for a Plotly spec.
  Chart: {
    label: "Chart",
    mode: "read",
    fields: {
      binding: "custom",
      label: "text",
      chartKind: "select",
      height: "number",
      placeholder: "text"
    }
  },
  // Paginated PDF preview of a bound document ref. `Download` offers the same
  // value as a file; this one renders it in place.
  PDF: {
    label: "PDF",
    mode: "read",
    fields: { binding: "custom", height: "number", placeholder: "text" }
  },
  // A tiled grid of a bound array of media refs — what a batch run that emits N
  // images needs, since `Image` binds one value and `Table` renders rows.
  Gallery: {
    label: "Gallery",
    mode: "read",
    fields: {
      binding: "custom",
      label: "text",
      tileSize: "number",
      placeholder: "text"
    }
  },
  // Inputs
  WorkflowInput: {
    label: "Workflow Input",
    mode: "write",
    trigger: "change",
    commits: false,
    fields: { binding: "custom", label: "text", events: "array" }
  },
  TextInput: {
    label: "Text Input",
    mode: "write",
    trigger: "change",
    commits: true,
    fields: {
      binding: "custom",
      label: "text",
      placeholder: "text",
      multiline: "radio",
      events: "array"
    }
  },
  NumberInput: {
    label: "Number Input",
    mode: "write",
    trigger: "change",
    commits: true,
    fields: {
      binding: "custom",
      label: "text",
      min: "number",
      max: "number",
      step: "number",
      events: "array"
    }
  },
  Slider: {
    label: "Slider",
    mode: "write",
    trigger: "change",
    commits: true,
    fields: {
      binding: "custom",
      label: "text",
      min: "number",
      max: "number",
      step: "number",
      events: "array"
    }
  },
  Switch: {
    label: "Switch",
    mode: "write",
    trigger: "change",
    commits: false,
    fields: { binding: "custom", label: "text", events: "array" }
  },
  Select: {
    label: "Select",
    mode: "write",
    trigger: "change",
    commits: false,
    fields: {
      binding: "custom",
      label: "text",
      options: "array",
      events: "array"
    }
  },
  RadioGroup: {
    label: "Radio Group",
    mode: "write",
    trigger: "change",
    commits: false,
    fields: {
      binding: "custom",
      label: "text",
      options: "array",
      row: "radio",
      events: "array"
    }
  },
  // Writes an array of the checked options, so it binds to a list-typed input.
  CheckboxGroup: {
    label: "Checkbox Group",
    mode: "write",
    trigger: "change",
    commits: false,
    fields: {
      binding: "custom",
      label: "text",
      options: "array",
      row: "radio",
      events: "array"
    }
  },
  // A date control settles on blur, so "on release" pacing is meaningful.
  DateInput: {
    label: "Date Input",
    mode: "write",
    trigger: "change",
    commits: true,
    fields: {
      binding: "custom",
      label: "text",
      withTime: "radio",
      events: "array"
    }
  },
  ImageInput: {
    label: "Image Input",
    mode: "write",
    trigger: "change",
    commits: false,
    fields: { binding: "custom", label: "text", events: "array" }
  },
  AudioInput: {
    label: "Audio Input",
    mode: "write",
    trigger: "change",
    commits: false,
    fields: { binding: "custom", label: "text", events: "array" }
  },
  VideoInput: {
    label: "Video Input",
    mode: "write",
    trigger: "change",
    commits: false,
    fields: { binding: "custom", label: "text", events: "array" }
  },
  DocumentInput: {
    label: "Document Input",
    mode: "write",
    trigger: "change",
    commits: false,
    fields: { binding: "custom", label: "text", events: "array" }
  },
  ColorInput: {
    label: "Color Input",
    mode: "write",
    trigger: "change",
    commits: false,
    fields: { binding: "custom", label: "text", events: "array" }
  },
  // Edits a bound dataframe as a grid. `Table` renders the same shape read-only.
  DataFrameInput: {
    label: "Data Table Input",
    mode: "write",
    trigger: "change",
    commits: true,
    fields: {
      binding: "custom",
      label: "text",
      maxHeight: "number",
      events: "array"
    }
  },
  // Local filesystem paths, for apps driving a workflow that reads off disk.
  FilePathInput: {
    label: "File Path Input",
    mode: "write",
    trigger: "change",
    commits: true,
    fields: {
      binding: "custom",
      label: "text",
      placeholder: "text",
      events: "array"
    }
  },
  FolderPathInput: {
    label: "Folder Path Input",
    mode: "write",
    trigger: "change",
    commits: true,
    fields: {
      binding: "custom",
      label: "text",
      placeholder: "text",
      events: "array"
    }
  },
  Model3DInput: {
    label: "3D Model Input",
    mode: "write",
    trigger: "change",
    commits: false,
    fields: { binding: "custom", label: "text", events: "array" }
  },
  // Writes an `{width, height}` pair, so an app can offer the size its image
  // workflow reads without two coupled number fields.
  ImageSizeInput: {
    label: "Image Size Input",
    mode: "write",
    trigger: "change",
    commits: false,
    fields: { binding: "custom", label: "text", events: "array" }
  },
  // The one widget behind the four list input nodes: `listKind` picks which,
  // rather than four near-identical palette entries.
  MediaListInput: {
    label: "Media List Input",
    mode: "write",
    trigger: "change",
    commits: false,
    fields: {
      binding: "custom",
      label: "text",
      listKind: "select",
      events: "array"
    }
  },
  // Resource widgets address a collection through `resourceBindingId`, not the
  // `binding` token the state widgets carry.
  ResourcePicker: {
    label: "Resource Picker",
    mode: "write",
    trigger: "change",
    commits: false,
    fields: { resourceBindingId: "custom", label: "text" }
  },
  ResourceGallery: {
    label: "Resource Gallery",
    mode: "write",
    trigger: "change",
    commits: false,
    fields: {
      resourceBindingId: "custom",
      label: "text",
      tileSize: "number"
    }
  },
  // Edits the bound document through the resource provider rather than app
  // state, so it emits no event of its own.
  StoryboardSceneList: {
    label: "Storyboard Scenes",
    mode: "write",
    fields: {
      resourceBindingId: "custom",
      label: "text",
      allowRemove: "radio"
    }
  },
  // Chat & AI
  //
  // A chat app is two widgets: the thread shows the conversation so far plus
  // the reply currently streaming in, the composer writes the next message and
  // runs the operation. Both address the same conversation value — the thread
  // reads it, the composer appends to it — which is why the pair carries a
  // second binding beyond `binding`.
  ChatThread: {
    label: "Chat Thread",
    mode: "read",
    bindingProps: [{ prop: "streamBinding", mode: "read" }],
    fields: {
      binding: "custom",
      streamBinding: "custom",
      label: "text",
      maxHeight: "number",
      placeholder: "text"
    }
  },
  ChatComposer: {
    label: "Chat Composer",
    mode: "write",
    trigger: "click",
    bindingProps: [{ prop: "historyBinding", mode: "read" }],
    fields: {
      binding: "custom",
      historyBinding: "custom",
      valueFormat: "select",
      label: "text",
      placeholder: "text",
      sendLabel: "text",
      attachments: "radio",
      events: "array"
    }
  },
  // Writes a model reference — `{type, id, provider, name}` — so an app can
  // offer the model choice its workflow's LLM node reads.
  ModelSelect: {
    label: "Model Select",
    mode: "write",
    trigger: "change",
    commits: false,
    fields: {
      binding: "custom",
      modelKind: "select",
      label: "text",
      events: "array"
    }
  },
  // Actions
  Button: {
    label: "Button",
    mode: "action",
    trigger: "click",
    fields: {
      label: "text",
      variant: "select",
      color: "select",
      events: "array"
    }
  },
  // Layout
  Container: {
    label: "Panel",
    mode: "layout",
    slots: ["content"],
    fields: { title: "text", content: "slot" }
  },
  Columns: {
    label: "Columns",
    mode: "layout",
    slots: ["left", "right"],
    fields: { gap: "number", left: "slot", right: "slot" }
  },
  // Three fixed slots rather than a variable number: Puck fields are declared
  // statically, and three tabs cover what a mini app does without a nested
  // array-of-slots field the agent would have to reason about.
  Tabs: {
    label: "Tabs",
    mode: "layout",
    slots: ["tab1", "tab2", "tab3"],
    fields: {
      tab1Label: "text",
      tab1: "slot",
      tab2Label: "text",
      tab2: "slot",
      tab3Label: "text",
      tab3: "slot"
    }
  },
  Accordion: {
    label: "Accordion",
    mode: "layout",
    slots: ["content"],
    fields: { title: "text", defaultOpen: "radio", content: "slot" }
  },
  Spacer: { label: "Spacer", mode: "layout", fields: { height: "number" } },
  Divider: { label: "Divider", mode: "layout", fields: {} }
};

export const widgetMode = (type: string): WidgetBindingMode | "unknown" =>
  WIDGET_CATALOG[type]?.mode ?? "unknown";

export const isKnownWidget = (type: string): boolean => type in WIDGET_CATALOG;

/**
 * Every field a widget's inspector shows: its own, plus the logic props each
 * non-layout widget shares. Layout widgets carry no bindings and no conditions,
 * so nothing is appended to them.
 *
 * This is what `ui_app_list_component_types` reports, on both the browser
 * surface and the headless eval bridge, so an agent sees one catalog.
 */
export const widgetFields = (
  type: string
): Readonly<Record<string, WidgetFieldKind>> => {
  const descriptor = WIDGET_CATALOG[type];
  if (!descriptor) return {};
  if (descriptor.mode === "layout") return descriptor.fields;
  const fields = {
    ...descriptor.fields,
    visibleWhen: "custom" as const,
    disabledWhen: "custom" as const
  };
  return descriptor.format ? { ...fields, format: "text" as const } : fields;
};

/**
 * Binding-carrying props beyond `binding`, with the mode each resolves in.
 * Empty for every widget that binds once.
 */
export const widgetBindingProps = (
  type: string
): ReadonlyArray<{ prop: string; mode: "read" | "write" }> =>
  WIDGET_CATALOG[type]?.bindingProps ?? [];

/** Slot field names of a widget — the props children nest into. */
export const widgetSlots = (type: string): ReadonlyArray<string> =>
  WIDGET_CATALOG[type]?.slots ?? [];

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
