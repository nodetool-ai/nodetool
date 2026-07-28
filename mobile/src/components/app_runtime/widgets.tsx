/**
 * Native renderers for the app-builder widget catalog.
 *
 * One component per entry in `WIDGET_CATALOG`, bound to the reactive runtime
 * through `useWidgetRuntime`. The catalog, the bindings, and the conditions
 * come from `@nodetool-ai/app-runtime`, so a document authored in the web
 * builder renders here with the same semantics — only the controls are native.
 *
 * Layout differences are deliberate: `Columns` stacks vertically, because two
 * side-by-side columns are unusable at phone width.
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  composeUserMessage,
  formatDuration,
  messagesFrom,
  messageText,
  readSketchBinding,
  readTimelineBinding,
  sketchSummary,
  timelineSummary,
  WIDGET_CATALOG,
  type AppEvent,
  type ConditionProps,
} from "@nodetool-ai/app-runtime";

import { useQuery } from "@tanstack/react-query";

import { useTheme } from "../../hooks/useTheme";
import type { ThemeColors } from "../../utils/theme";
import { apiService } from "../../services/api";
import { documentBackend } from "../../documents/backends";
import {
  SketchRenderer,
  asSketchDocument,
} from "../sketch/SketchRenderer";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import { OutputRenderer } from "../outputs/OutputRenderer";
import {
  useAppRuntimeContext,
  useBindingRef,
  useBindingValue,
  useCondition,
  useFormatted,
} from "./AppRuntimeContext";
import { useWidgetRuntime } from "./useWidgetRuntime";
import { SliderControl } from "./SliderControl";
import { RESOURCE_RENDERERS } from "./resourceWidgets";
import { ModelSelectWidget } from "./ModelSelectWidget";
import { pickMediaValue, type MediaKind } from "./mediaPicker";
import { clampNumber } from "./inputKinds";

/** A placed widget in the Puck document. Slots are arrays nested in props. */
export interface ComponentNode {
  type: string;
  props: Record<string, unknown> & { id: string };
}

interface WidgetProps {
  id: string;
  binding?: string;
  events?: AppEvent[];
  /** Interpolated `format` template; display widgets render it in place of the value. */
  formattedValue?: string;
  disabled?: boolean;
  props: Record<string, unknown>;
}

const str = (value: unknown): string =>
  typeof value === "string" ? value : value == null ? "" : String(value);

const numOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** A bound output holds one value or an accumulated list of streamed items. */
const asItems = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value == null ? [] : [value];

const mediaUri = (value: unknown): string | null => {
  const raw =
    typeof value === "string"
      ? value
      : value && typeof value === "object"
        ? str(
            (value as Record<string, unknown>).uri ??
              (value as Record<string, unknown>).url
          )
        : "";
  if (!raw || raw.startsWith("memory://")) {return null;}
  if (raw.startsWith("data:")) {return raw;}
  return apiService.resolveUrl(raw);
};

// ── Display ─────────────────────────────────────────────────────────────────

const Placeholder: React.FC<{ text: string; colors: ThemeColors }> = ({
  text,
  colors,
}) => (
  <View style={[styles.placeholder, { borderColor: colors.border }]}>
    <Text style={[styles.placeholderText, { color: colors.textTertiary }]}>
      {text}
    </Text>
  </View>
);

const HeadingWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const text = widget.formattedValue ?? (str(value) || str(widget.props.text));
  const level = str(widget.props.level) || "1";
  const size = level === "1" ? 24 : level === "2" ? 20 : 17;
  if (!text) {return null;}
  return (
    <Text style={[styles.heading, { fontSize: size, color: colors.text }]}>
      {text}
    </Text>
  );
};

const TextWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const text = widget.formattedValue ?? (str(value) || str(widget.props.text));
  if (!text) {return null;}
  return <Text style={[styles.body, { color: colors.text }]}>{text}</Text>;
};

const MarkdownWidget: React.FC<WidgetProps> = (widget) => {
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const text = widget.formattedValue ?? (str(value) || str(widget.props.text));
  if (!text) {return null;}
  return <MarkdownRenderer content={text} />;
};

const ImageWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const height = numOr(widget.props.height, 240);
  const uris = asItems(value)
    .map(mediaUri)
    .filter((uri): uri is string => uri !== null);
  if (uris.length === 0) {
    return (
      <Placeholder
        text={str(widget.props.placeholder) || "No image"}
        colors={colors}
      />
    );
  }
  return (
    <View style={styles.stack}>
      {uris.map((uri, index) => (
        <Image
          key={`${uri}-${index}`}
          source={{ uri }}
          style={[styles.image, { height }]}
          resizeMode={widget.props.fit === "cover" ? "cover" : "contain"}
        />
      ))}
    </View>
  );
};

/** Audio, video, JSON and the generic Output all render through the shared
 * output renderer, which already knows every value shape the protocol emits. */
const MediaOutputWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const items = asItems(value);
  if (items.length === 0) {
    const placeholder = str(widget.props.placeholder);
    return placeholder ? (
      <Placeholder text={placeholder} colors={colors} />
    ) : null;
  }
  return (
    <View style={styles.stack}>
      {items.map((item, index) => (
        <OutputRenderer key={index} value={item} />
      ))}
    </View>
  );
};

/**
 * Sketch and timeline previews.
 *
 * The sketch widget draws: `components/sketch/SketchRenderer` composites the
 * bound document the same way the viewer screen does. A ref carrying only an id
 * is read through the sketch document backend, so an app whose run emits a
 * `SketchRef` shows the picture rather than a card pointing at a desktop.
 *
 * Timelines still summarize — mobile has no preview compositor — and a timeline
 * ref that resolves to nothing says so rather than showing an empty frame.
 */
const DocumentCard: React.FC<{
  title: string;
  meta: string;
  colors: ThemeColors;
}> = ({ title, meta, colors }) => (
  <View style={[styles.documentCard, { borderColor: colors.border }]}>
    <Text style={[styles.label, { color: colors.text }]}>{title}</Text>
    <Text style={[styles.hint, { color: colors.textTertiary }]}>{meta}</Text>
  </View>
);

/** How tall a sketch preview grows before it shrinks to fit. */
const SKETCH_DEFAULT_HEIGHT = 320;

const SketchWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const { document, id } = readSketchBinding(value);

  const inline = useMemo(() => asSketchDocument(document), [document]);
  // Only fetch when the value carried a bare ref: an inline document is already
  // everything the compositor needs.
  const shouldLoad = Boolean(id) && inline === null;
  const query = useQuery({
    queryKey: ["app-runtime", "sketch", id],
    queryFn: async () => {
      const loaded = await documentBackend("sketch").read(id ?? "");
      return loaded.doc;
    },
    enabled: shouldLoad,
    staleTime: 30_000,
    retry: false,
  });
  const loaded = useMemo(() => asSketchDocument(query.data), [query.data]);
  const doc = inline ?? loaded;

  if (doc) {
    return (
      <SketchRenderer
        doc={doc}
        maxHeight={numOr(widget.props.height, SKETCH_DEFAULT_HEIGHT)}
        showDimensions={widget.props.showDimensions === true}
      />
    );
  }
  if (shouldLoad && query.isLoading) {
    return <ActivityIndicator color={colors.primary} />;
  }
  if (id) {
    // A ref that resolves to nothing, or to a body the compositor cannot read.
    const summary = sketchSummary(document);
    return (
      <DocumentCard
        title="Sketch"
        meta={
          summary
            ? `${summary.width} × ${summary.height} · ${summary.layerCount} layer${
                summary.layerCount === 1 ? "" : "s"
              }`
            : "Could not load this sketch"
        }
        colors={colors}
      />
    );
  }
  return (
    <Placeholder
      text={str(widget.props.placeholder) || "No sketch yet"}
      colors={colors}
    />
  );
};

const TimelineWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const { document, id } = readTimelineBinding(value);
  const summary = timelineSummary(document);
  if (summary) {
    return (
      <DocumentCard
        title={summary.name || "Timeline"}
        meta={`${formatDuration(summary.durationMs)} · ${summary.trackCount} track${
          summary.trackCount === 1 ? "" : "s"
        } · ${summary.clipCount} clip${summary.clipCount === 1 ? "" : "s"}`}
        colors={colors}
      />
    );
  }
  if (id) {
    return (
      <DocumentCard title="Timeline" meta="Open on desktop to view" colors={colors} />
    );
  }
  return (
    <Placeholder
      text={str(widget.props.placeholder) || "No timeline yet"}
      colors={colors}
    />
  );
};

/** A cell's text: primitives print, anything structured falls back to JSON. */
const cellText = (value: unknown): string => {
  if (value == null) {return "";}
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const isRow = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Columns of a bound array: the union of the rows' keys, in first-seen order.
 * An array of primitives has none — it renders as a single unnamed column.
 */
export const tableColumns = (rows: ReadonlyArray<unknown>): string[] => {
  const columns: string[] = [];
  for (const row of rows) {
    if (!isRow(row)) {continue;}
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) {columns.push(key);}
    }
  }
  return columns;
};

/** Lays an array value out as rows — what a run that emits N results needs. */
const TableWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const rows = asItems(value);
  const columns = useMemo(() => tableColumns(rows), [rows]);

  if (rows.length === 0) {
    return (
      <Placeholder
        text={str(widget.props.placeholder) || "No rows"}
        colors={colors}
      />
    );
  }

  const cells = (row: unknown): string[] =>
    columns.length === 0
      ? [cellText(row)]
      : columns.map((column) => (isRow(row) ? cellText(row[column]) : ""));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={[styles.table, { borderColor: colors.border }]}>
        {columns.length > 0 ? (
          <View style={[styles.tableRow, { backgroundColor: colors.inputBg }]}>
            {columns.map((column) => (
              <Text
                key={column}
                numberOfLines={1}
                style={[styles.tableCell, styles.tableHeader, { color: colors.text }]}
              >
                {column}
              </Text>
            ))}
          </View>
        ) : null}
        {rows.map((row, index) => (
          <View
            key={index}
            style={[
              styles.tableRow,
              index > 0 || columns.length > 0
                ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }
                : null,
            ]}
          >
            {cells(row).map((text, cellIndex) => (
              <Text
                key={cellIndex}
                numberOfLines={3}
                style={[styles.tableCell, { color: colors.textSecondary }]}
              >
                {text}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

const ProgressWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value, running, progress, activity } = useWidgetRuntime({
    ...widget,
    bindingMode: "read",
  });
  const bound = typeof value === "number" ? value : undefined;
  const ratio = bound ?? progress;
  // What the run says it is doing outranks the author's static label: an app
  // over an agent workflow otherwise shows a bare spinner for minutes.
  const label = (running ? activity : undefined) ?? str(widget.props.label);
  if (!running && ratio === undefined) {return null;}
  return (
    <View style={styles.stack}>
      {label ? (
        <Text
          numberOfLines={2}
          style={[styles.label, { color: colors.textSecondary }]}
        >
          {label}
        </Text>
      ) : null}
      {ratio === undefined ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View
            testID="progress-fill"
            style={[
              styles.progressFill,
              {
                width: `${Math.round(
                  Math.min(Math.max(ratio, 0), 1) * 100
                )}%`,
                backgroundColor: colors.primary,
              },
            ]}
          />
        </View>
      )}
    </View>
  );
};

const FieldLabel: React.FC<{ text: string; colors: ThemeColors }> = ({
  text,
  colors,
}) =>
  text ? (
    <Text style={[styles.label, { color: colors.text }]}>{text}</Text>
  ) : null;

/** A bound value shown as a message. Empty binding renders nothing. */
const AlertWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const text = widget.formattedValue ?? (str(value) || str(widget.props.text));
  if (!text) {return null;}
  const severity = str(widget.props.severity) || "info";
  const tint =
    severity === "error"
      ? colors.error
      : severity === "warning"
        ? colors.warning
        : severity === "success"
          ? colors.success
          : colors.primary;
  const title = str(widget.props.title);
  return (
    <View style={[styles.alert, { borderColor: tint }]}>
      {title ? (
        <Text style={[styles.label, { color: tint }]}>{title}</Text>
      ) : null}
      <Text style={[styles.body, { color: colors.text }]}>{text}</Text>
    </View>
  );
};

const CodeBlockWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const text =
    widget.formattedValue ??
    (value != null
      ? asItems(value).map(cellText).join("\n")
      : str(widget.props.text));
  if (!text) {return null;}
  return (
    <ScrollView
      horizontal
      style={[styles.code, { backgroundColor: colors.inputBg }]}
    >
      <Text style={[styles.codeText, { color: colors.text }]}>{text}</Text>
    </ScrollView>
  );
};

const ListWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const items = (
    widget.formattedValue ? [widget.formattedValue] : asItems(value)
  ).filter((item) => item != null && item !== "");
  if (items.length === 0) {
    const placeholder = str(widget.props.placeholder);
    return placeholder ? (
      <Placeholder text={placeholder} colors={colors} />
    ) : null;
  }
  const ordered = widget.props.ordered === true;
  return (
    <View style={styles.field}>
      <FieldLabel text={str(widget.props.label)} colors={colors} />
      {items.map((item, index) => (
        <View key={index} style={styles.listItem}>
          <Text style={[styles.body, { color: colors.textTertiary }]}>
            {ordered ? `${index + 1}.` : "•"}
          </Text>
          <Text style={[styles.body, styles.flex, { color: colors.text }]}>
            {cellText(item)}
          </Text>
        </View>
      ))}
    </View>
  );
};

const KeyValueWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const entries = isRow(value)
    ? Object.entries(value)
    : value == null || value === ""
      ? []
      : ([["value", value]] as [string, unknown][]);
  if (entries.length === 0) {
    const placeholder = str(widget.props.placeholder);
    return placeholder ? (
      <Placeholder text={placeholder} colors={colors} />
    ) : null;
  }
  return (
    <View style={styles.field}>
      <FieldLabel text={str(widget.props.label)} colors={colors} />
      {entries.map(([key, entry]) => (
        <View
          key={key}
          style={[styles.row, styles.kvRow, { borderColor: colors.borderLight }]}
        >
          <Text style={[styles.hint, { color: colors.textTertiary }]}>{key}</Text>
          <Text style={[styles.body, styles.kvValue, { color: colors.text }]}>
            {cellText(entry)}
          </Text>
        </View>
      ))}
    </View>
  );
};

const StatWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const shown =
    widget.formattedValue ?? (value != null && value !== "" ? str(value) : "");
  const caption = str(widget.props.caption);
  return (
    <View style={styles.field}>
      <FieldLabel text={str(widget.props.label)} colors={colors} />
      <Text style={[styles.stat, { color: colors.text }]}>
        {shown || str(widget.props.placeholder) || "—"}
      </Text>
      {caption ? (
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
};

/** Hands the bound file to the OS rather than rendering it inline. */
const DownloadWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const uri = mediaUri(asItems(value)[0]);
  if (!uri) {
    const placeholder = str(widget.props.placeholder);
    return placeholder ? (
      <Placeholder text={placeholder} colors={colors} />
    ) : null;
  }
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={widget.disabled}
      onPress={() => {
        void Linking.openURL(uri);
      }}
      style={[
        styles.button,
        styles.secondaryButton,
        { borderColor: colors.primary },
      ]}
    >
      <Text style={[styles.buttonText, { color: colors.primary }]}>
        {str(widget.props.label) || "Download"}
      </Text>
    </TouchableOpacity>
  );
};

// ── Inputs ──────────────────────────────────────────────────────────────────

const TextInputWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value, setValue, emit } = useWidgetRuntime({
    ...widget,
    bindingMode: "write",
  });
  const multiline = widget.props.multiline === true;
  return (
    <View style={styles.field}>
      <FieldLabel text={str(widget.props.label)} colors={colors} />
      <TextInput
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          {
            backgroundColor: colors.inputBg,
            color: colors.text,
            borderColor: colors.border,
          },
        ]}
        editable={!widget.disabled}
        value={str(value)}
        multiline={multiline}
        placeholder={str(widget.props.placeholder)}
        placeholderTextColor={colors.textTertiary}
        onChangeText={(text) => {
          setValue(text);
          emit("change");
        }}
        onBlur={() => emit("change", "commit")}
      />
    </View>
  );
};

const NumberInputWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value, setValue, emit } = useWidgetRuntime({
    ...widget,
    bindingMode: "write",
  });
  const min = typeof widget.props.min === "number" ? widget.props.min : undefined;
  const max = typeof widget.props.max === "number" ? widget.props.max : undefined;
  const [text, setText] = useState(() => (value == null ? "" : String(value)));

  const onChangeText = useCallback(
    (next: string) => {
      setText(next);
      if (next === "" || next === "-") {
        setValue(undefined);
        return;
      }
      const parsed = Number(next);
      if (Number.isNaN(parsed)) {return;}
      setValue(clampNumber(parsed, min, max));
      emit("change");
    },
    [emit, max, min, setValue]
  );

  return (
    <View style={styles.field}>
      <FieldLabel text={str(widget.props.label)} colors={colors} />
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.inputBg,
            color: colors.text,
            borderColor: colors.border,
          },
        ]}
        editable={!widget.disabled}
        value={text}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={colors.textTertiary}
        onChangeText={onChangeText}
        onBlur={() => emit("change", "commit")}
      />
    </View>
  );
};

const SliderWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value, setValue, emit } = useWidgetRuntime({
    ...widget,
    bindingMode: "write",
  });
  const min = numOr(widget.props.min, 0);
  const max = numOr(widget.props.max, 100);
  const step = numOr(widget.props.step, 1);
  const current = typeof value === "number" ? value : min;

  return (
    <View style={styles.field}>
      <View style={styles.row}>
        <FieldLabel text={str(widget.props.label)} colors={colors} />
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {current}
        </Text>
      </View>
      <SliderControl
        value={current}
        min={min}
        max={max}
        step={step}
        disabled={widget.disabled}
        onChange={(next) => {
          setValue(next);
          emit("change");
        }}
        onCommit={() => emit("change", "commit")}
      />
    </View>
  );
};

const SwitchWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value, setValue, emit } = useWidgetRuntime({
    ...widget,
    bindingMode: "write",
  });
  return (
    <View style={[styles.field, styles.row]}>
      <FieldLabel text={str(widget.props.label)} colors={colors} />
      <Switch
        value={value === true}
        disabled={widget.disabled}
        onValueChange={(next) => {
          setValue(next);
          emit("change");
        }}
        trackColor={{ false: colors.border, true: colors.primary }}
      />
    </View>
  );
};

const SelectWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value, setValue, emit } = useWidgetRuntime({
    ...widget,
    bindingMode: "write",
  });
  const options = useMemo(() => {
    const raw = widget.props.options;
    if (!Array.isArray(raw)) {return [] as string[];}
    return raw
      .map((option) =>
        typeof option === "string"
          ? option
          : str((option as Record<string, unknown>)?.value)
      )
      .filter((option) => option.length > 0);
  }, [widget.props.options]);

  return (
    <View style={styles.field}>
      <FieldLabel text={str(widget.props.label)} colors={colors} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {options.map((option) => {
            const selected = str(value) === option;
            return (
              <TouchableOpacity
                key={option}
                disabled={widget.disabled}
                onPress={() => {
                  setValue(option);
                  emit("change");
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected
                      ? colors.primary
                      : colors.inputBg,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: selected ? colors.textOnPrimary : colors.text,
                  }}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

/** The author's option list, tolerating both `["a"]` and `[{ value: "a" }]`. */
const useOptionValues = (raw: unknown): string[] =>
  useMemo(() => {
    if (!Array.isArray(raw)) {return [] as string[];}
    return raw
      .map((option) =>
        typeof option === "string"
          ? option
          : str((option as Record<string, unknown>)?.value)
      )
      .filter((option) => option.length > 0);
  }, [raw]);

/** Chips rather than native radios: one tap target, and it matches Select. */
const RadioGroupWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value, setValue, emit } = useWidgetRuntime({
    ...widget,
    bindingMode: "write",
  });
  const options = useOptionValues(widget.props.options);
  return (
    <View style={styles.field}>
      <FieldLabel text={str(widget.props.label)} colors={colors} />
      <View style={styles.chipWrap}>
        {options.map((option) => {
          const selected = str(value) === option;
          return (
            <TouchableOpacity
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              disabled={widget.disabled}
              onPress={() => {
                setValue(option);
                emit("change");
              }}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? colors.primary : colors.inputBg,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={{ color: selected ? colors.textOnPrimary : colors.text }}
              >
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

/** Writes the checked options as an array, in the option list's own order. */
const CheckboxGroupWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value, setValue, emit } = useWidgetRuntime({
    ...widget,
    bindingMode: "write",
  });
  const options = useOptionValues(widget.props.options);
  const selected = Array.isArray(value) ? value.map(str) : [];
  return (
    <View style={styles.field}>
      <FieldLabel text={str(widget.props.label)} colors={colors} />
      <View style={styles.chipWrap}>
        {options.map((option) => {
          const checked = selected.includes(option);
          return (
            <TouchableOpacity
              key={option}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              disabled={widget.disabled}
              onPress={() => {
                setValue(
                  options.filter((o) =>
                    o === option ? !checked : selected.includes(o)
                  )
                );
                emit("change");
              }}
              style={[
                styles.chip,
                {
                  backgroundColor: checked ? colors.primary : colors.inputBg,
                  borderColor: checked ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={{ color: checked ? colors.textOnPrimary : colors.text }}
              >
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

/**
 * A typed field rather than a native picker: the document stores the same
 * `YYYY-MM-DD` string the web `<input type="date">` writes, and pulling in a
 * date-picker dependency to produce it would not change what the app sees.
 */
const DateInputWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value, setValue, emit } = useWidgetRuntime({
    ...widget,
    bindingMode: "write",
  });
  const withTime = widget.props.withTime === true;
  return (
    <View style={styles.field}>
      <FieldLabel text={str(widget.props.label)} colors={colors} />
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.inputBg,
            color: colors.text,
            borderColor: colors.border,
          },
        ]}
        editable={!widget.disabled}
        value={str(value)}
        autoCapitalize="none"
        placeholder={withTime ? "YYYY-MM-DDTHH:MM" : "YYYY-MM-DD"}
        placeholderTextColor={colors.textTertiary}
        onChangeText={(text) => {
          setValue(text === "" ? null : text);
          emit("change");
        }}
        onBlur={() => emit("change", "commit")}
      />
    </View>
  );
};

const ColorInputWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value, setValue, emit } = useWidgetRuntime({
    ...widget,
    bindingMode: "write",
  });
  const text = str(value);
  return (
    <View style={styles.field}>
      <FieldLabel text={str(widget.props.label) || "Color"} colors={colors} />
      <View style={styles.row}>
        <View
          style={[
            styles.swatch,
            {
              backgroundColor: /^#[0-9a-fA-F]{3,8}$/.test(text)
                ? text
                : "transparent",
              borderColor: colors.border,
            },
          ]}
        />
        <TextInput
          style={[
            styles.input,
            styles.flex,
            {
              backgroundColor: colors.inputBg,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          editable={!widget.disabled}
          value={text}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="#RRGGBB"
          placeholderTextColor={colors.textTertiary}
          onChangeText={(next) => {
            setValue(next);
            emit("change");
          }}
          onBlur={() => emit("change", "commit")}
        />
      </View>
    </View>
  );
};

const MediaInputWidget: React.FC<WidgetProps & { kind: MediaKind }> = ({
  kind,
  ...widget
}) => {
  const { colors } = useTheme();
  const { value, setValue, emit } = useWidgetRuntime({
    ...widget,
    bindingMode: "write",
  });
  const [picking, setPicking] = useState(false);
  const uri = mediaUri(value);

  const pick = useCallback(async () => {
    setPicking(true);
    try {
      const picked = await pickMediaValue(kind);
      if (picked) {
        setValue(picked);
        emit("change");
      }
    } finally {
      setPicking(false);
    }
  }, [emit, kind, setValue]);

  return (
    <View style={styles.field}>
      <FieldLabel
        text={str(widget.props.label) || `${kind} input`}
        colors={colors}
      />
      {kind === "image" && uri ? (
        <Image
          source={{ uri }}
          style={[styles.image, styles.mediaPreview]}
          resizeMode="contain"
        />
      ) : null}
      <TouchableOpacity
        disabled={widget.disabled || picking}
        onPress={() => void pick()}
        style={[
          styles.secondaryButton,
          { borderColor: colors.border, backgroundColor: colors.inputBg },
        ]}
      >
        {picking ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : (
          <Text style={{ color: colors.primary }}>
            {uri ? `Replace ${kind}` : `Choose ${kind}`}
          </Text>
        )}
      </TouchableOpacity>
      {uri && kind !== "image" ? (
        <Text
          numberOfLines={1}
          style={[styles.hint, { color: colors.textTertiary }]}
        >
          {uri}
        </Text>
      ) : null}
    </View>
  );
};

/**
 * The one widget whose control depends on the graph: it renders whatever the
 * Input node it binds to needs, so an app author places "Workflow Input" and
 * gets the right control for free.
 */
const WorkflowInputWidget: React.FC<WidgetProps> = (widget) => {
  const { io, scope } = useAppRuntimeContext();
  const input = useMemo(() => {
    const binding = widget.binding;
    if (!binding) {return undefined;}
    const operationId = scope.defaultOperationId;
    const nodeId = binding.startsWith(`op:${operationId}/in:`)
      ? binding.slice(`op:${operationId}/in:`.length)
      : undefined;
    return nodeId
      ? io.inputs.find((i) => i.nodeId === nodeId)
      : io.inputs.find((i) => i.name === binding);
  }, [io.inputs, scope.defaultOperationId, widget.binding]);

  if (!input) {
    return <UnknownWidget label={`Unbound input: ${widget.binding ?? ""}`} />;
  }

  const props = {
    ...widget,
    props: {
      ...widget.props,
      label: input.label,
      min: input.min,
      max: input.max,
      options: input.options,
      multiline: input.multiline ?? true,
    },
  };

  switch (input.kind) {
    case "boolean":
      return <SwitchWidget {...props} />;
    case "integer":
    case "float":
      return input.min !== undefined && input.max !== undefined ? (
        <SliderWidget
          {...props}
          props={{ ...props.props, step: input.kind === "integer" ? 1 : 0.01 }}
        />
      ) : (
        <NumberInputWidget {...props} />
      );
    case "select":
      return <SelectWidget {...props} />;
    case "color":
      return <ColorInputWidget {...props} />;
    case "image":
    case "audio":
    case "video":
    case "document":
      return <MediaInputWidget {...props} kind={input.kind} />;
    default:
      return <TextInputWidget {...props} />;
  }
};

// ── Actions ─────────────────────────────────────────────────────────────────

// ── Chat ────────────────────────────────────────────────────────────────────

/**
 * The conversation, plus the reply streaming in from the current run. Unlike
 * the web thread this one only displays: folding a finished reply back into the
 * conversation variable happens wherever the app was authored, and doing it
 * again here would double every turn when both surfaces are open.
 */
const ChatThreadWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const streamValue = useBindingValue(
    useBindingRef(str(widget.props.streamBinding) || undefined, "read")
  );

  const messages = useMemo(
    () => [
      ...messagesFrom(value),
      ...messagesFrom(streamValue).map((m) => ({ ...m, role: "assistant" })),
    ],
    [streamValue, value]
  );
  const maxHeight = numOr(widget.props.maxHeight, 360);

  return (
    <View style={styles.field}>
      <FieldLabel text={str(widget.props.label)} colors={colors} />
      {messages.length === 0 ? (
        <Placeholder
          text={str(widget.props.placeholder) || "No messages yet"}
          colors={colors}
        />
      ) : (
        <ScrollView style={{ maxHeight }} contentContainerStyle={styles.stack}>
          {messages.map((message, index) => (
            <View
              key={index}
              style={[
                styles.bubble,
                {
                  backgroundColor:
                    message.role === "user" ? colors.inputBg : colors.surface,
                  borderColor: colors.border,
                  alignSelf:
                    message.role === "user" ? "flex-end" : "flex-start",
                },
              ]}
            >
              <Text style={[styles.hint, { color: colors.textTertiary }]}>
                {message.role === "user" ? "You" : message.role}
              </Text>
              <MarkdownRenderer content={messageText(message.content)} />
              {(Array.isArray(message.content) ? message.content : [])
                .filter(
                  (part): part is Record<string, unknown> =>
                    typeof part === "object" && part !== null &&
                    (part as Record<string, unknown>).type !== "text"
                )
                .map((part, at) => (
                  <OutputRenderer
                    key={at}
                    value={part.image ?? part.video ?? part.audio ?? part}
                  />
                ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

/** Writes the next message and runs the operation. No attachments on mobile. */
const ChatComposerWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { write } = useAppRuntimeContext();
  const { setValue, emit, running } = useWidgetRuntime({
    ...widget,
    bindingMode: "write",
  });
  const historyRef = useBindingRef(
    str(widget.props.historyBinding) || undefined,
    "read"
  );
  const historyValue = useBindingValue(historyRef);
  const [draft, setDraft] = useState("");

  const format = str(widget.props.valueFormat) || "text";
  const canSend = draft.trim().length > 0 && !running && !widget.disabled;

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text) {return;}
    const message = composeUserMessage(text);
    const history = [...messagesFrom(historyValue), message];
    if (historyRef) {write(historyRef, history);}
    setValue(
      format === "history" ? history : format === "message" ? message : text
    );
    setDraft("");
    emit("click");
  }, [draft, emit, format, historyRef, historyValue, setValue, write]);

  return (
    <View style={styles.field}>
      <FieldLabel text={str(widget.props.label)} colors={colors} />
      <TextInput
        style={[
          styles.input,
          styles.inputMultiline,
          {
            backgroundColor: colors.inputBg,
            color: colors.text,
            borderColor: colors.border,
          },
        ]}
        editable={!widget.disabled}
        value={draft}
        multiline
        placeholder={str(widget.props.placeholder) || "Write a message…"}
        placeholderTextColor={colors.textTertiary}
        onChangeText={setDraft}
      />
      <TouchableOpacity
        accessibilityRole="button"
        disabled={!canSend}
        onPress={send}
        style={[
          styles.button,
          {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
            opacity: canSend ? 1 : 0.5,
          },
        ]}
      >
        {running ? (
          <ActivityIndicator size="small" color={colors.textOnPrimary} />
        ) : null}
        <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>
          {str(widget.props.sendLabel) || "Send"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const ButtonWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { emit, running } = useWidgetRuntime({
    ...widget,
    bindingMode: "none",
  });
  const outlined = widget.props.variant === "outlined";
  const text = widget.props.variant === "text";
  const tint =
    widget.props.color === "warning"
      ? colors.warning
      : widget.props.color === "secondary"
        ? colors.accent
        : colors.primary;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={widget.disabled}
      onPress={() => emit("click")}
      style={[
        styles.button,
        {
          backgroundColor: outlined || text ? "transparent" : tint,
          borderColor: text ? "transparent" : tint,
          opacity: widget.disabled ? 0.5 : 1,
        },
      ]}
    >
      {running ? (
        <ActivityIndicator
          size="small"
          color={outlined || text ? tint : colors.textOnPrimary}
        />
      ) : null}
      <Text
        style={[
          styles.buttonText,
          { color: outlined || text ? tint : colors.textOnPrimary },
        ]}
      >
        {str(widget.props.label) || "Run"}
      </Text>
    </TouchableOpacity>
  );
};

// ── Layout ──────────────────────────────────────────────────────────────────

const ContainerWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const title = str(widget.props.title);
  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: colors.cardBg, borderColor: colors.borderLight },
      ]}
    >
      {title ? (
        <Text style={[styles.panelTitle, { color: colors.text }]}>{title}</Text>
      ) : null}
      <ComponentList nodes={slotNodes(widget.props.content)} />
    </View>
  );
};

/** Columns stack vertically: side-by-side columns are unusable at phone width. */
const ColumnsWidget: React.FC<WidgetProps> = (widget) => (
  <View style={styles.stack}>
    <ComponentList nodes={slotNodes(widget.props.left)} />
    <ComponentList nodes={slotNodes(widget.props.right)} />
  </View>
);

const DividerWidget: React.FC = () => {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
};

const SpacerWidget: React.FC<WidgetProps> = (widget) => (
  <View style={{ height: numOr(widget.props.height, 24) }} />
);

/** Tabs with a blank label are dropped, matching the web renderer. */
const TabsWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const panes = (["tab1", "tab2", "tab3"] as const)
    .map((key) => ({
      key,
      label: str(widget.props[`${key}Label`]),
      nodes: slotNodes(widget.props[key]),
    }))
    .filter((pane) => pane.label.trim().length > 0);
  const [active, setActive] = useState<string>("tab1");
  const current = panes.some((pane) => pane.key === active)
    ? active
    : panes[0]?.key;

  if (panes.length === 0) {return null;}
  return (
    <View style={styles.field}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {panes.map((pane) => {
            const selected = pane.key === current;
            return (
              <TouchableOpacity
                key={pane.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setActive(pane.key)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? colors.primary : colors.inputBg,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: selected ? colors.textOnPrimary : colors.text,
                  }}
                >
                  {pane.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      {panes.map((pane) =>
        // Hidden rather than unmounted, so a widget's view state and any run it
        // started survive switching tabs — same as the web renderer.
        <View key={pane.key} style={pane.key === current ? undefined : styles.hidden}>
          <ComponentList nodes={pane.nodes} />
        </View>
      )}
    </View>
  );
};

const AccordionWidget: React.FC<WidgetProps> = (widget) => {
  const { colors } = useTheme();
  const [open, setOpen] = useState(widget.props.defaultOpen !== false);
  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: colors.cardBg, borderColor: colors.borderLight },
      ]}
    >
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((prev) => !prev)}
        style={styles.row}
      >
        <Text style={[styles.panelTitle, { color: colors.text }]}>
          {str(widget.props.title) || "Section"}
        </Text>
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          {open ? "−" : "+"}
        </Text>
      </TouchableOpacity>
      {open ? <ComponentList nodes={slotNodes(widget.props.content)} /> : null}
    </View>
  );
};

const UnknownWidget: React.FC<{ label: string }> = ({ label }) => {
  const { colors } = useTheme();
  return (
    <Text style={[styles.hint, { color: colors.textTertiary }]}>{label}</Text>
  );
};

// ── Tree ────────────────────────────────────────────────────────────────────

const slotNodes = (value: unknown): ComponentNode[] =>
  Array.isArray(value)
    ? value.filter(
        (node): node is ComponentNode =>
          typeof node === "object" &&
          node !== null &&
          typeof (node as ComponentNode).type === "string"
      )
    : [];

const RENDERERS: Record<string, React.FC<WidgetProps>> = {
  Heading: HeadingWidget,
  Text: TextWidget,
  Markdown: MarkdownWidget,
  Image: ImageWidget,
  Audio: MediaOutputWidget,
  Video: MediaOutputWidget,
  Json: MediaOutputWidget,
  Output: MediaOutputWidget,
  Sketch: SketchWidget,
  Timeline: TimelineWidget,
  Table: TableWidget,
  Progress: ProgressWidget,
  Alert: AlertWidget,
  CodeBlock: CodeBlockWidget,
  List: ListWidget,
  KeyValue: KeyValueWidget,
  Stat: StatWidget,
  Download: DownloadWidget,
  WorkflowInput: WorkflowInputWidget,
  TextInput: TextInputWidget,
  NumberInput: NumberInputWidget,
  Slider: SliderWidget,
  Switch: SwitchWidget,
  Select: SelectWidget,
  RadioGroup: RadioGroupWidget,
  CheckboxGroup: CheckboxGroupWidget,
  DateInput: DateInputWidget,
  ColorInput: ColorInputWidget,
  ImageInput: (props) => <MediaInputWidget {...props} kind="image" />,
  AudioInput: (props) => <MediaInputWidget {...props} kind="audio" />,
  VideoInput: (props) => <MediaInputWidget {...props} kind="video" />,
  DocumentInput: (props) => <MediaInputWidget {...props} kind="document" />,
  ...RESOURCE_RENDERERS,
  ChatThread: ChatThreadWidget,
  ChatComposer: ChatComposerWidget,
  ModelSelect: ModelSelectWidget,
  Button: ButtonWidget,
  Container: ContainerWidget,
  Columns: ColumnsWidget,
  Tabs: TabsWidget,
  Accordion: AccordionWidget,
  Divider: DividerWidget as React.FC<WidgetProps>,
  Spacer: SpacerWidget,
};

/**
 * Applies the app layer's three declarative logic props — `visibleWhen`,
 * `disabledWhen` and `format` — in one place, then renders the widget.
 */
const WidgetNode: React.FC<{ node: ComponentNode }> = ({ node }) => {
  const props = node.props;
  const visible = useCondition(props.visibleWhen as ConditionProps, true);
  const disabled = useCondition(props.disabledWhen as ConditionProps, false);
  const formatted = useFormatted(
    typeof props.format === "string" ? props.format : undefined
  );

  const Renderer = RENDERERS[node.type];
  if (!Renderer) {
    // A catalog type with no renderer here is one mobile has yet to grow; an
    // unknown type is a document from a newer builder. Both say so rather than
    // vanish.
    const known = node.type in WIDGET_CATALOG;
    return (
      <UnknownWidget
        label={
          known
            ? `${WIDGET_CATALOG[node.type].label} is not available on mobile`
            : `Unknown widget: ${node.type}`
        }
      />
    );
  }
  if (!visible) {return null;}

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
};

export const ComponentList: React.FC<{ nodes: ComponentNode[] }> = ({
  nodes,
}) => (
  <View style={styles.stack}>
    {nodes.map((node, index) => (
      <WidgetNode key={str(node.props?.id) || `${node.type}-${index}`} node={node} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  flex: {
    flex: 1,
  },
  heading: {
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
  },
  hint: {
    fontSize: 12,
  },
  field: {
    gap: 8,
  },
  input: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
  },
  inputMultiline: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
  },
  image: {
    width: "100%",
    borderRadius: 10,
  },
  mediaPreview: {
    height: 180,
  },
  bubble: {
    maxWidth: "88%",
    gap: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  documentCard: {
    gap: 4,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  placeholder: {
    padding: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
  },
  placeholderText: {
    fontSize: 13,
  },
  table: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
  },
  tableCell: {
    minWidth: 120,
    maxWidth: 240,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  tableHeader: {
    fontWeight: "700",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  panel: {
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 16,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  hidden: {
    display: "none",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  alert: {
    gap: 4,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  code: {
    padding: 12,
    borderRadius: 10,
  },
  codeText: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
  },
  listItem: {
    flexDirection: "row",
    gap: 8,
  },
  kvRow: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: "flex-start",
  },
  kvValue: {
    flexShrink: 1,
    textAlign: "right",
  },
  stat: {
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
});
