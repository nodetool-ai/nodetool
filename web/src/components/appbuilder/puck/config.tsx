/** @jsxImportSource @emotion/react */
import React from "react";
import type { Config, ArrayField, Field } from "@puckeditor/core";
import type { Theme } from "@mui/material/styles";
import type { SystemCssProperties } from "@mui/system";

import {
  Box,
  Text,
  FlexColumn,
  SPACING,
  SPACING_PX
} from "../../ui_primitives";
import { APP_THEMES, appThemeFrame, resolveAppTheme } from "../appThemes";
import { useAppRuntimeContext } from "../runtime/AppRuntimeContext";
import {
  bindingField,
  conditionField,
  operationField,
  resourceBindingField,
  variableField
} from "./fields";
import { withConditions } from "./conditionalWidget";
import {
  HeadingWidget,
  TextWidget,
  MarkdownWidget,
  ImageWidget,
  AudioWidget,
  VideoWidget,
  JsonWidget,
  TableWidget,
  OutputWidget,
  ProgressWidget,
  TextInputWidget,
  NumberInputWidget,
  SliderWidget,
  SwitchWidget,
  SelectWidget,
  ButtonWidget,
  ContainerWidget,
  ColumnsWidget,
  DividerWidget,
  AlertWidget,
  CodeBlockWidget,
  ListWidget,
  KeyValueWidget,
  StatWidget,
  DownloadWidget,
  RadioGroupWidget,
  CheckboxGroupWidget,
  DateInputWidget,
  TabsWidget,
  AccordionWidget,
  SpacerWidget
} from "./widgets";
import { ResourcePickerWidget } from "./ResourcePickerWidget";
import { ResourceGalleryWidget } from "./ResourceGalleryWidget";
import { StoryboardSceneListWidget } from "./StoryboardSceneListWidget";
import {
  WorkflowInputWidget,
  FixedKindInputWidget,
  FixedInputKind,
  FixedInputWidgetProps,
  ModelSelectWidget
} from "./WorkflowInputWidget";
import { ChatThreadWidget, ChatComposerWidget } from "./ChatWidgets";
import { SketchWidget, TimelineWidget } from "./DocumentWidgets";
import { SketchPadWidget } from "./SketchPadWidget";
import { GalleryWidget, Model3DWidget, PDFWidget } from "./MediaWidgets";
import { ImageComparerWidget } from "./ImageComparerWidget";
import { WorkflowFormWidget } from "./WorkflowFormWidget";
import {
  AudioRecorderWidget,
  CameraCaptureWidget
} from "./RecorderWidgets";
import { ChartWidget } from "./ChartWidget";

const ACTION_OPTIONS = [
  { label: "Run workflow", value: "run" },
  { label: "Cancel run", value: "cancel" },
  { label: "Set variable", value: "setVariable" },
  { label: "Toggle variable", value: "toggleVariable" }
];

/**
 * The three declarative logic props every widget accepts. Conditions and the
 * format template are the whole logic surface of the app layer — everything
 * else is a node in the graph.
 */
/** The declarative logic props every widget accepts. */
type ConditionalFields = {
  visibleWhen: Field;
  disabledWhen: Field;
  format?: { type: "text"; label: string };
};

/** A new event row's defaults; `pace` only on a change event. */
type EventItemDefaults = {
  trigger: "click" | "change";
  kind: string;
  key: string;
  value: string;
  pace?: string;
};

const conditionalFields = ({ format = true }: { format?: boolean } = {}) => {
  const fields: ConditionalFields = {
    visibleWhen: conditionField("Visible when"),
    disabledWhen: conditionField("Disabled when")
  };
  if (format) {
    fields.format = {
      type: "text",
      label:
        "Format ({binding} · number:2 · date:short · upper · lower · join:, · truncate:80)"
    };
  }
  return fields;
};

const PACE_OPTIONS = [
  { label: "Live", value: "live" },
  { label: "On release", value: "release" },
  { label: "Debounced", value: "debounce" }
];

// "On release" only fires for widgets that emit a settled/commit phase (slider
// release, input blur). Discrete controls — WorkflowInput, media/color pickers,
// Switch, Select — emit only "change", so offering release there would silently
// disable the action. They get Live/Debounced only.
const PACE_OPTIONS_NO_RELEASE = PACE_OPTIONS.filter(
  (o) => o.value !== "release"
);

/** Array field describing a widget's events (each item dispatches an action). */
const eventsField = (
  trigger: "click" | "change",
  { commits = true }: { commits?: boolean } = {}
): ArrayField => {
  // Field order is the editor's field order, so each one is assigned in place.
  const arrayFields: ArrayField["arrayFields"] = {
    kind: { type: "select", label: "Action", options: ACTION_OPTIONS }
  };
  // Pacing throttles a run on continuous change (slider drag, typing); it has
  // no meaning for a one-shot click, so it only appears on change events.
  if (trigger === "change") {
    arrayFields.pace = {
      type: "select",
      label: "Pacing",
      options: commits ? PACE_OPTIONS : PACE_OPTIONS_NO_RELEASE
    };
  }
  arrayFields.key = variableField("State variable");
  arrayFields.value = { type: "text", label: "Value" };
  // Which workflow a run/cancel drives. Only rendered by a multi-operation
  // app; otherwise the event runs the app's sole operation.
  arrayFields.operationId = operationField("Operation");

  const defaultItemProps: EventItemDefaults = {
    trigger,
    kind: "run",
    key: "",
    value: ""
  };
  if (trigger === "change") defaultItemProps.pace = "live";

  return {
    type: "array",
    label: trigger === "click" ? "On click" : "On change",
    arrayFields,
    defaultItemProps,
    getItemSummary: (item: Record<string, unknown>) =>
      String(item.kind ?? "action")
  };
};

const optionsField: ArrayField = {
  type: "array",
  label: "Options",
  arrayFields: { value: { type: "text", label: "Option" } },
  defaultItemProps: { value: "Option" },
  getItemSummary: (item: Record<string, unknown>) =>
    String(item.value ?? "option")
};

/**
 * The fields every fixed-kind input shares. `extra` slots a widget's own field
 * (a path's placeholder, a table's height) between the label and the events.
 */
const fixedInputFields = (extra: Record<string, Field> = {}) => ({
  binding: bindingField("write", "Workflow input"),
  label: { type: "text" as const, label: "Label" },
  ...extra,
  events: eventsField("change", { commits: false }),
  ...conditionalFields({ format: false })
});

/** Palette entry for a standalone input of a fixed kind. */
const fixedInputEntry = (label: string, kind: FixedInputKind) => ({
  label,
  fields: fixedInputFields(),
  defaultProps: { binding: "", label: "" },
  render: withConditions((props: FixedInputWidgetProps) => (
    <FixedKindInputWidget {...props} kind={kind} />
  ))
});

/** Palette entry for a path input — its placeholder becomes the control's hint. */
const pathInputEntry = (
  label: string,
  kind: Extract<FixedInputKind, "file_path" | "folder_path">,
  placeholder: string
) => ({
  label,
  fields: fixedInputFields({
    placeholder: { type: "text" as const, label: "Placeholder" }
  }),
  defaultProps: { binding: "", label: "", placeholder },
  render: withConditions((props: FixedInputWidgetProps) => (
    <FixedKindInputWidget {...props} kind={kind} />
  ))
});

/** Which list input a MediaListInput binds. */
const LIST_KINDS: Record<
  string,
  Extract<
    FixedInputKind,
    "image_list" | "video_list" | "audio_list" | "text_list"
  >
> = {
  image_list: "image_list",
  video_list: "video_list",
  audio_list: "audio_list",
  text_list: "text_list"
};

/**
 * The app page. Its theme comes from the root prop the author picked, falling
 * back to what the document declares (`ApplicationDocument.theme`) — the shell
 * keeps the two in step, and the fallback is what makes a document authored
 * through the API render with its theme.
 */
const AppRoot: React.FC<{
  title?: string;
  theme?: string;
  children?: React.ReactNode;
}> = ({ title, theme, children }) => {
  const { theme: documentTheme } = useAppRuntimeContext();
  const appTheme = resolveAppTheme(theme ?? documentTheme);
  const widthSx: SystemCssProperties<Theme> = {};
  if (appTheme.maxWidth) {
    widthSx.maxWidth = appTheme.maxWidth;
    widthSx.mx = "auto";
  }
  const frameSx = {
    width: "100%",
    ...widthSx,
    ...appThemeFrame(appTheme),
    // The root zone renders as a single direct div in both the editor
    // (Puck's DropZone) and the runtime (a plain wrapper div); style
    // its children as a gapped flex column so top-level widgets get
    // the same vertical rhythm as slot contents (see slotStack in
    // widgets.tsx) in both surfaces.
    "& > div": {
      display: "flex",
      flexDirection: "column",
      gap: `${SPACING_PX.xxl}px`,
      width: "100%"
    }
  };
  return (
    <Box
      sx={{
        p: appTheme.padding,
        minHeight: "100%",
        backgroundColor: appTheme.surface,
        color: "text.primary",
        // Width-responsive widgets (Columns) query this container, so the
        // editor canvas and the published app share one layout per width.
        containerType: "inline-size"
      }}
    >
      <FlexColumn gap={SPACING.xxl} sx={frameSx}>
        {title ? (
          <Text size="big" weight={600}>
            {title}
          </Text>
        ) : null}
        {children}
      </FlexColumn>
    </Box>
  );
};

// `Config` is intentionally loosely typed (DefaultComponents): Puck injects
// `id`/`puck` into render props, and our widget components take optional props.
export const appConfig: Config = {
  root: {
    fields: {
      title: { type: "text", label: "App title" },
      theme: {
        type: "select",
        label: "Theme",
        options: APP_THEMES.map((theme) => ({
          label: theme.label,
          value: theme.id
        }))
      }
    },
    render: ({
      children,
      title,
      theme
    }: {
      children?: React.ReactNode;
      title?: string;
      theme?: string;
    }) => (
      <AppRoot title={title} theme={theme}>
        {children}
      </AppRoot>
    )
  },
  categories: {
    inputs: {
      title: "Inputs",
      components: [
        "WorkflowForm",
        "WorkflowInput",
        "TextInput",
        "NumberInput",
        "Slider",
        "Switch",
        "Select",
        "RadioGroup",
        "CheckboxGroup",
        "DateInput",
        "ResourcePicker",
        "ResourceGallery",
        "StoryboardSceneList",
        "ImageInput",
        "SketchPad",
        "AudioInput",
        "AudioRecorder",
        "VideoInput",
        "CameraCapture",
        "DocumentInput",
        "ColorInput",
        "DataFrameInput",
        "FilePathInput",
        "FolderPathInput",
        "Model3DInput",
        "ImageSizeInput",
        "MediaListInput"
      ]
    },
    ai: {
      title: "Chat & AI",
      components: ["ChatThread", "ChatComposer", "ModelSelect"]
    },
    actions: { title: "Actions", components: ["Button"] },
    display: {
      title: "Display",
      components: [
        "Heading",
        "Text",
        "Markdown",
        "Image",
        "Audio",
        "Video",
        "Sketch",
        "Timeline",
        "Json",
        "Table",
        "List",
        "KeyValue",
        "Output",
        "Progress",
        "Stat",
        "Alert",
        "CodeBlock",
        "Download",
        "Model3D",
        "Chart",
        "PDF",
        "Gallery",
        "ImageCompare"
      ]
    },
    layout: {
      title: "Layout",
      components: [
        "Container",
        "Columns",
        "Tabs",
        "Accordion",
        "Divider",
        "Spacer"
      ]
    }
  },
  components: {
    // ── Display ──
    Heading: {
      label: "Heading",
      fields: {
        text: { type: "text", label: "Text" },
        level: {
          type: "select",
          label: "Level",
          options: [
            { label: "H1", value: "1" },
            { label: "H2", value: "2" },
            { label: "H3", value: "3" }
          ]
        },
        binding: bindingField("read"),
        ...conditionalFields()
      },
      defaultProps: { text: "Heading", level: "1" },
      render: withConditions((props) => <HeadingWidget {...props} />)
    },
    Text: {
      label: "Text",
      fields: {
        text: { type: "textarea", label: "Text" },
        binding: bindingField("read"),
        ...conditionalFields()
      },
      defaultProps: { text: "Text block" },
      render: withConditions((props) => <TextWidget {...props} />)
    },
    Markdown: {
      label: "Markdown",
      fields: {
        text: { type: "textarea", label: "Markdown" },
        binding: bindingField("read"),
        ...conditionalFields()
      },
      defaultProps: { text: "**Markdown** content" },
      render: withConditions((props) => <MarkdownWidget {...props} />)
    },
    Image: {
      label: "Image",
      fields: {
        binding: bindingField("read"),
        fit: {
          type: "select",
          label: "Fit",
          options: [
            { label: "Contain", value: "contain" },
            { label: "Cover", value: "cover" }
          ]
        },
        height: { type: "number", label: "Height (px)" },
        placeholder: { type: "text", label: "Placeholder" },
        ...conditionalFields({ format: false })
      },
      defaultProps: { fit: "contain", height: 240, placeholder: "No image" },
      render: withConditions((props) => <ImageWidget {...props} />)
    },
    Audio: {
      label: "Audio",
      fields: {
        binding: bindingField("read"),
        placeholder: { type: "text", label: "Placeholder" },
        ...conditionalFields({ format: false })
      },
      defaultProps: { placeholder: "No audio yet" },
      render: withConditions((props) => <AudioWidget {...props} />)
    },
    Video: {
      label: "Video",
      fields: {
        binding: bindingField("read"),
        height: { type: "number", label: "Max height (px)" },
        placeholder: { type: "text", label: "Placeholder" },
        ...conditionalFields({ format: false })
      },
      defaultProps: { height: 320, placeholder: "No video yet" },
      render: withConditions((props) => <VideoWidget {...props} />)
    },
    Sketch: {
      label: "Sketch",
      fields: {
        binding: bindingField("read"),
        height: { type: "number", label: "Max height (px)" },
        showDimensions: {
          type: "radio",
          label: "Show size",
          options: [
            { label: "Hide", value: false },
            { label: "Show", value: true }
          ]
        },
        placeholder: { type: "text", label: "Placeholder" },
        ...conditionalFields({ format: false })
      },
      defaultProps: {
        height: 360,
        showDimensions: false,
        placeholder: "No sketch yet"
      },
      render: withConditions((props) => <SketchWidget {...props} />)
    },
    Timeline: {
      label: "Timeline",
      fields: {
        binding: bindingField("read"),
        height: { type: "number", label: "Max height (px)" },
        showMetadata: {
          type: "radio",
          label: "Show metadata",
          options: [
            { label: "Hide", value: false },
            { label: "Show", value: true }
          ]
        },
        placeholder: { type: "text", label: "Placeholder" },
        ...conditionalFields({ format: false })
      },
      defaultProps: {
        height: 360,
        showMetadata: true,
        placeholder: "No timeline yet"
      },
      render: withConditions((props) => <TimelineWidget {...props} />)
    },
    Json: {
      label: "JSON",
      fields: { binding: bindingField("read"), ...conditionalFields() },
      defaultProps: {},
      render: withConditions((props) => <JsonWidget {...props} />)
    },
    Table: {
      label: "Table",
      fields: {
        binding: bindingField("read"),
        label: { type: "text", label: "Label" },
        maxHeight: { type: "number", label: "Max height (px)" },
        placeholder: { type: "text", label: "Placeholder" },
        ...conditionalFields({ format: false })
      },
      defaultProps: { label: "", placeholder: "No rows yet" },
      render: withConditions((props) => <TableWidget {...props} />)
    },
    Output: {
      label: "Output",
      fields: {
        binding: bindingField("read"),
        placeholder: { type: "text", label: "Placeholder" },
        ...conditionalFields()
      },
      defaultProps: { placeholder: "Your result appears here" },
      render: withConditions((props) => <OutputWidget {...props} />)
    },
    Progress: {
      label: "Progress",
      fields: {
        label: { type: "text", label: "Label" },
        binding: bindingField("read"),
        ...conditionalFields({ format: false })
      },
      defaultProps: { label: "" },
      render: withConditions((props) => <ProgressWidget {...props} />)
    },
    List: {
      label: "List",
      fields: {
        binding: bindingField("read"),
        label: { type: "text", label: "Label" },
        ordered: {
          type: "radio",
          label: "Numbered",
          options: [
            { label: "No", value: false },
            { label: "Yes", value: true }
          ]
        },
        placeholder: { type: "text", label: "Placeholder" },
        ...conditionalFields()
      },
      defaultProps: { label: "", ordered: false, placeholder: "No items yet" },
      render: withConditions((props) => <ListWidget {...props} />)
    },
    KeyValue: {
      label: "Key/Value",
      fields: {
        binding: bindingField("read"),
        label: { type: "text", label: "Label" },
        placeholder: { type: "text", label: "Placeholder" },
        ...conditionalFields({ format: false })
      },
      defaultProps: { label: "", placeholder: "No values yet" },
      render: withConditions((props) => <KeyValueWidget {...props} />)
    },
    Stat: {
      label: "Stat",
      fields: {
        binding: bindingField("read"),
        label: { type: "text", label: "Label" },
        caption: { type: "text", label: "Caption" },
        placeholder: { type: "text", label: "Placeholder" },
        ...conditionalFields()
      },
      defaultProps: { label: "Total", caption: "", placeholder: "—" },
      render: withConditions((props) => <StatWidget {...props} />)
    },
    Alert: {
      label: "Alert",
      fields: {
        binding: bindingField("read"),
        text: { type: "textarea", label: "Text" },
        title: { type: "text", label: "Title" },
        severity: {
          type: "select",
          label: "Severity",
          options: [
            { label: "Info", value: "info" },
            { label: "Success", value: "success" },
            { label: "Warning", value: "warning" },
            { label: "Error", value: "error" }
          ]
        },
        ...conditionalFields()
      },
      defaultProps: { text: "", title: "", severity: "info" },
      render: withConditions((props) => <AlertWidget {...props} />)
    },
    CodeBlock: {
      label: "Code",
      fields: {
        binding: bindingField("read"),
        text: { type: "textarea", label: "Code" },
        language: { type: "text", label: "Language label" },
        maxHeight: { type: "number", label: "Max height (px)" },
        ...conditionalFields()
      },
      defaultProps: { text: "", language: "" },
      render: withConditions((props) => <CodeBlockWidget {...props} />)
    },
    Download: {
      label: "Download",
      fields: {
        binding: bindingField("read"),
        label: { type: "text", label: "Label" },
        filename: { type: "text", label: "File name" },
        placeholder: { type: "text", label: "Placeholder" },
        ...conditionalFields({ format: false })
      },
      defaultProps: {
        label: "Download",
        filename: "",
        placeholder: "Nothing to download yet"
      },
      render: withConditions((props) => <DownloadWidget {...props} />)
    },
    Model3D: {
      label: "3D Model",
      fields: {
        binding: bindingField("read"),
        height: { type: "number", label: "Height (px)" },
        placeholder: { type: "text", label: "Placeholder" },
        ...conditionalFields({ format: false })
      },
      defaultProps: { height: 320, placeholder: "No 3D model yet" },
      render: withConditions((props) => <Model3DWidget {...props} />)
    },
    Chart: {
      label: "Chart",
      fields: {
        binding: bindingField("read"),
        label: { type: "text", label: "Label" },
        chartKind: {
          type: "select",
          label: "Chart type",
          options: [
            { label: "Line", value: "line" },
            { label: "Bar", value: "bar" },
            { label: "Scatter", value: "scatter" },
            { label: "Pie", value: "pie" }
          ]
        },
        height: { type: "number", label: "Height (px)" },
        placeholder: { type: "text", label: "Placeholder" },
        ...conditionalFields({ format: false })
      },
      defaultProps: {
        label: "",
        chartKind: "line",
        height: 320,
        placeholder: "Nothing to plot yet"
      },
      render: withConditions((props) => <ChartWidget {...props} />)
    },
    PDF: {
      label: "PDF",
      fields: {
        binding: bindingField("read"),
        height: { type: "number", label: "Height (px)" },
        placeholder: { type: "text", label: "Placeholder" },
        ...conditionalFields({ format: false })
      },
      defaultProps: { height: 480, placeholder: "No document yet" },
      render: withConditions((props) => <PDFWidget {...props} />)
    },
    Gallery: {
      label: "Gallery",
      fields: {
        binding: bindingField("read"),
        selectionBinding: bindingField("write", "Selection"),
        label: { type: "text", label: "Label" },
        tileSize: { type: "number", label: "Tile size (px)" },
        placeholder: { type: "text", label: "Placeholder" },
        events: eventsField("change", { commits: false }),
        ...conditionalFields({ format: false })
      },
      defaultProps: {
        label: "",
        tileSize: 140,
        placeholder: "Nothing to show yet"
      },
      render: withConditions((props) => <GalleryWidget {...props} />)
    },
    ImageCompare: {
      label: "Image Compare",
      fields: {
        binding: bindingField("read", "Before"),
        compareBinding: bindingField("read", "After"),
        label: { type: "text", label: "Label" },
        height: { type: "number", label: "Max height (px)" },
        placeholder: { type: "text", label: "Placeholder" },
        ...conditionalFields({ format: false })
      },
      defaultProps: {
        label: "",
        height: 320,
        placeholder: "Nothing to compare yet"
      },
      render: withConditions((props) => <ImageComparerWidget {...props} />)
    },
    // ── Inputs ──
    WorkflowForm: {
      label: "Workflow Form",
      fields: {
        operationId: operationField("Operation"),
        label: { type: "text", label: "Label" },
        showDescriptions: {
          type: "radio",
          label: "Descriptions",
          options: [
            { label: "Show", value: "yes" },
            { label: "Hide", value: "no" }
          ]
        },
        events: eventsField("change", { commits: false }),
        ...conditionalFields({ format: false })
      },
      defaultProps: { label: "", showDescriptions: "yes" },
      render: withConditions((props) => <WorkflowFormWidget {...props} />)
    },
    WorkflowInput: {
      label: "Workflow Input",
      fields: {
        binding: bindingField("write", "Workflow input"),
        label: { type: "text", label: "Label" },
        events: eventsField("change", { commits: false }),
        ...conditionalFields({ format: false })
      },
      defaultProps: { binding: "", label: "" },
      render: withConditions((props) => <WorkflowInputWidget {...props} />)
    },
    TextInput: {
      label: "Text Input",
      fields: {
        binding: bindingField("write"),
        label: { type: "text", label: "Label" },
        placeholder: { type: "text", label: "Placeholder" },
        multiline: {
          type: "radio",
          label: "Multiline",
          options: [
            { label: "No", value: false },
            { label: "Yes", value: true }
          ]
        },
        events: eventsField("change"),
        ...conditionalFields({ format: false })
      },
      defaultProps: { label: "Text", placeholder: "", multiline: false },
      render: withConditions((props) => <TextInputWidget {...props} />)
    },
    NumberInput: {
      label: "Number Input",
      fields: {
        binding: bindingField("write"),
        label: { type: "text", label: "Label" },
        min: { type: "number", label: "Min" },
        max: { type: "number", label: "Max" },
        step: { type: "number", label: "Step" },
        events: eventsField("change"),
        ...conditionalFields({ format: false })
      },
      defaultProps: { label: "Number", min: 0, max: 100, step: 1 },
      render: withConditions((props) => <NumberInputWidget {...props} />)
    },
    Slider: {
      label: "Slider",
      fields: {
        binding: bindingField("write"),
        label: { type: "text", label: "Label" },
        min: { type: "number", label: "Min" },
        max: { type: "number", label: "Max" },
        step: { type: "number", label: "Step" },
        events: eventsField("change"),
        ...conditionalFields({ format: false })
      },
      defaultProps: { label: "Slider", min: 0, max: 100, step: 1 },
      render: withConditions((props) => <SliderWidget {...props} />)
    },
    Switch: {
      label: "Switch",
      fields: {
        binding: bindingField("write"),
        label: { type: "text", label: "Label" },
        events: eventsField("change", { commits: false }),
        ...conditionalFields({ format: false })
      },
      defaultProps: { label: "Toggle" },
      render: withConditions((props) => <SwitchWidget {...props} />)
    },
    Select: {
      label: "Select",
      fields: {
        binding: bindingField("write"),
        label: { type: "text", label: "Label" },
        options: optionsField,
        events: eventsField("change", { commits: false }),
        ...conditionalFields({ format: false })
      },
      defaultProps: {
        label: "Select",
        options: [{ value: "Option A" }, { value: "Option B" }]
      },
      render: withConditions((props) => <SelectWidget {...props} />)
    },
    RadioGroup: {
      label: "Radio Group",
      fields: {
        binding: bindingField("write"),
        label: { type: "text", label: "Label" },
        options: optionsField,
        row: {
          type: "radio",
          label: "Layout",
          options: [
            { label: "Stacked", value: false },
            { label: "Inline", value: true }
          ]
        },
        events: eventsField("change", { commits: false }),
        ...conditionalFields({ format: false })
      },
      defaultProps: {
        label: "Choose",
        row: false,
        options: [{ value: "Option A" }, { value: "Option B" }]
      },
      render: withConditions((props) => <RadioGroupWidget {...props} />)
    },
    CheckboxGroup: {
      label: "Checkbox Group",
      fields: {
        binding: bindingField("write"),
        label: { type: "text", label: "Label" },
        options: optionsField,
        row: {
          type: "radio",
          label: "Layout",
          options: [
            { label: "Stacked", value: false },
            { label: "Inline", value: true }
          ]
        },
        events: eventsField("change", { commits: false }),
        ...conditionalFields({ format: false })
      },
      defaultProps: {
        label: "Select any",
        row: false,
        options: [{ value: "Option A" }, { value: "Option B" }]
      },
      render: withConditions((props) => <CheckboxGroupWidget {...props} />)
    },
    DateInput: {
      label: "Date Input",
      fields: {
        binding: bindingField("write"),
        label: { type: "text", label: "Label" },
        withTime: {
          type: "radio",
          label: "Include time",
          options: [
            { label: "No", value: false },
            { label: "Yes", value: true }
          ]
        },
        events: eventsField("change"),
        ...conditionalFields({ format: false })
      },
      defaultProps: { label: "Date", withTime: false },
      render: withConditions((props) => <DateInputWidget {...props} />)
    },
    ResourcePicker: {
      label: "Resource Picker",
      fields: {
        resourceBindingId: resourceBindingField(),
        label: { type: "text", label: "Label" },
        ...conditionalFields({ format: false })
      },
      defaultProps: { resourceBindingId: "", label: "" },
      render: withConditions((props) => <ResourcePickerWidget {...props} />)
    },
    ResourceGallery: {
      label: "Resource Gallery",
      fields: {
        resourceBindingId: resourceBindingField(),
        label: { type: "text", label: "Label" },
        tileSize: { type: "number", label: "Tile size (px)" },
        ...conditionalFields({ format: false })
      },
      defaultProps: { resourceBindingId: "", label: "", tileSize: 140 },
      render: withConditions((props) => <ResourceGalleryWidget {...props} />)
    },
    StoryboardSceneList: {
      label: "Storyboard Scenes",
      fields: {
        resourceBindingId: resourceBindingField(),
        label: { type: "text", label: "Label" },
        allowRemove: {
          type: "radio",
          label: "Allow remove",
          options: [
            { label: "No", value: false },
            { label: "Yes", value: true }
          ]
        },
        ...conditionalFields({ format: false })
      },
      defaultProps: {
        resourceBindingId: "",
        label: "",
        allowRemove: true
      },
      render: withConditions((props) => (
        <StoryboardSceneListWidget {...props} />
      ))
    },
    // ── Chat & AI ──
    ChatThread: {
      label: "Chat Thread",
      fields: {
        binding: bindingField("read", "Conversation"),
        streamBinding: bindingField("read", "Live reply"),
        label: { type: "text", label: "Label" },
        maxHeight: { type: "number", label: "Max height (px)" },
        placeholder: { type: "text", label: "Placeholder" },
        ...conditionalFields({ format: false })
      },
      defaultProps: {
        binding: "",
        streamBinding: "",
        label: "",
        maxHeight: 360,
        placeholder: "No messages yet"
      },
      render: withConditions((props) => <ChatThreadWidget {...props} />)
    },
    ChatComposer: {
      label: "Chat Composer",
      fields: {
        binding: bindingField("write", "Sends to"),
        historyBinding: variableField("Conversation variable"),
        valueFormat: {
          type: "select",
          label: "Sends",
          options: [
            { label: "Message text", value: "text" },
            { label: "Message object", value: "message" },
            { label: "Whole conversation", value: "history" }
          ]
        },
        label: { type: "text", label: "Label" },
        placeholder: { type: "text", label: "Placeholder" },
        sendLabel: { type: "text", label: "Send button" },
        attachments: {
          type: "radio",
          label: "Image attachments",
          options: [
            { label: "Off", value: false },
            { label: "On", value: true }
          ]
        },
        events: eventsField("click"),
        ...conditionalFields({ format: false })
      },
      defaultProps: {
        binding: "",
        historyBinding: "",
        valueFormat: "text",
        label: "",
        placeholder: "Write a message…",
        sendLabel: "Send",
        attachments: false,
        events: [{ trigger: "click", kind: "run", key: "", value: "" }]
      },
      render: withConditions((props) => <ChatComposerWidget {...props} />)
    },
    ModelSelect: {
      label: "Model Select",
      fields: {
        binding: bindingField("write"),
        modelKind: {
          type: "select",
          label: "Model kind",
          options: [
            { label: "Language", value: "language_model" },
            { label: "Image", value: "image_model" },
            { label: "Video", value: "video_model" },
            { label: "Speech (TTS)", value: "tts_model" },
            { label: "Transcription (ASR)", value: "asr_model" },
            { label: "Embedding", value: "embedding_model" },
            { label: "Hugging Face", value: "huggingface_model" }
          ]
        },
        label: { type: "text", label: "Label" },
        events: eventsField("change", { commits: false }),
        ...conditionalFields({ format: false })
      },
      defaultProps: {
        binding: "",
        modelKind: "language_model",
        label: "Model"
      },
      render: withConditions((props) => <ModelSelectWidget {...props} />)
    },
    ImageInput: fixedInputEntry("Image Input", "image"),
    SketchPad: {
      label: "Sketch Pad",
      fields: {
        binding: bindingField("write"),
        label: { type: "text", label: "Label" },
        width: { type: "number", label: "Canvas width (px)" },
        height: { type: "number", label: "Canvas height (px)" },
        background: {
          type: "select",
          label: "Background",
          options: [
            { label: "White", value: "white" },
            { label: "Transparent", value: "transparent" }
          ]
        },
        events: eventsField("change"),
        ...conditionalFields({ format: false })
      },
      defaultProps: {
        binding: "",
        label: "",
        width: 512,
        height: 384,
        background: "white"
      },
      render: withConditions((props) => <SketchPadWidget {...props} />)
    },
    AudioInput: fixedInputEntry("Audio Input", "audio"),
    VideoInput: fixedInputEntry("Video Input", "video"),
    AudioRecorder: {
      label: "Audio Recorder",
      fields: {
        binding: bindingField("write", "Workflow input"),
        label: { type: "text", label: "Label" },
        events: eventsField("change", { commits: false }),
        ...conditionalFields({ format: false })
      },
      defaultProps: { binding: "", label: "Record audio" },
      render: withConditions((props) => <AudioRecorderWidget {...props} />)
    },
    CameraCapture: {
      label: "Camera Capture",
      fields: {
        binding: bindingField("write", "Workflow input"),
        label: { type: "text", label: "Label" },
        events: eventsField("change", { commits: false }),
        ...conditionalFields({ format: false })
      },
      defaultProps: { binding: "", label: "Record video" },
      render: withConditions((props) => <CameraCaptureWidget {...props} />)
    },
    DocumentInput: fixedInputEntry("Document Input", "document"),
    ColorInput: fixedInputEntry("Color Input", "color"),
    Model3DInput: fixedInputEntry("3D Model Input", "model3d"),
    ImageSizeInput: fixedInputEntry("Image Size Input", "image_size"),
    FilePathInput: pathInputEntry(
      "File Path Input",
      "file_path",
      "Pick a file…"
    ),
    FolderPathInput: pathInputEntry(
      "Folder Path Input",
      "folder_path",
      "Pick a folder…"
    ),
    DataFrameInput: {
      label: "Data Table Input",
      fields: fixedInputFields({
        maxHeight: { type: "number", label: "Max height (px)" }
      }),
      defaultProps: { binding: "", label: "", maxHeight: 320 },
      render: withConditions(
        (props: FixedInputWidgetProps & { maxHeight?: number }) => (
          <FixedKindInputWidget {...props} kind="dataframe" />
        )
      )
    },
    MediaListInput: {
      label: "Media List Input",
      fields: fixedInputFields({
        listKind: {
          type: "select",
          label: "List of",
          options: [
            { label: "Images", value: "image_list" },
            { label: "Videos", value: "video_list" },
            { label: "Audio", value: "audio_list" },
            { label: "Text", value: "text_list" }
          ]
        }
      }),
      defaultProps: { binding: "", label: "", listKind: "image_list" },
      render: withConditions(
        (props: FixedInputWidgetProps & { listKind?: string }) => (
          <FixedKindInputWidget
            {...props}
            kind={LIST_KINDS[props.listKind ?? ""] ?? "image_list"}
          />
        )
      )
    },
    // ── Actions ──
    Button: {
      label: "Button",
      fields: {
        label: { type: "text", label: "Label" },
        variant: {
          type: "select",
          label: "Variant",
          options: [
            { label: "Contained", value: "contained" },
            { label: "Outlined", value: "outlined" },
            { label: "Text", value: "text" }
          ]
        },
        color: {
          type: "select",
          label: "Color",
          options: [
            { label: "Primary", value: "primary" },
            { label: "Secondary", value: "secondary" },
            { label: "Warning", value: "warning" }
          ]
        },
        events: eventsField("click"),
        ...conditionalFields({ format: false })
      },
      defaultProps: {
        label: "Run",
        variant: "contained",
        color: "primary",
        events: [{ trigger: "click", kind: "run", key: "", value: "" }]
      },
      render: withConditions((props) => <ButtonWidget {...props} />)
    },
    // ── Layout ──
    Container: {
      label: "Panel",
      fields: {
        title: { type: "text", label: "Title" },
        content: { type: "slot" }
      },
      defaultProps: { title: "", content: [] },
      render: ({ title, content }) => (
        <ContainerWidget title={title} content={content} />
      )
    },
    Columns: {
      label: "Columns",
      fields: {
        gap: { type: "number", label: "Gap (px)" },
        left: { type: "slot" },
        right: { type: "slot" }
      },
      defaultProps: { gap: 16, left: [], right: [] },
      render: ({ gap, left, right }) => (
        <ColumnsWidget gap={gap} left={left} right={right} />
      )
    },
    Tabs: {
      label: "Tabs",
      fields: {
        tab1Label: { type: "text", label: "Tab 1" },
        tab1: { type: "slot" },
        tab2Label: { type: "text", label: "Tab 2" },
        tab2: { type: "slot" },
        tab3Label: { type: "text", label: "Tab 3 (optional)" },
        tab3: { type: "slot" }
      },
      defaultProps: {
        tab1Label: "First",
        tab2Label: "Second",
        tab3Label: "",
        tab1: [],
        tab2: [],
        tab3: []
      },
      render: ({ tab1Label, tab2Label, tab3Label, tab1, tab2, tab3 }) => (
        <TabsWidget
          tab1Label={tab1Label}
          tab2Label={tab2Label}
          tab3Label={tab3Label}
          tab1={tab1}
          tab2={tab2}
          tab3={tab3}
        />
      )
    },
    Accordion: {
      label: "Accordion",
      fields: {
        title: { type: "text", label: "Title" },
        defaultOpen: {
          type: "radio",
          label: "Open by default",
          options: [
            { label: "Yes", value: true },
            { label: "No", value: false }
          ]
        },
        content: { type: "slot" }
      },
      defaultProps: { title: "Section", defaultOpen: true, content: [] },
      render: ({ title, defaultOpen, content }) => (
        <AccordionWidget
          title={title}
          defaultOpen={defaultOpen}
          content={content}
        />
      )
    },
    Divider: {
      label: "Divider",
      fields: {},
      defaultProps: {},
      render: () => <DividerWidget />
    },
    Spacer: {
      label: "Spacer",
      fields: { height: { type: "number", label: "Height (px)" } },
      defaultProps: { height: 24 },
      render: ({ height }) => <SpacerWidget height={height} />
    }
  }
};
