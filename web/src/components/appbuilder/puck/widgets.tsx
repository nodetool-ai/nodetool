/** @jsxImportSource @emotion/react */
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  SectionHeader,
  BORDER_RADIUS,
  SPACING,
  SPACING_PX
} from "../../ui_primitives";
import { AppEvent } from "../types";
import { useWidgetRuntime, WidgetBindingMode } from "./useWidgetRuntime";

/** Vertical stack styling for a Puck slot's drop zone (spaces its children). */
const slotStack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: `${SPACING_PX.lg}px`,
  width: "100%"
};

/** A Puck slot — a render function that accepts drop-zone styling props. */
type SlotComponent = (props?: {
  style?: React.CSSProperties;
  className?: string;
}) => React.ReactNode;

const str = (v: unknown): string =>
  typeof v === "string" ? v : v == null ? "" : String(v);
const numOr = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const resolveImageSrc = (value: unknown): string | null => {
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const candidate = obj.uri ?? obj.url ?? obj.data;
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return null;
};

/** Common props Puck injects plus our binding/event props. */
interface WidgetCommon {
  id: string;
  binding?: string;
  events?: AppEvent[];
}

const useBinding = (
  props: WidgetCommon,
  mode: WidgetBindingMode
) =>
  useWidgetRuntime({
    id: props.id,
    bindingMode: mode,
    binding: props.binding,
    events: props.events
  });

// ── Display widgets ─────────────────────────────────────────────────────────

export const HeadingWidget: React.FC<WidgetCommon & {
  text?: string;
  level?: string;
}> = (props) => {
  const { value } = useBinding(props, "read");
  const text = value != null ? str(value) : props.text ?? "";
  const level = props.level ?? "1";
  const size = level === "1" ? "giant" : level === "2" ? "bigger" : "big";
  return (
    <Text size={size} weight={600}>
      {text}
    </Text>
  );
};

export const TextWidget: React.FC<WidgetCommon & { text?: string }> = (
  props
) => {
  const { value } = useBinding(props, "read");
  const text = value != null ? str(value) : props.text ?? "";
  return (
    <Text size="normal" sx={{ whiteSpace: "pre-wrap" }}>
      {text}
    </Text>
  );
};

export const MarkdownWidget: React.FC<WidgetCommon & { text?: string }> = (
  props
) => {
  const { value } = useBinding(props, "read");
  const text = value != null ? str(value) : props.text ?? "";
  return (
    <Box className="appbuilder-markdown" sx={{ width: "100%" }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </Box>
  );
};

export const ImageWidget: React.FC<WidgetCommon & {
  fit?: string;
  height?: number;
  placeholder?: string;
}> = (props) => {
  const { value } = useBinding(props, "read");
  const src = resolveImageSrc(value);
  const height = numOr(props.height, 240);
  if (!src) {
    return (
      <FlexColumn
        align="center"
        justify="center"
        fullWidth
        sx={{
          height,
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: BORDER_RADIUS.md,
          color: "text.secondary"
        }}
      >
        <Caption color="secondary">{props.placeholder ?? "No image"}</Caption>
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
        height,
        objectFit: props.fit === "cover" ? "cover" : "contain",
        borderRadius: BORDER_RADIUS.md
      }}
    />
  );
};

export const JsonWidget: React.FC<WidgetCommon> = (props) => {
  const { value } = useBinding(props, "read");
  let formatted: string;
  try {
    formatted = value === undefined ? "" : JSON.stringify(value, null, 2);
  } catch {
    formatted = String(value);
  }
  return (
    <Box
      component="pre"
      sx={{
        m: 0,
        width: "100%",
        overflow: "auto",
        fontFamily: "var(--fontFamily2, monospace)",
        fontSize: "var(--fontSizeSmaller)",
        backgroundColor: "action.hover",
        borderRadius: BORDER_RADIUS.md,
        p: SPACING.md
      }}
    >
      {formatted}
    </Box>
  );
};

export const ProgressWidget: React.FC<WidgetCommon & { label?: string }> = (
  props
) => {
  const { value, runnerState } = useBinding(props, "read");
  const isRunning = runnerState === "running" || runnerState === "connecting";
  const bound = numOr(value, NaN);
  const hasValue = Number.isFinite(bound);
  return (
    <FlexColumn gap={SPACING.micro} fullWidth>
      {props.label ? <Caption color="secondary">{props.label}</Caption> : null}
      <ProgressBar
        value={hasValue ? bound : 0}
        progressVariant={!hasValue && isRunning ? "indeterminate" : "determinate"}
        showValue={hasValue}
        barHeight={6}
      />
    </FlexColumn>
  );
};

// ── Input widgets ───────────────────────────────────────────────────────────

export const TextInputWidget: React.FC<WidgetCommon & {
  label?: string;
  placeholder?: string;
  multiline?: boolean;
}> = (props) => {
  const { value, setValue, emit } = useBinding(props, "write");
  return (
    <TextInput
      label={props.label ?? ""}
      placeholder={props.placeholder ?? ""}
      value={str(value)}
      multiline={Boolean(props.multiline)}
      minRows={props.multiline ? 3 : undefined}
      size="small"
      fullWidth
      onChange={(e) => {
        setValue(e.target.value);
        emit("change");
      }}
    />
  );
};

export const NumberInputWidget: React.FC<WidgetCommon & {
  label?: string;
  min?: number;
  max?: number;
  step?: number;
}> = (props) => {
  const { value, setValue, emit } = useBinding(props, "write");
  return (
    <TextInput
      label={props.label ?? ""}
      type="number"
      value={value == null ? "" : String(value)}
      size="small"
      fullWidth
      inputProps={{
        min: numOr(props.min, 0),
        max: numOr(props.max, 100),
        step: numOr(props.step, 1)
      }}
      onChange={(e) => {
        setValue(e.target.value === "" ? null : Number(e.target.value));
        emit("change");
      }}
    />
  );
};

export const SliderWidget: React.FC<WidgetCommon & {
  label?: string;
  min?: number;
  max?: number;
  step?: number;
}> = (props) => {
  const { value, setValue, emit } = useBinding(props, "write");
  const min = numOr(props.min, 0);
  return (
    <FlexColumn gap={SPACING.micro} fullWidth>
      <Caption color="secondary">
        {props.label ?? ""}: {numOr(value, min)}
      </Caption>
      <Slider
        value={numOr(value, min)}
        min={min}
        max={numOr(props.max, 100)}
        step={numOr(props.step, 1)}
        valueLabelDisplay="auto"
        onChange={(_, v) => {
          setValue(Array.isArray(v) ? v[0] : v);
          emit("change");
        }}
      />
    </FlexColumn>
  );
};

export const SwitchWidget: React.FC<WidgetCommon & { label?: string }> = (
  props
) => {
  const { value, setValue, emit } = useBinding(props, "write");
  return (
    <LabeledSwitch
      label={props.label ?? ""}
      checked={Boolean(value)}
      onChange={(checked) => {
        setValue(checked);
        emit("change");
      }}
    />
  );
};

export const SelectWidget: React.FC<WidgetCommon & {
  label?: string;
  options?: { value: string }[];
}> = (props) => {
  const { value, setValue, emit } = useBinding(props, "write");
  const options = Array.isArray(props.options)
    ? props.options
        .map((o) => (typeof o === "string" ? o : o?.value))
        .filter((o): o is string => typeof o === "string" && o.length > 0)
    : [];
  return (
    <SelectField
      label={props.label ?? ""}
      value={str(value)}
      options={options.map((o) => ({ label: o, value: o }))}
      onChange={(v) => {
        setValue(v);
        emit("change");
      }}
    />
  );
};

// ── Action widget ───────────────────────────────────────────────────────────

export const ButtonWidget: React.FC<WidgetCommon & {
  label?: string;
  variant?: string;
  color?: string;
}> = (props) => {
  const { emit, designMode, runnerState } = useBinding(props, "none");
  const isRunning = runnerState === "running" || runnerState === "connecting";
  return (
    <EditorButton
      variant={(props.variant as "contained" | "outlined" | "text") ?? "contained"}
      color={(props.color as "primary" | "secondary" | "warning") ?? "primary"}
      fullWidth
      disabled={isRunning && !designMode}
      onClick={() => emit("click")}
    >
      {isRunning && !designMode ? "Running…" : props.label ?? "Button"}
    </EditorButton>
  );
};

// ── Layout widgets ──────────────────────────────────────────────────────────

export const ContainerWidget: React.FC<{
  title?: string;
  content?: SlotComponent;
}> = ({ title, content: Content }) => (
  <Card
    variant="outlined"
    padding="none"
    sx={{ width: "100%", p: SPACING.xl, borderRadius: BORDER_RADIUS.md }}
  >
    {title ? (
      <SectionHeader
        title={title}
        size="small"
        uppercase
        sx={{ mb: SPACING.lg }}
      />
    ) : null}
    {Content ? <Content style={slotStack} /> : null}
  </Card>
);

export const ColumnsWidget: React.FC<{
  gap?: number;
  left?: SlotComponent;
  right?: SlotComponent;
}> = ({ gap, left: Left, right: Right }) => (
  <Box
    sx={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: `${numOr(gap, SPACING_PX.xl)}px`,
      width: "100%"
    }}
  >
    {Left ? <Left style={slotStack} /> : null}
    {Right ? <Right style={slotStack} /> : null}
  </Box>
);

export const DividerWidget: React.FC = () => (
  <Box sx={{ width: "100%", py: SPACING.xs }}>
    <Divider />
  </Box>
);
