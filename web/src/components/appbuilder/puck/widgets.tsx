/** @jsxImportSource @emotion/react */
import React from "react";
import { keyframes } from "@emotion/react";
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
  MOTION,
  SPACING,
  SPACING_PX,
  TYPOGRAPHY,
  reducedMotion
} from "../../ui_primitives";
import { AppEvent } from "../types";
import { useWidgetRuntime, WidgetBindingMode } from "./useWidgetRuntime";

/** Vertical stack styling for a Puck slot's drop zone (spaces its children).
 * `minWidth: 0` lets a zone shrink inside a grid track instead of letting its
 * content blow the track out (the editor canvas is narrow). */
const slotStack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: `${SPACING_PX.xxl}px`,
  width: "100%",
  minWidth: 0
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

/** Resolve a playable media source from a string, MediaRef, or data payload. */
const resolveMediaSrc = (value: unknown, mime: string): string | null => {
  const src = resolveImageSrc(value);
  if (!src) return null;
  // Raw base64 payloads (no scheme) become a data URI so <audio>/<video> play them.
  if (/^[A-Za-z0-9+/]+=*$/.test(src) && src.length > 256) {
    return `data:${mime};base64,${src}`;
  }
  return src;
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

/** A bound output holds one value or an accumulated list of streamed items —
 * normalize so display widgets can render each item as its own part. */
const asItems = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value == null ? [] : [value];

const MediaPlaceholder: React.FC<{ height: number; text: string }> = ({
  height,
  text
}) => (
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
    <Caption color="secondary">{text}</Caption>
  </FlexColumn>
);

const ImageItem: React.FC<{ src: string; fit?: string; height: number }> = ({
  src,
  fit,
  height
}) => (
  <Box
    component="img"
    src={src}
    alt=""
    sx={{
      width: "100%",
      height,
      objectFit: fit === "cover" ? "cover" : "contain",
      borderRadius: BORDER_RADIUS.md
    }}
  />
);

const AudioItem: React.FC<{ src: string }> = ({ src }) => (
  <Box component="audio" controls src={src} sx={{ width: "100%" }} />
);

const VideoItem: React.FC<{ src: string; height: number }> = ({
  src,
  height
}) => (
  <Box
    component="video"
    controls
    src={src}
    sx={{
      width: "100%",
      maxHeight: height,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: "common.black"
    }}
  />
);

const MarkdownBlock: React.FC<{ text: string }> = ({ text }) => (
  <Box className="appbuilder-markdown" sx={{ width: "100%" }}>
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
  </Box>
);

const JsonBlock: React.FC<{ value: unknown }> = ({ value }) => {
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

export const HeadingWidget: React.FC<WidgetCommon & {
  text?: string;
  level?: string;
}> = (props) => {
  const { value } = useBinding(props, "read");
  const text = value != null ? str(value) : props.text ?? "";
  const level = props.level ?? "1";
  const size = level === "1" ? "giant" : "big";
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
  const parts =
    value != null ? asItems(value).map(str) : [props.text ?? ""];
  if (parts.length <= 1) {
    return <MarkdownBlock text={parts[0] ?? ""} />;
  }
  return (
    <FlexColumn gap={SPACING.md} fullWidth>
      {parts.map((text, index) => (
        <MarkdownBlock key={index} text={text} />
      ))}
    </FlexColumn>
  );
};

export const ImageWidget: React.FC<WidgetCommon & {
  fit?: string;
  height?: number;
  placeholder?: string;
}> = (props) => {
  const { value } = useBinding(props, "read");
  const sources = asItems(value)
    .map(resolveImageSrc)
    .filter((src): src is string => src !== null);
  const height = numOr(props.height, 240);
  if (sources.length === 0) {
    return (
      <MediaPlaceholder height={height} text={props.placeholder ?? "No image"} />
    );
  }
  if (sources.length === 1) {
    return <ImageItem src={sources[0]} fit={props.fit} height={height} />;
  }
  return (
    <Box
      sx={{
        width: "100%",
        display: "grid",
        gap: SPACING.sm,
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))"
      }}
    >
      {sources.map((src, index) => (
        <ImageItem key={index} src={src} fit={props.fit} height={height} />
      ))}
    </Box>
  );
};

export const AudioWidget: React.FC<WidgetCommon & { placeholder?: string }> = (
  props
) => {
  const { value } = useBinding(props, "read");
  const sources = asItems(value)
    .map((item) => resolveMediaSrc(item, "audio/mpeg"))
    .filter((src): src is string => src !== null);
  if (sources.length === 0) {
    return (
      <MediaPlaceholder height={56} text={props.placeholder ?? "No audio yet"} />
    );
  }
  return (
    <FlexColumn gap={SPACING.sm} fullWidth>
      {sources.map((src, index) => (
        <AudioItem key={index} src={src} />
      ))}
    </FlexColumn>
  );
};

export const VideoWidget: React.FC<WidgetCommon & {
  height?: number;
  placeholder?: string;
}> = (props) => {
  const { value } = useBinding(props, "read");
  const sources = asItems(value)
    .map((item) => resolveMediaSrc(item, "video/mp4"))
    .filter((src): src is string => src !== null);
  const height = numOr(props.height, 320);
  if (sources.length === 0) {
    return (
      <MediaPlaceholder height={height} text={props.placeholder ?? "No video yet"} />
    );
  }
  return (
    <FlexColumn gap={SPACING.sm} fullWidth>
      {sources.map((src, index) => (
        <VideoItem key={index} src={src} height={height} />
      ))}
    </FlexColumn>
  );
};

const mediaRefKind = (value: unknown): "image" | "audio" | "video" | null => {
  if (value && typeof value === "object") {
    const t = (value as { type?: unknown }).type;
    if (t === "image" || t === "audio" || t === "video") return t;
  }
  return null;
};

/** Render one untyped output item by its runtime shape. */
const renderOutputItem = (item: unknown, key: number): React.ReactNode => {
  switch (mediaRefKind(item)) {
    case "image": {
      const src = resolveImageSrc(item);
      return src ? (
        <ImageItem key={key} src={src} fit="contain" height={280} />
      ) : null;
    }
    case "audio": {
      const src = resolveMediaSrc(item, "audio/mpeg");
      return src ? <AudioItem key={key} src={src} /> : null;
    }
    case "video": {
      const src = resolveMediaSrc(item, "video/mp4");
      return src ? <VideoItem key={key} src={src} height={320} /> : null;
    }
    default:
      break;
  }
  if (item && typeof item === "object") {
    return <JsonBlock key={key} value={item} />;
  }
  return <MarkdownBlock key={key} text={str(item)} />;
};

/**
 * Display widget for untyped sinks (Preview, generic Output): the value's shape
 * is only known at runtime, so dispatch per item then — media refs render as
 * media, strings as markdown, other objects as JSON. An accumulated stream of
 * items renders as separate stacked parts.
 */
export const OutputWidget: React.FC<WidgetCommon & { placeholder?: string }> = (
  props
) => {
  const { value } = useBinding(props, "read");
  const items = asItems(value).filter((item) => item != null && item !== "");
  if (items.length === 0) {
    return (
      <Caption color="secondary">{props.placeholder ?? "No result yet"}</Caption>
    );
  }
  if (items.length === 1) {
    return <>{renderOutputItem(items[0], 0)}</>;
  }
  return (
    <FlexColumn gap={SPACING.md} fullWidth>
      {items.map(renderOutputItem)}
    </FlexColumn>
  );
};

export const JsonWidget: React.FC<WidgetCommon> = (props) => {
  const { value } = useBinding(props, "read");
  return <JsonBlock value={value} />;
};

export const ProgressWidget: React.FC<WidgetCommon & { label?: string }> = (
  props
) => {
  const { value, runnerState, designMode } = useBinding(props, "read");
  const isRunning = runnerState === "running" || runnerState === "connecting";
  const bound = numOr(value, NaN);
  const hasValue = Number.isFinite(bound);
  // Progress belongs to a run in flight: show it only while the run is active,
  // and let it disappear the moment the run finishes. A widget bound to a
  // numeric output keeps that value after completion (only the runtime's own
  // progress field is cleared), so visibility hangs off the run state, not the
  // value. Keep it visible in the editor so the widget can be laid out.
  if (!designMode && !isRunning) return null;
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
      onBlur={() => emit("change", "commit")}
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
      onBlur={() => emit("change", "commit")}
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
        onChangeCommitted={(_, v) => {
          setValue(Array.isArray(v) ? v[0] : v);
          emit("change", "commit");
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

// A light sweep travelling across the button face — the "working" signal while
// the run is in flight.
const buttonShimmer = keyframes`
  from { transform: translateX(-100%); }
  to { transform: translateX(200%); }
`;

// The trailing ellipsis breathes one dot at a time so the label reads as live.
const ellipsisPulse = keyframes`
  0%, 100% { opacity: 0.2; }
  50% { opacity: 1; }
`;

const RunningLabel: React.FC = () => (
  <Box
    component="span"
    sx={{ display: "inline-flex", alignItems: "baseline", gap: "0.15em" }}
  >
    Running
    <Box component="span" aria-hidden sx={{ display: "inline-flex" }}>
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          component="span"
          sx={{
            animation: `${ellipsisPulse} ${MOTION.pulse} ${i * 0.18}s infinite`,
            ...reducedMotion({ animation: "none", opacity: 1 })
          }}
        >
          .
        </Box>
      ))}
    </Box>
  </Box>
);

export const ButtonWidget: React.FC<WidgetCommon & {
  label?: string;
  variant?: string;
  color?: string;
}> = (props) => {
  const { emit, designMode, runnerState } = useBinding(props, "none");
  const isRunning = runnerState === "running" || runnerState === "connecting";
  const showRunning = isRunning && !designMode;
  return (
    <EditorButton
      variant={(props.variant as "contained" | "outlined" | "text") ?? "contained"}
      color={(props.color as "primary" | "secondary" | "warning") ?? "primary"}
      density="normal"
      size="medium"
      fullWidth
      disabled={showRunning}
      onClick={() => emit("click")}
      sx={{
        fontSize: TYPOGRAPHY.sans.body.fontSize,
        fontWeight: 600,
        height: "auto",
        py: SPACING.sm,
        position: "relative",
        overflow: "hidden",
        // Keep the run state vivid rather than dimmed-out while it works.
        ...(showRunning && {
          "&.Mui-disabled": { opacity: 1 },
          "&::after": {
            content: '""',
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(100deg, transparent 20%, rgba(var(--palette-primary-contrastTextChannel) / 0.28) 50%, transparent 80%)",
            transform: "translateX(-100%)",
            animation: `${buttonShimmer} ${MOTION.pulse} infinite`,
            pointerEvents: "none",
            ...reducedMotion({ animation: "none", opacity: 0 })
          }
        })
      }}
    >
      {showRunning ? <RunningLabel /> : props.label ?? "Button"}
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
  // Container query, not an MUI breakpoint: viewport breakpoints read the
  // window, so the narrow editor canvas would still lay out two columns and
  // overflow. Querying the app root container keeps the editor preview and
  // the published app on the exact same layout at the same width.
  <Box
    sx={{
      display: "grid",
      gridTemplateColumns: "1fr",
      "@container (min-width: 700px)": {
        gridTemplateColumns: "1fr 1fr"
      },
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
