/** @jsxImportSource @emotion/react */
import React from "react";
import type { Config, ArrayField } from "@puckeditor/core";

import { Box, Text, FlexColumn, SPACING, SPACING_PX } from "../../ui_primitives";
import { bindingField, variableField } from "./fields";
import {
  HeadingWidget,
  TextWidget,
  MarkdownWidget,
  ImageWidget,
  AudioWidget,
  VideoWidget,
  JsonWidget,
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
  DividerWidget
} from "./widgets";
import {
  WorkflowInputWidget,
  FixedKindInputWidget,
  FixedInputKind,
  FixedInputWidgetProps
} from "./WorkflowInputWidget";

const ACTION_OPTIONS = [
  { label: "Run workflow", value: "run" },
  { label: "Cancel run", value: "cancel" },
  { label: "Set variable", value: "setState" },
  { label: "Toggle variable", value: "toggleState" }
];

const PACE_OPTIONS = [
  { label: "Live", value: "live" },
  { label: "On release", value: "release" },
  { label: "Debounced", value: "debounce" }
];

// "On release" only fires for widgets that emit a settled/commit phase (slider
// release, input blur). Discrete controls — WorkflowInput, media/color pickers,
// Switch, Select — emit only "change", so offering release there would silently
// disable the action. They get Live/Debounced only.
const PACE_OPTIONS_NO_RELEASE = PACE_OPTIONS.filter((o) => o.value !== "release");

/** Array field describing a widget's events (each item dispatches an action). */
const eventsField = (
  trigger: "click" | "change",
  { commits = true }: { commits?: boolean } = {}
): ArrayField => ({
  type: "array",
  label: trigger === "click" ? "On click" : "On change",
  arrayFields: {
    kind: { type: "select", label: "Action", options: ACTION_OPTIONS },
    // Pacing throttles a run on continuous change (slider drag, typing); it has
    // no meaning for a one-shot click, so it only appears on change events.
    ...(trigger === "change"
      ? {
          pace: {
            type: "select" as const,
            label: "Pacing",
            options: commits ? PACE_OPTIONS : PACE_OPTIONS_NO_RELEASE
          }
        }
      : {}),
    key: variableField("State variable"),
    value: { type: "text", label: "Value" }
  },
  defaultItemProps: {
    trigger,
    kind: "run",
    key: "",
    value: "",
    ...(trigger === "change" ? { pace: "live" } : {})
  },
  getItemSummary: (item: Record<string, unknown>) => String(item.kind ?? "action")
});

const optionsField: ArrayField = {
  type: "array",
  label: "Options",
  arrayFields: { value: { type: "text", label: "Option" } },
  defaultItemProps: { value: "Option" },
  getItemSummary: (item: Record<string, unknown>) => String(item.value ?? "option")
};

/** Palette entry for a standalone media/color input of a fixed kind. */
const fixedInputEntry = (label: string, kind: FixedInputKind) => ({
  label,
  fields: {
    binding: bindingField("write", "Workflow input"),
    label: { type: "text" as const, label: "Label" },
    events: eventsField("change", { commits: false })
  },
  defaultProps: { binding: "", label: "" },
  render: (props: FixedInputWidgetProps) => (
    <FixedKindInputWidget {...props} kind={kind} />
  )
});

// `Config` is intentionally loosely typed (DefaultComponents): Puck injects
// `id`/`puck` into render props, and our widget components take optional props.
export const appConfig: Config = {
  root: {
    fields: {
      title: { type: "text", label: "App title" }
    },
    render: ({
      children,
      title
    }: {
      children?: React.ReactNode;
      title?: string;
    }) => (
      <Box
        sx={{
          p: SPACING.xl,
          minHeight: "100%",
          backgroundColor: "background.default",
          color: "text.primary",
          // Width-responsive widgets (Columns) query this container, so the
          // editor canvas and the published app share one layout per width.
          containerType: "inline-size"
        }}
      >
        <FlexColumn
          gap={SPACING.xxl}
          sx={{
            width: "100%",
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
          }}
        >
          {title ? (
            <Text size="big" weight={600}>{title}</Text>
          ) : null}
          {children}
        </FlexColumn>
      </Box>
    )
  },
  categories: {
    inputs: {
      title: "Inputs",
      components: [
        "WorkflowInput",
        "TextInput",
        "NumberInput",
        "Slider",
        "Switch",
        "Select",
        "ImageInput",
        "AudioInput",
        "VideoInput",
        "DocumentInput",
        "ColorInput"
      ]
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
        "Json",
        "Output",
        "Progress"
      ]
    },
    layout: { title: "Layout", components: ["Container", "Columns", "Divider"] }
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
        binding: bindingField("read")
      },
      defaultProps: { text: "Heading", level: "1" },
      render: (props) => <HeadingWidget {...props} />
    },
    Text: {
      label: "Text",
      fields: {
        text: { type: "textarea", label: "Text" },
        binding: bindingField("read")
      },
      defaultProps: { text: "Text block" },
      render: (props) => <TextWidget {...props} />
    },
    Markdown: {
      label: "Markdown",
      fields: {
        text: { type: "textarea", label: "Markdown" },
        binding: bindingField("read")
      },
      defaultProps: { text: "**Markdown** content" },
      render: (props) => <MarkdownWidget {...props} />
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
        placeholder: { type: "text", label: "Placeholder" }
      },
      defaultProps: { fit: "contain", height: 240, placeholder: "No image" },
      render: (props) => <ImageWidget {...props} />
    },
    Audio: {
      label: "Audio",
      fields: {
        binding: bindingField("read"),
        placeholder: { type: "text", label: "Placeholder" }
      },
      defaultProps: { placeholder: "No audio yet" },
      render: (props) => <AudioWidget {...props} />
    },
    Video: {
      label: "Video",
      fields: {
        binding: bindingField("read"),
        height: { type: "number", label: "Max height (px)" },
        placeholder: { type: "text", label: "Placeholder" }
      },
      defaultProps: { height: 320, placeholder: "No video yet" },
      render: (props) => <VideoWidget {...props} />
    },
    Json: {
      label: "JSON",
      fields: { binding: bindingField("read") },
      defaultProps: {},
      render: (props) => <JsonWidget {...props} />
    },
    Output: {
      label: "Output",
      fields: {
        binding: bindingField("read"),
        placeholder: { type: "text", label: "Placeholder" }
      },
      defaultProps: { placeholder: "Your result appears here" },
      render: (props) => <OutputWidget {...props} />
    },
    Progress: {
      label: "Progress",
      fields: {
        label: { type: "text", label: "Label" },
        binding: bindingField("read")
      },
      defaultProps: { label: "" },
      render: (props) => <ProgressWidget {...props} />
    },
    // ── Inputs ──
    WorkflowInput: {
      label: "Workflow Input",
      fields: {
        binding: bindingField("write", "Workflow input"),
        events: eventsField("change", { commits: false })
      },
      defaultProps: { binding: "" },
      render: (props) => <WorkflowInputWidget {...props} />
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
        events: eventsField("change")
      },
      defaultProps: { label: "Text", placeholder: "", multiline: false },
      render: (props) => <TextInputWidget {...props} />
    },
    NumberInput: {
      label: "Number Input",
      fields: {
        binding: bindingField("write"),
        label: { type: "text", label: "Label" },
        min: { type: "number", label: "Min" },
        max: { type: "number", label: "Max" },
        step: { type: "number", label: "Step" },
        events: eventsField("change")
      },
      defaultProps: { label: "Number", min: 0, max: 100, step: 1 },
      render: (props) => <NumberInputWidget {...props} />
    },
    Slider: {
      label: "Slider",
      fields: {
        binding: bindingField("write"),
        label: { type: "text", label: "Label" },
        min: { type: "number", label: "Min" },
        max: { type: "number", label: "Max" },
        step: { type: "number", label: "Step" },
        events: eventsField("change")
      },
      defaultProps: { label: "Slider", min: 0, max: 100, step: 1 },
      render: (props) => <SliderWidget {...props} />
    },
    Switch: {
      label: "Switch",
      fields: {
        binding: bindingField("write"),
        label: { type: "text", label: "Label" },
        events: eventsField("change", { commits: false })
      },
      defaultProps: { label: "Toggle" },
      render: (props) => <SwitchWidget {...props} />
    },
    Select: {
      label: "Select",
      fields: {
        binding: bindingField("write"),
        label: { type: "text", label: "Label" },
        options: optionsField,
        events: eventsField("change", { commits: false })
      },
      defaultProps: {
        label: "Select",
        options: [{ value: "Option A" }, { value: "Option B" }]
      },
      render: (props) => <SelectWidget {...props} />
    },
    ImageInput: fixedInputEntry("Image Input", "image"),
    AudioInput: fixedInputEntry("Audio Input", "audio"),
    VideoInput: fixedInputEntry("Video Input", "video"),
    DocumentInput: fixedInputEntry("Document Input", "document"),
    ColorInput: fixedInputEntry("Color Input", "color"),
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
        events: eventsField("click")
      },
      defaultProps: {
        label: "Run",
        variant: "contained",
        color: "primary",
        events: [{ trigger: "click", kind: "run", key: "", value: "" }]
      },
      render: (props) => <ButtonWidget {...props} />
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
    Divider: {
      label: "Divider",
      fields: {},
      defaultProps: {},
      render: () => <DividerWidget />
    }
  }
};
