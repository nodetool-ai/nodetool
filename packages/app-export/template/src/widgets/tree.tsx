/**
 * The widget tree: one renderer per entry in the app-runtime widget catalog,
 * the layout widgets that nest children, and the node wrapper that applies
 * `visibleWhen`, `disabledWhen` and `format` in one place.
 */
import { useState, type ComponentType, type ReactNode } from "react";
import { WIDGET_CATALOG, type AppEvent, type ConditionProps } from "@nodetool-ai/app-runtime";
import { useCondition, useFormatted, useWidgetRuntime } from "../runtime/context";
import {
  AgentActivityWidget,
  AlertWidget,
  ChartWidget,
  CodeBlockWidget,
  DocumentOnlyWidget,
  DownloadWidget,
  FileWidget,
  GalleryWidget,
  HeadingWidget,
  ImageCompareWidget,
  ImageWidget,
  JsonWidget,
  KeyValueWidget,
  ListWidget,
  MarkdownWidget,
  OutputWidget,
  ProgressWidget,
  StatWidget,
  TableWidget,
  TextWidget
} from "./display";
import {
  ApprovalWidget,
  ChatComposerWidget,
  ChatThreadWidget,
  CheckboxGroupWidget,
  ChoiceCardsWidget,
  ColorInputWidget,
  DataFrameInputWidget,
  DateInputWidget,
  ImageSizeInputWidget,
  MediaInputWidget,
  MediaListInputWidget,
  ModelSelectWidget,
  NumberInputWidget,
  PathInputWidget,
  RadioGroupWidget,
  SelectWidget,
  SliderWidget,
  StepperWidget,
  SwitchWidget,
  TextInputWidget,
  WorkflowFormWidget,
  WorkflowInputWidget
} from "./inputs";
import { Placeholder, isRecord, numOr, str, type ComponentNode, type WidgetProps } from "./shared";

function ButtonWidget(widget: WidgetProps): ReactNode {
  const { emit, running } = useWidgetRuntime({ ...widget, bindingMode: "none" });
  const variant = str(widget.props.variant);
  const color = str(widget.props.color);
  const runs = (widget.events ?? []).some((event) => !event.kind || event.kind === "run");
  const classes = [
    "nt-button",
    variant === "outlined" ? "nt-button-outlined" : variant === "text" ? "nt-button-text" : "",
    color ? `nt-color-${color}` : "",
    widget.props.fullWidth === true || widget.props.fullWidth === "yes" ? "nt-full" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const align = str(widget.props.align);
  return (
    <div className="nt-button-row" style={align ? { justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start" } : undefined}>
      <button
        type="button"
        className={classes}
        disabled={widget.disabled || (runs && running)}
        aria-busy={running}
        onClick={() => emit("click")}
      >
        {running && runs ? <span className="nt-spinner" aria-hidden /> : null}
        {str(widget.props.label) || "Run"}
      </button>
    </div>
  );
}

function ContainerWidget(widget: WidgetProps): ReactNode {
  const title = str(widget.props.title);
  const columns = numOr(widget.props.columns, 1);
  return (
    <section className={`nt-panel nt-panel-${str(widget.props.variant) || "default"}`}>
      {title ? <h3 className="nt-panel-title">{title}</h3> : null}
      <ComponentList
        nodes={slotNodes(widget.props.content)}
        style={columns > 1 ? { display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
      />
    </section>
  );
}

const COLUMN_LAYOUTS: Record<string, string> = {
  "50-50": "1fr 1fr",
  "33-67": "1fr 2fr",
  "67-33": "2fr 1fr",
  "25-75": "1fr 3fr",
  "75-25": "3fr 1fr",
  "40-60": "2fr 3fr",
  "60-40": "3fr 2fr"
};

function ColumnsWidget(widget: WidgetProps): ReactNode {
  const template = COLUMN_LAYOUTS[str(widget.props.layout)] ?? "1fr 1fr";
  return (
    <div className="nt-columns" style={{ gridTemplateColumns: template, gap: numOr(widget.props.gap, 24) }}>
      <ComponentList nodes={slotNodes(widget.props.left)} />
      <ComponentList nodes={slotNodes(widget.props.right)} />
    </div>
  );
}

function TabsWidget(widget: WidgetProps): ReactNode {
  const panes = (["tab1", "tab2", "tab3"] as const)
    .map((key) => ({ key, label: str(widget.props[`${key}Label`]), nodes: slotNodes(widget.props[key]) }))
    .filter((pane) => pane.label.trim() !== "");
  const [active, setActive] = useState<string>("tab1");
  const current = panes.some((pane) => pane.key === active) ? active : panes[0]?.key;
  if (panes.length === 0) return null;
  return (
    <div className="nt-field">
      <div className="nt-tabs" role="tablist">
        {panes.map((pane) => (
          <button
            key={pane.key}
            type="button"
            role="tab"
            aria-selected={pane.key === current}
            className={`nt-tab${pane.key === current ? " nt-selected" : ""}`}
            onClick={() => setActive(pane.key)}
          >
            {pane.label}
          </button>
        ))}
      </div>
      {panes.map((pane) => (
        // Hidden rather than unmounted, so a pane's state survives switching.
        <div key={pane.key} role="tabpanel" hidden={pane.key !== current}>
          <ComponentList nodes={pane.nodes} />
        </div>
      ))}
    </div>
  );
}

function AccordionWidget(widget: WidgetProps): ReactNode {
  const open = widget.props.defaultOpen !== false && widget.props.defaultOpen !== "no";
  return (
    <details className="nt-panel" open={open}>
      <summary className="nt-panel-title">{str(widget.props.title) || "Section"}</summary>
      <ComponentList nodes={slotNodes(widget.props.content)} />
    </details>
  );
}

const NeedsNodeTool = ({ label }: { label: string }): ReactNode => (
  <Placeholder text={`${label} works inside NodeTool only.`} />
);

const RENDERERS: Record<string, ComponentType<WidgetProps>> = {
  Heading: HeadingWidget,
  Text: TextWidget,
  Markdown: MarkdownWidget,
  Image: ImageWidget,
  Audio: OutputWidget,
  Video: OutputWidget,
  Json: JsonWidget,
  Output: OutputWidget,
  Sketch: (props) => <DocumentOnlyWidget {...props} title="Sketch" />,
  Timeline: (props) => <DocumentOnlyWidget {...props} title="Timeline" />,
  Storyboard: (props) => <DocumentOnlyWidget {...props} title="Storyboard" />,
  StoryboardPreview: (props) => <DocumentOnlyWidget {...props} title="Storyboard" />,
  Table: TableWidget,
  Progress: ProgressWidget,
  AgentActivity: AgentActivityWidget,
  Alert: AlertWidget,
  CodeBlock: CodeBlockWidget,
  List: ListWidget,
  KeyValue: KeyValueWidget,
  Stat: StatWidget,
  Download: DownloadWidget,
  Model3D: (props) => <FileWidget {...props} title="3D model" />,
  Chart: ChartWidget,
  PDF: (props) => <FileWidget {...props} title="PDF" />,
  Gallery: GalleryWidget,
  ImageCompare: ImageCompareWidget,
  ChoiceCards: ChoiceCardsWidget,
  Stepper: StepperWidget,
  Approval: ApprovalWidget,
  WorkflowForm: WorkflowFormWidget,
  WorkflowInput: WorkflowInputWidget,
  TextInput: TextInputWidget,
  NumberInput: NumberInputWidget,
  Slider: SliderWidget,
  Switch: SwitchWidget,
  Select: SelectWidget,
  RadioGroup: RadioGroupWidget,
  CheckboxGroup: CheckboxGroupWidget,
  DateInput: DateInputWidget,
  ImageInput: (props) => <MediaInputWidget {...props} kind="image" />,
  SketchPad: (props) => (
    <MediaInputWidget {...props} kind="image" note="Drawing works inside NodeTool. Pick an image instead." />
  ),
  AudioInput: (props) => <MediaInputWidget {...props} kind="audio" />,
  VideoInput: (props) => <MediaInputWidget {...props} kind="video" />,
  AudioRecorder: (props) => <MediaInputWidget {...props} kind="audio" capture />,
  CameraCapture: (props) => <MediaInputWidget {...props} kind="video" capture />,
  DocumentInput: (props) => <MediaInputWidget {...props} kind="document" />,
  ColorInput: ColorInputWidget,
  DataFrameInput: DataFrameInputWidget,
  FilePathInput: (props) => <PathInputWidget {...props} kind="file" />,
  FolderPathInput: (props) => <PathInputWidget {...props} kind="folder" />,
  Model3DInput: (props) => <MediaInputWidget {...props} kind="model_3d" />,
  ImageSizeInput: ImageSizeInputWidget,
  MediaListInput: MediaListInputWidget,
  ResourcePicker: () => <NeedsNodeTool label="Picking a NodeTool document" />,
  ResourceGallery: () => <NeedsNodeTool label="Browsing NodeTool documents" />,
  StoryboardSceneList: () => <NeedsNodeTool label="Editing storyboard scenes" />,
  ChatThread: ChatThreadWidget,
  ChatComposer: ChatComposerWidget,
  ModelSelect: ModelSelectWidget,
  Button: ButtonWidget,
  Container: ContainerWidget,
  Columns: ColumnsWidget,
  Tabs: TabsWidget,
  Accordion: AccordionWidget,
  Spacer: (widget) => <div style={{ height: numOr(widget.props.height, 24) }} />,
  Divider: () => <hr className="nt-divider" />
};

/** Every catalog type this project can render; the exporter checks it. */
export const RENDERED_WIDGET_TYPES: ReadonlyArray<string> = Object.keys(RENDERERS);

export const slotNodes = (value: unknown): ComponentNode[] =>
  Array.isArray(value)
    ? value.filter(
        (node): node is ComponentNode => isRecord(node) && typeof node.type === "string" && isRecord(node.props)
      )
    : [];

function WidgetNode({ node }: { node: ComponentNode }): ReactNode {
  const props = node.props;
  const visible = useCondition(props.visibleWhen as ConditionProps | undefined, true);
  const disabled = useCondition(props.disabledWhen as ConditionProps | undefined, false);
  const formatted = useFormatted(typeof props.format === "string" ? props.format : undefined);
  const Renderer = RENDERERS[node.type];
  if (!Renderer) {
    const label = WIDGET_CATALOG[node.type]?.label ?? node.type;
    return <NeedsNodeTool label={label} />;
  }
  if (!visible) return null;
  return (
    <Renderer
      id={str(props.id)}
      binding={typeof props.binding === "string" ? props.binding : undefined}
      events={Array.isArray(props.events) ? (props.events as AppEvent[]) : undefined}
      {...(formatted !== null ? { formattedValue: formatted } : {})}
      disabled={disabled}
      props={props}
    />
  );
}

export function ComponentList({
  nodes,
  style
}: {
  nodes: ComponentNode[];
  style?: React.CSSProperties;
}): ReactNode {
  return (
    <div className="nt-stack" style={style}>
      {nodes.map((node, index) => (
        <WidgetNode key={str(node.props.id) || `${node.type}-${index}`} node={node} />
      ))}
    </div>
  );
}
