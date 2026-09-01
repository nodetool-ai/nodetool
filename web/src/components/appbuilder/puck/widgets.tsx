/** @jsxImportSource @emotion/react */
import React from "react";
import { keyframes } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import type { SystemStyleObject } from "@mui/system";
import ReactMarkdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  Text,
  TextInput,
  Slider,
  SelectField,
  LabeledSwitch,
  EditorButton,
  AlertBanner,
  Checkbox,
  CollapsibleSection,
  TabGroup,
  Label,
  Box,
  FlexColumn,
  FlexRow,
  Card,
  DataTable,
  Divider,
  ProgressBar,
  Caption,
  SectionHeader,
  FormGroup,
  Radio,
  RadioSet,
  BORDER_RADIUS,
  MOTION,
  SPACING,
  SPACING_PX,
  TYPOGRAPHY,
  reducedMotion,
  AudioPlayback,
  ResponsiveImage,
  VideoPlayer
} from "../../ui_primitives";
import { AppEvent } from "../types";
import { useWidgetRuntime, WidgetBindingMode } from "./useWidgetRuntime";
import { useResolvedMediaUri } from "../../../hooks/useResolvedMediaUri";
import {
  isNumber,
  isObjectLike,
  isString
} from "../../../utils/typePredicates";

const REMARK_PLUGINS: Options["remarkPlugins"] = [remarkGfm];

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
  isString(v) ? v : v == null ? "" : String(v);
const numOr = (v: unknown, fallback: number): number =>
  isNumber(v) && Number.isFinite(v) ? v : fallback;

export const resolveImageSrc = (value: unknown): string | null => {
  if (isString(value)) return value.length > 0 ? value : null;
  if (value && isObjectLike(value)) {
    const obj = value as Record<string, unknown>;
    const candidate = obj.uri ?? obj.url ?? obj.data;
    if (isString(candidate) && candidate.length > 0) return candidate;
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
  /**
   * The widget's `format` template, already interpolated by `withConditions`.
   * Display widgets render it instead of the raw bound value.
   */
  formattedValue?: string;
  /** Set by `withConditions` when the widget's `disabledWhen` holds. */
  disabled?: boolean;
}

const useBinding = (props: WidgetCommon, mode: WidgetBindingMode) =>
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

/**
 * A bound media value carries an `asset://` locator, which fetches nowhere —
 * every media leaf resolves its source to the asset's own `get_url` first.
 * Anything else (data:, blob:, http:, package://) passes through unchanged.
 *
 * All three are memoized: a widget bound to a streaming output re-renders once
 * per emitted item, and without this every item already on screen re-renders
 * with it.
 */
const ImageItem: React.FC<{ src: string; fit?: string; height: number }> =
  React.memo(({ src, fit, height }) => (
    <ResponsiveImage
      locator={src}
      alt=""
      fit={fit === "cover" ? "cover" : "contain"}
      borderRadius={BORDER_RADIUS.md}
      sx={{ height }}
    />
  ));
ImageItem.displayName = "ImageItem";

const AudioItem: React.FC<{ src: string }> = React.memo(({ src }) => (
  <AudioPlayback locator={src} />
));
AudioItem.displayName = "AudioItem";

const VideoItem: React.FC<{ src: string; height: number }> = React.memo(
  ({ src, height }) => (
    // `VideoPlayer` fills its container, so the widget's height cap becomes the
    // container's height rather than a max on the element.
    <Box
      sx={{
        width: "100%",
        height,
        borderRadius: BORDER_RADIUS.md,
        overflow: "hidden"
      }}
    >
      <VideoPlayer locator={src} />
    </Box>
  )
);
VideoItem.displayName = "VideoItem";

export const MarkdownBlock: React.FC<{ text: string }> = React.memo(
  ({ text }) => (
    <Box className="appbuilder-markdown" sx={{ width: "100%" }}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{text}</ReactMarkdown>
    </Box>
  )
);
MarkdownBlock.displayName = "MarkdownBlock";

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

export const HeadingWidget: React.FC<
  WidgetCommon & {
    text?: string;
    level?: string;
  }
> = (props) => {
  const { value } = useBinding(props, "read");
  const text =
    props.formattedValue ?? (value != null ? str(value) : (props.text ?? ""));
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
  const text =
    props.formattedValue ?? (value != null ? str(value) : (props.text ?? ""));
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
  const parts = props.formattedValue
    ? [props.formattedValue]
    : value != null
      ? asItems(value).map(str)
      : [props.text ?? ""];
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

export const ImageWidget: React.FC<
  WidgetCommon & {
    fit?: string;
    height?: number;
    placeholder?: string;
  }
> = (props) => {
  const { value } = useBinding(props, "read");
  const sources = React.useMemo(
    () =>
      asItems(value)
        .map(resolveImageSrc)
        .filter((src): src is string => src !== null),
    [value]
  );
  const height = numOr(props.height, 240);
  if (sources.length === 0) {
    return (
      <MediaPlaceholder
        height={height}
        text={props.placeholder ?? "No image"}
      />
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
  const sources = React.useMemo(
    () =>
      asItems(value)
        .map((item) => resolveMediaSrc(item, "audio/mpeg"))
        .filter((src): src is string => src !== null),
    [value]
  );
  if (sources.length === 0) {
    return (
      <MediaPlaceholder
        height={56}
        text={props.placeholder ?? "No audio yet"}
      />
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

export const VideoWidget: React.FC<
  WidgetCommon & {
    height?: number;
    placeholder?: string;
  }
> = (props) => {
  const { value } = useBinding(props, "read");
  const sources = React.useMemo(
    () =>
      asItems(value)
        .map((item) => resolveMediaSrc(item, "video/mp4"))
        .filter((src): src is string => src !== null),
    [value]
  );
  const height = numOr(props.height, 320);
  if (sources.length === 0) {
    return (
      <MediaPlaceholder
        height={height}
        text={props.placeholder ?? "No video yet"}
      />
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
  if (value && isObjectLike(value)) {
    const t = (value as { type?: unknown }).type;
    if (t === "image" || t === "audio" || t === "video") return t;
  }
  return null;
};

/** Render one untyped output item by its runtime shape. */
export const renderOutputItem = (
  item: unknown,
  key: number
): React.ReactNode => {
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
  if (item && isObjectLike(item)) {
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
  const items = props.formattedValue
    ? [props.formattedValue]
    : asItems(value).filter((item) => item != null && item !== "");
  if (items.length === 0) {
    return (
      <Caption color="secondary">
        {props.placeholder ?? "No result yet"}
      </Caption>
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

/**
 * Renders an array binding as rows: an array of objects becomes one column per
 * key (union of the rows' keys, in first-seen order), an array of primitives a
 * single "Value" column. Arrays are what an operation that emits N results —
 * or a streamed output the runtime accumulated — actually holds.
 */
export const TableWidget: React.FC<
  WidgetCommon & {
    label?: string;
    placeholder?: string;
    maxHeight?: number;
  }
> = (props) => {
  const { value } = useBinding(props, "read");
  // Memoized because the column/row derivation below depends on it, and that
  // stringifies every cell.
  const items = React.useMemo(
    () => asItems(value).filter((item) => item != null),
    [value]
  );

  const { columns, rows } = React.useMemo(() => {
    const objectRows = items.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null && !Array.isArray(item)
    );
    if (objectRows.length === items.length && objectRows.length > 0) {
      const keys: string[] = [];
      for (const row of objectRows) {
        for (const key of Object.keys(row)) {
          if (!keys.includes(key)) keys.push(key);
        }
      }
      return {
        columns: keys.map((key) => ({ key, label: key })),
        rows: objectRows.map((row) =>
          Object.fromEntries(
            keys.map((key) => [
              key,
              isObjectLike(row[key])
                ? JSON.stringify(row[key])
                : str(row[key])
            ])
          )
        )
      };
    }
    return {
      columns: [{ key: "value", label: props.label || "Value" }],
      rows: items.map((item) => ({
        value: typeof item === "object" ? JSON.stringify(item) : str(item)
      }))
    };
  }, [items, props.label]);

  if (rows.length === 0) {
    return (
      <Caption color="secondary">{props.placeholder ?? "No rows yet"}</Caption>
    );
  }
  return (
    <FlexColumn gap={SPACING.xs} fullWidth>
      {props.label ? <Caption color="secondary">{props.label}</Caption> : null}
      <DataTable
        compact
        striped
        stickyHeader={Boolean(props.maxHeight)}
        maxHeight={props.maxHeight}
        columns={columns}
        rows={rows}
        containerSx={{ borderRadius: BORDER_RADIUS.md }}
      />
    </FlexColumn>
  );
};

export const ProgressWidget: React.FC<WidgetCommon & { label?: string }> = (
  props
) => {
  const { value, runnerState, progress, activity, designMode } = useBinding(
    props,
    "read"
  );
  const isRunning = runnerState === "running";
  // A widget bound to a numeric output shows that; otherwise the run's own
  // progress, which the runtime reports as a 0..1 fraction.
  const bound = numOr(value, progress != null ? progress * 100 : NaN);
  const hasValue = Number.isFinite(bound);
  // Progress belongs to a run in flight: show it only while the run is active,
  // and let it disappear the moment the run finishes. A widget bound to a
  // numeric output keeps that value after completion (only the runtime's own
  // progress field is cleared), so visibility hangs off the run state, not the
  // value. Keep it visible in the editor so the widget can be laid out.
  if (!designMode && !isRunning) return null;
  // An agent run reports what it is doing; without it the app shows a spinner
  // and nothing else. The label the run reports wins over the static one.
  const caption = (isRunning && activity) || props.label;
  return (
    <FlexColumn gap={SPACING.micro} fullWidth>
      {caption ? <Caption color="secondary">{caption}</Caption> : null}
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
};

/**
 * A bound value shown as a message: an error output, a validation string, a
 * status line. Renders nothing when the binding is empty, so pairing it with an
 * error output gives an alert that appears only when the run fails.
 */
export const AlertWidget: React.FC<
  WidgetCommon & {
    text?: string;
    severity?: string;
    title?: string;
  }
> = (props) => {
  const { value, designMode } = useBinding(props, "read");
  const text =
    props.formattedValue ?? (value != null ? str(value) : (props.text ?? ""));
  if (!text && !designMode) return null;
  const severity = (props.severity ?? "info") as
    | "info"
    | "success"
    | "warning"
    | "error";
  return (
    <AlertBanner
      severity={severity}
      variant="outlined"
      title={props.title || undefined}
      sx={{ width: "100%" }}
    >
      {text || "Alert"}
    </AlertBanner>
  );
};

export const CodeBlockWidget: React.FC<
  WidgetCommon & {
    text?: string;
    language?: string;
    maxHeight?: number;
  }
> = (props) => {
  const { value } = useBinding(props, "read");
  const parts = props.formattedValue
    ? [props.formattedValue]
    : value != null
      ? asItems(value).map((item) =>
          isObjectLike(item)
            ? JSON.stringify(item, null, 2)
            : str(item)
        )
      : [props.text ?? ""];
  const text = parts.join("\n");
  return (
    <FlexColumn gap={SPACING.xs} fullWidth>
      {props.language ? (
        <Caption color="secondary">{props.language}</Caption>
      ) : null}
      <Box
        component="pre"
        sx={{
          m: 0,
          width: "100%",
          overflow: "auto",
          maxHeight: props.maxHeight || undefined,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontFamily: "var(--fontFamily2, monospace)",
          fontSize: "var(--fontSizeSmaller)",
          backgroundColor: "action.hover",
          borderRadius: BORDER_RADIUS.md,
          p: SPACING.md
        }}
      >
        {text}
      </Box>
    </FlexColumn>
  );
};

/**
 * An array binding as items. Table's sibling: Table wants rows with columns,
 * this wants a value whose parts have no shared shape — a list of strings, a
 * stream of results.
 */
export const ListWidget: React.FC<
  WidgetCommon & {
    label?: string;
    ordered?: boolean;
    placeholder?: string;
  }
> = (props) => {
  const { value } = useBinding(props, "read");
  const items = (
    props.formattedValue ? [props.formattedValue] : asItems(value)
  ).filter((item) => item != null && item !== "");
  if (items.length === 0) {
    return (
      <Caption color="secondary">{props.placeholder ?? "No items yet"}</Caption>
    );
  }
  return (
    <FlexColumn gap={SPACING.xs} fullWidth>
      {props.label ? <Caption color="secondary">{props.label}</Caption> : null}
      <Box
        component={props.ordered ? "ol" : "ul"}
        sx={{
          m: 0,
          pl: SPACING.xl,
          display: "flex",
          flexDirection: "column",
          gap: SPACING.xs
        }}
      >
        {items.map((item, index) => (
          <Box component="li" key={index}>
            <Text size="normal" sx={{ whiteSpace: "pre-wrap" }}>
              {typeof item === "object" ? JSON.stringify(item) : str(item)}
            </Text>
          </Box>
        ))}
      </Box>
    </FlexColumn>
  );
};

/** Row padding, plus a top rule on every row after the first. */
const rowDividerSx = (index: number): SystemStyleObject<Theme> => {
  const sx: SystemStyleObject<Theme> = {
    py: SPACING.sm,
    borderColor: "divider"
  };
  if (index > 0) sx.borderTop = "1px solid";
  return sx;
};

/**
 * An object binding as label/value rows — the shape a single-result operation
 * that emits a record has. A non-object value renders as one row.
 */
export const KeyValueWidget: React.FC<
  WidgetCommon & {
    label?: string;
    placeholder?: string;
  }
> = (props) => {
  const { value } = useBinding(props, "read");
  const entries =
    value && isObjectLike(value) && !Array.isArray(value)
      ? Object.entries(value as Record<string, unknown>)
      : value == null || value === ""
        ? []
        : [["value", value] as [string, unknown]];
  if (entries.length === 0) {
    return (
      <Caption color="secondary">
        {props.placeholder ?? "No values yet"}
      </Caption>
    );
  }
  return (
    <FlexColumn gap={SPACING.xs} fullWidth>
      {props.label ? <Caption color="secondary">{props.label}</Caption> : null}
      <FlexColumn gap={0} fullWidth>
        {entries.map(([key, entry], index) => (
          <FlexRow
            key={key}
            gap={SPACING.md}
            justify="space-between"
            align="flex-start"
            fullWidth
            sx={rowDividerSx(index)}
          >
            <Caption color="secondary">{key}</Caption>
            <Text
              size="normal"
              sx={{ textAlign: "right", wordBreak: "break-word" }}
            >
              {isObjectLike(entry)
                ? JSON.stringify(entry)
                : str(entry)}
            </Text>
          </FlexRow>
        ))}
      </FlexColumn>
    </FlexColumn>
  );
};

/** One number the app wants read at a glance, with its label and a caption. */
export const StatWidget: React.FC<
  WidgetCommon & {
    label?: string;
    caption?: string;
    placeholder?: string;
  }
> = (props) => {
  const { value } = useBinding(props, "read");
  const shown =
    props.formattedValue ?? (value != null && value !== "" ? str(value) : "");
  return (
    <FlexColumn gap={SPACING.micro} fullWidth>
      {props.label ? <Caption color="secondary">{props.label}</Caption> : null}
      <Text size="giant" weight={600}>
        {shown || props.placeholder || "—"}
      </Text>
      {props.caption ? (
        <Caption color="secondary">{props.caption}</Caption>
      ) : null}
    </FlexColumn>
  );
};

/**
 * Offers the bound value as a file instead of rendering it — the way to get a
 * generated document, audio track, or dataset out of an app.
 */
export const DownloadWidget: React.FC<
  WidgetCommon & {
    label?: string;
    filename?: string;
    placeholder?: string;
  }
> = (props) => {
  const { value, designMode } = useBinding(props, "read");
  const href = useResolvedMediaUri(resolveImageSrc(asItems(value)[0])) ?? null;
  if (!href && !designMode) {
    return (
      <Caption color="secondary">
        {props.placeholder ?? "Nothing to download yet"}
      </Caption>
    );
  }
  return (
    <EditorButton
      size="medium"
      variant="outlined"
      density="normal"
      href={href ?? undefined}
      disabled={!href}
      // A cross-origin href ignores `download` and navigates instead; opening
      // in a new tab keeps the app's own page intact either way.
      target="_blank"
      rel="noopener"
      download={props.filename || ""}
    >
      {props.label ?? "Download"}
    </EditorButton>
  );
};

// ── Input widgets ───────────────────────────────────────────────────────────

export const TextInputWidget: React.FC<
  WidgetCommon & {
    label?: string;
    placeholder?: string;
    multiline?: boolean;
  }
> = (props) => {
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

export const NumberInputWidget: React.FC<
  WidgetCommon & {
    label?: string;
    min?: number;
    max?: number;
    step?: number;
  }
> = (props) => {
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

export const SliderWidget: React.FC<
  WidgetCommon & {
    label?: string;
    min?: number;
    max?: number;
    step?: number;
  }
> = (props) => {
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

/** The author's option list, tolerating both `["a"]` and `[{ value: "a" }]`. */
const optionValues = (options: unknown): string[] =>
  Array.isArray(options)
    ? options
        .map((o) =>
          isString(o) ? o : (o as { value?: unknown } | null)?.value
        )
        .filter((o): o is string => typeof o === "string" && o.length > 0)
    : [];

export const SelectWidget: React.FC<
  WidgetCommon & {
    label?: string;
    options?: { value: string }[];
  }
> = (props) => {
  const { value, setValue, emit } = useBinding(props, "write");
  const options = optionValues(props.options);
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

export const RadioGroupWidget: React.FC<
  WidgetCommon & {
    label?: string;
    row?: boolean;
    options?: { value: string }[];
  }
> = (props) => {
  const { value, setValue, emit } = useBinding(props, "write");
  const options = optionValues(props.options);
  return (
    <FlexColumn gap={SPACING.micro} fullWidth>
      {props.label ? <Label>{props.label}</Label> : null}
      <RadioSet
        row={Boolean(props.row)}
        value={str(value)}
        onChange={(_event, next) => {
          setValue(next);
          emit("change");
        }}
      >
        {options.map((option) => (
          <Radio
            key={option}
            value={option}
            label={option}
            size="small"
            compact
          />
        ))}
      </RadioSet>
    </FlexColumn>
  );
};

/**
 * Writes the checked options as an array, so it binds to a list-typed input
 * rather than to a scalar one.
 */
export const CheckboxGroupWidget: React.FC<
  WidgetCommon & {
    label?: string;
    row?: boolean;
    options?: { value: string }[];
  }
> = (props) => {
  const { value, setValue, emit } = useBinding(props, "write");
  const options = optionValues(props.options);
  const selected = Array.isArray(value) ? value.map(str) : [];
  const toggle = (option: string, checked: boolean) => {
    // Rebuild from the option order rather than appending, so the written
    // array reads the same way the control does.
    const next = options.filter((o) =>
      o === option ? checked : selected.includes(o)
    );
    setValue(next);
    emit("change");
  };
  return (
    <FlexColumn gap={SPACING.micro} fullWidth>
      {props.label ? <Label>{props.label}</Label> : null}
      <FormGroup row={Boolean(props.row)}>
        {options.map((option) => (
          <Checkbox
            key={option}
            label={option}
            size="small"
            compact
            checked={selected.includes(option)}
            onChange={(_event, checked) => toggle(option, checked)}
          />
        ))}
      </FormGroup>
    </FlexColumn>
  );
};

export const DateInputWidget: React.FC<
  WidgetCommon & {
    label?: string;
    withTime?: boolean;
  }
> = (props) => {
  const { value, setValue, emit } = useBinding(props, "write");
  return (
    <TextInput
      label={props.label ?? ""}
      type={props.withTime ? "datetime-local" : "date"}
      value={str(value)}
      size="small"
      fullWidth
      InputLabelProps={{ shrink: true }}
      onChange={(e) => {
        setValue(e.target.value === "" ? null : e.target.value);
        emit("change");
      }}
      onBlur={() => emit("change", "commit")}
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

export const ButtonWidget: React.FC<
  WidgetCommon & {
    label?: string;
    variant?: string;
    color?: string;
  }
> = (props) => {
  const { emit, designMode, runnerState } = useBinding(props, "none");
  const isRunning = runnerState === "running";
  const showRunning = isRunning && !designMode;
  return (
    <EditorButton
      variant={
        (props.variant as "contained" | "outlined" | "text") ?? "contained"
      }
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
      {showRunning ? <RunningLabel /> : (props.label ?? "Button")}
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

export const SpacerWidget: React.FC<{ height?: number }> = ({ height }) => (
  <Box sx={{ width: "100%", height: numOr(height, SPACING_PX.xl) }} />
);

/**
 * Three fixed slots, because Puck fields are declared statically. A tab with a
 * blank label is dropped, so an app that wants two tabs just leaves the third
 * label empty.
 */
export const TabsWidget: React.FC<{
  tab1Label?: string;
  tab2Label?: string;
  tab3Label?: string;
  tab1?: SlotComponent;
  tab2?: SlotComponent;
  tab3?: SlotComponent;
}> = ({ tab1Label, tab2Label, tab3Label, tab1, tab2, tab3 }) => {
  const panes = [
    { value: "tab1", label: tab1Label, Slot: tab1 },
    { value: "tab2", label: tab2Label, Slot: tab2 },
    { value: "tab3", label: tab3Label, Slot: tab3 }
  ].filter((pane) => (pane.label ?? "").trim().length > 0);
  const [active, setActive] = React.useState("tab1");
  // The author can empty a label at any time; fall back rather than render
  // a tab strip with nothing selected.
  const current = panes.some((pane) => pane.value === active)
    ? active
    : panes[0]?.value;

  if (panes.length === 0) {
    return <Caption color="secondary">Name a tab to show its content</Caption>;
  }
  return (
    <FlexColumn gap={SPACING.lg} fullWidth>
      <TabGroup
        size="small"
        value={current ?? "tab1"}
        onChange={setActive}
        tabs={panes.map((pane) => ({
          value: pane.value,
          label: pane.label ?? pane.value
        }))}
      />
      {panes.map(({ value, Slot }) =>
        // Slots stay mounted so a widget's view state and any run it started
        // survive switching tabs; only the inactive ones are hidden.
        Slot ? (
          <Box
            key={value}
            hidden={value !== current}
            sx={{
              width: "100%",
              ...(value !== current && { display: "none" })
            }}
          >
            <Slot style={slotStack} />
          </Box>
        ) : null
      )}
    </FlexColumn>
  );
};

export const AccordionWidget: React.FC<{
  title?: string;
  defaultOpen?: boolean;
  content?: SlotComponent;
}> = ({ title, defaultOpen, content: Content }) => (
  <CollapsibleSection
    title={title || "Section"}
    defaultOpen={defaultOpen !== false}
    compact
  >
    {Content ? <Content style={slotStack} /> : null}
  </CollapsibleSection>
);
