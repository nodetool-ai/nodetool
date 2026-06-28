/** @jsxImportSource @emotion/react */
import { Fragment } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import TitleIcon from "@mui/icons-material/Title";
import NotesIcon from "@mui/icons-material/Notes";
import ArticleIcon from "@mui/icons-material/Article";
import ImageIcon from "@mui/icons-material/Image";
import DataObjectIcon from "@mui/icons-material/DataObject";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import NumbersIcon from "@mui/icons-material/Numbers";
import TuneIcon from "@mui/icons-material/Tune";
import ToggleOnIcon from "@mui/icons-material/ToggleOn";
import ListIcon from "@mui/icons-material/List";
import SmartButtonIcon from "@mui/icons-material/SmartButton";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import HorizontalRuleIcon from "@mui/icons-material/HorizontalRule";
import LinearScaleIcon from "@mui/icons-material/LinearScale";

import {
  Text,
  TextInput,
  Slider,
  SelectField,
  LabeledSwitch,
  EditorButton,
  Box,
  FlexColumn,
  Card,
  Divider,
  ProgressBar,
  Caption,
  BORDER_RADIUS
} from "../../ui_primitives";
import { WidgetDefinition } from "./types";

const num = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const str = (value: unknown): string =>
  typeof value === "string" ? value : value == null ? "" : String(value);

/** Resolve a media-ish value into a URL for <img>. */
const resolveImageSrc = (value: unknown): string | null => {
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const candidate = obj.uri ?? obj.url ?? obj.data;
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return null;
};

export const WIDGET_DEFINITIONS: WidgetDefinition[] = [
  {
    type: "heading",
    label: "Heading",
    category: "display",
    icon: <TitleIcon fontSize="small" />,
    defaultSize: { w: 6, h: 1 },
    defaultProps: { text: "Heading", level: 1 },
    bindingMode: "read",
    inspector: [
      { key: "text", label: "Text", type: "text" },
      {
        key: "level",
        label: "Level",
        type: "select",
        options: [
          { label: "H1", value: "1" },
          { label: "H2", value: "2" },
          { label: "H3", value: "3" }
        ]
      }
    ],
    render: (ctx) => {
      const text = ctx.value != null ? str(ctx.value) : ctx.prop("text", "");
      const level = num(ctx.props.level, 1);
      const size = level <= 1 ? "giant" : level === 2 ? "bigger" : "big";
      return (
        <Text size={size} weight={600}>
          {text}
        </Text>
      );
    }
  },
  {
    type: "text",
    label: "Text",
    category: "display",
    icon: <NotesIcon fontSize="small" />,
    defaultSize: { w: 6, h: 1 },
    defaultProps: { text: "Text block" },
    bindingMode: "read",
    inspector: [{ key: "text", label: "Text", type: "multiline" }],
    render: (ctx) => {
      const text = ctx.value != null ? str(ctx.value) : ctx.prop("text", "");
      return (
        <Text size="normal" sx={{ whiteSpace: "pre-wrap" }}>
          {text}
        </Text>
      );
    }
  },
  {
    type: "markdown",
    label: "Markdown",
    category: "display",
    icon: <ArticleIcon fontSize="small" />,
    defaultSize: { w: 6, h: 3 },
    defaultProps: { text: "**Markdown** content" },
    bindingMode: "read",
    inspector: [{ key: "text", label: "Markdown", type: "multiline" }],
    render: (ctx) => {
      const text = ctx.value != null ? str(ctx.value) : ctx.prop("text", "");
      return (
        <Box
          className="appbuilder-markdown"
          sx={{ width: "100%", overflow: "auto", fontSize: "0.95rem" }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </Box>
      );
    }
  },
  {
    type: "image",
    label: "Image",
    category: "display",
    icon: <ImageIcon fontSize="small" />,
    defaultSize: { w: 4, h: 4 },
    defaultProps: { fit: "contain", placeholder: "No image" },
    bindingMode: "read",
    inspector: [
      {
        key: "fit",
        label: "Fit",
        type: "select",
        options: [
          { label: "Contain", value: "contain" },
          { label: "Cover", value: "cover" }
        ]
      }
    ],
    render: (ctx) => {
      const src = resolveImageSrc(ctx.value);
      const fit = ctx.prop<string>("fit", "contain");
      if (!src) {
        return (
          <FlexColumn
            align="center"
            justify="center"
            fullWidth
            sx={{
              height: "100%",
              minHeight: 80,
              border: "1px dashed",
              borderColor: "divider",
              borderRadius: BORDER_RADIUS.sm,
              color: "text.secondary"
            }}
          >
            <Caption color="secondary">{ctx.prop("placeholder", "")}</Caption>
          </FlexColumn>
        );
      }
      return (
        <Box
          component="img"
          src={src}
          alt=""
          sx={{
            width: "100%",
            height: "100%",
            objectFit: fit === "cover" ? "cover" : "contain",
            borderRadius: BORDER_RADIUS.sm
          }}
        />
      );
    }
  },
  {
    type: "json",
    label: "JSON",
    category: "display",
    icon: <DataObjectIcon fontSize="small" />,
    defaultSize: { w: 4, h: 3 },
    defaultProps: {},
    bindingMode: "read",
    inspector: [],
    render: (ctx) => {
      let formatted: string;
      try {
        formatted =
          ctx.value === undefined
            ? ""
            : JSON.stringify(ctx.value, null, 2);
      } catch {
        formatted = String(ctx.value);
      }
      return (
        <Box
          component="pre"
          sx={{
            margin: 0,
            width: "100%",
            height: "100%",
            overflow: "auto",
            fontFamily: "var(--fontFamily2, monospace)",
            fontSize: "0.8rem",
            backgroundColor: "action.hover",
            borderRadius: BORDER_RADIUS.sm,
            padding: 1
          }}
        >
          {formatted}
        </Box>
      );
    }
  },
  {
    type: "textInput",
    label: "Text Input",
    category: "input",
    icon: <TextFieldsIcon fontSize="small" />,
    defaultSize: { w: 6, h: 1 },
    defaultProps: { label: "Text", placeholder: "", multiline: false },
    bindingMode: "write",
    defaultTrigger: "change",
    inspector: [
      { key: "label", label: "Label", type: "text" },
      { key: "placeholder", label: "Placeholder", type: "text" },
      { key: "multiline", label: "Multiline", type: "boolean" }
    ],
    render: (ctx) => {
      const multiline = ctx.prop("multiline", false);
      return (
        <TextInput
          label={ctx.prop("label", "")}
          placeholder={ctx.prop("placeholder", "")}
          value={str(ctx.value)}
          multiline={Boolean(multiline)}
          minRows={multiline ? 3 : undefined}
          size="small"
          fullWidth
          onChange={(e) => {
            ctx.setValue(e.target.value);
            ctx.emit("change");
          }}
        />
      );
    }
  },
  {
    type: "numberInput",
    label: "Number Input",
    category: "input",
    icon: <NumbersIcon fontSize="small" />,
    defaultSize: { w: 3, h: 1 },
    defaultProps: { label: "Number", min: 0, max: 100, step: 1 },
    bindingMode: "write",
    defaultTrigger: "change",
    inspector: [
      { key: "label", label: "Label", type: "text" },
      { key: "min", label: "Min", type: "number" },
      { key: "max", label: "Max", type: "number" },
      { key: "step", label: "Step", type: "number" }
    ],
    render: (ctx) => (
      <TextInput
        label={ctx.prop("label", "")}
        type="number"
        value={ctx.value == null ? "" : String(ctx.value)}
        size="small"
        fullWidth
        inputProps={{
          min: num(ctx.props.min, 0),
          max: num(ctx.props.max, 100),
          step: num(ctx.props.step, 1)
        }}
        onChange={(e) => {
          const next = e.target.value === "" ? null : Number(e.target.value);
          ctx.setValue(next);
          ctx.emit("change");
        }}
      />
    )
  },
  {
    type: "slider",
    label: "Slider",
    category: "input",
    icon: <TuneIcon fontSize="small" />,
    defaultSize: { w: 6, h: 1 },
    defaultProps: { label: "Slider", min: 0, max: 100, step: 1 },
    bindingMode: "write",
    defaultTrigger: "change",
    inspector: [
      { key: "label", label: "Label", type: "text" },
      { key: "min", label: "Min", type: "number" },
      { key: "max", label: "Max", type: "number" },
      { key: "step", label: "Step", type: "number" }
    ],
    render: (ctx) => {
      const min = num(ctx.props.min, 0);
      const max = num(ctx.props.max, 100);
      return (
        <FlexColumn gap={0.5} fullWidth>
          <Caption color="secondary">
            {ctx.prop("label", "")}: {num(ctx.value, min)}
          </Caption>
          <Slider
            value={num(ctx.value, min)}
            min={min}
            max={max}
            step={num(ctx.props.step, 1)}
            valueLabelDisplay="auto"
            onChange={(_, value) => {
              ctx.setValue(Array.isArray(value) ? value[0] : value);
              ctx.emit("change");
            }}
          />
        </FlexColumn>
      );
    }
  },
  {
    type: "switch",
    label: "Switch",
    category: "input",
    icon: <ToggleOnIcon fontSize="small" />,
    defaultSize: { w: 4, h: 1 },
    defaultProps: { label: "Toggle" },
    bindingMode: "write",
    defaultTrigger: "change",
    inspector: [{ key: "label", label: "Label", type: "text" }],
    render: (ctx) => (
      <LabeledSwitch
        label={ctx.prop("label", "")}
        checked={Boolean(ctx.value)}
        onChange={(checked) => {
          ctx.setValue(checked);
          ctx.emit("change");
        }}
      />
    )
  },
  {
    type: "select",
    label: "Select",
    category: "input",
    icon: <ListIcon fontSize="small" />,
    defaultSize: { w: 4, h: 1 },
    defaultProps: { label: "Select", options: ["Option A", "Option B"] },
    bindingMode: "write",
    defaultTrigger: "change",
    inspector: [
      { key: "label", label: "Label", type: "text" },
      {
        key: "options",
        label: "Options (comma separated)",
        type: "text",
        placeholder: "A, B, C"
      }
    ],
    render: (ctx) => {
      const rawOptions = ctx.props.options;
      const options = Array.isArray(rawOptions)
        ? rawOptions
        : typeof rawOptions === "string"
          ? rawOptions.split(",").map((o) => o.trim()).filter(Boolean)
          : [];
      return (
        <SelectField
          label={ctx.prop("label", "")}
          value={str(ctx.value)}
          options={options.map((o) => ({ label: o, value: o }))}
          onChange={(value) => {
            ctx.setValue(value);
            ctx.emit("change");
          }}
        />
      );
    }
  },
  {
    type: "button",
    label: "Button",
    category: "action",
    icon: <SmartButtonIcon fontSize="small" />,
    defaultSize: { w: 3, h: 1 },
    defaultProps: { label: "Run", variant: "contained", color: "primary" },
    bindingMode: "none",
    defaultTrigger: "click",
    inspector: [
      { key: "label", label: "Label", type: "text" },
      {
        key: "variant",
        label: "Variant",
        type: "select",
        options: [
          { label: "Contained", value: "contained" },
          { label: "Outlined", value: "outlined" },
          { label: "Text", value: "text" }
        ]
      },
      {
        key: "color",
        label: "Color",
        type: "select",
        options: [
          { label: "Primary", value: "primary" },
          { label: "Secondary", value: "secondary" },
          { label: "Warning", value: "warning" }
        ]
      }
    ],
    render: (ctx) => {
      const variant = ctx.prop("variant", "contained");
      const color = ctx.prop("color", "primary");
      const isRunning =
        ctx.runnerState === "running" || ctx.runnerState === "connecting";
      return (
        <EditorButton
          variant={variant as "contained" | "outlined" | "text"}
          color={
            color as "primary" | "secondary" | "warning"
          }
          fullWidth
          disabled={isRunning && !ctx.designMode}
          onClick={() => ctx.emit("click")}
        >
          {isRunning && !ctx.designMode ? "Running…" : ctx.prop("label", "")}
        </EditorButton>
      );
    }
  },
  {
    type: "container",
    label: "Panel",
    category: "layout",
    icon: <CropSquareIcon fontSize="small" />,
    defaultSize: { w: 6, h: 4 },
    defaultProps: { title: "" },
    bindingMode: "none",
    inspector: [{ key: "title", label: "Title", type: "text" }],
    render: (ctx) => (
      <Card
        variant="outlined"
        padding="normal"
        sx={{ width: "100%", height: "100%" }}
      >
        {ctx.prop("title", "") ? (
          <Text size="small" weight={600} sx={{ mb: 1 }}>
            {ctx.prop("title", "")}
          </Text>
        ) : (
          <Fragment />
        )}
      </Card>
    )
  },
  {
    type: "divider",
    label: "Divider",
    category: "layout",
    icon: <HorizontalRuleIcon fontSize="small" />,
    defaultSize: { w: 12, h: 1 },
    defaultProps: {},
    bindingMode: "none",
    inspector: [],
    render: () => (
      <Box sx={{ width: "100%", py: 1 }}>
        <Divider />
      </Box>
    )
  },
  {
    type: "progress",
    label: "Progress",
    category: "display",
    icon: <LinearScaleIcon fontSize="small" />,
    defaultSize: { w: 6, h: 1 },
    defaultProps: { label: "" },
    bindingMode: "read",
    inspector: [{ key: "label", label: "Label", type: "text" }],
    render: (ctx) => {
      const isRunning =
        ctx.runnerState === "running" || ctx.runnerState === "connecting";
      const bound = num(ctx.value, NaN);
      const hasValue = Number.isFinite(bound);
      return (
        <FlexColumn gap={0.5} fullWidth>
          {ctx.prop("label", "") ? (
            <Caption color="secondary">{ctx.prop("label", "")}</Caption>
          ) : null}
          <ProgressBar
            value={hasValue ? bound : 0}
            progressVariant={
              !hasValue && isRunning ? "indeterminate" : "determinate"
            }
            showValue={hasValue}
            barHeight={6}
          />
        </FlexColumn>
      );
    }
  }
];
