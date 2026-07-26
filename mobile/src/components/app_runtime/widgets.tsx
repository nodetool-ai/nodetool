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
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  WIDGET_CATALOG,
  type AppEvent,
  type ConditionProps,
} from "@nodetool-ai/app-runtime";

import { useTheme } from "../../hooks/useTheme";
import type { ThemeColors } from "../../utils/theme";
import { apiService } from "../../services/api";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import { OutputRenderer } from "../outputs/OutputRenderer";
import { useAppRuntimeContext, useCondition, useFormatted } from "./AppRuntimeContext";
import { useWidgetRuntime } from "./useWidgetRuntime";
import { SliderControl } from "./SliderControl";
import { RESOURCE_RENDERERS } from "./resourceWidgets";
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

// ── Inputs ──────────────────────────────────────────────────────────────────

const FieldLabel: React.FC<{ text: string; colors: ThemeColors }> = ({
  text,
  colors,
}) =>
  text ? (
    <Text style={[styles.label, { color: colors.text }]}>{text}</Text>
  ) : null;

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
  Table: TableWidget,
  Progress: ProgressWidget,
  WorkflowInput: WorkflowInputWidget,
  TextInput: TextInputWidget,
  NumberInput: NumberInputWidget,
  Slider: SliderWidget,
  Switch: SwitchWidget,
  Select: SelectWidget,
  ColorInput: ColorInputWidget,
  ImageInput: (props) => <MediaInputWidget {...props} kind="image" />,
  AudioInput: (props) => <MediaInputWidget {...props} kind="audio" />,
  VideoInput: (props) => <MediaInputWidget {...props} kind="video" />,
  DocumentInput: (props) => <MediaInputWidget {...props} kind="document" />,
  ...RESOURCE_RENDERERS,
  Button: ButtonWidget,
  Container: ContainerWidget,
  Columns: ColumnsWidget,
  Divider: DividerWidget as React.FC<WidgetProps>,
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
});
