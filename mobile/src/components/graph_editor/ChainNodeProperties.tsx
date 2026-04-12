/**
 * Renders the editable properties of a chain node.
 *
 * Re-uses the existing mobile property components (StringProperty,
 * IntegerProperty, etc.) mapped by the protocol Property type metadata.
 */

import React, { useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Switch,
  StyleSheet,
} from "react-native";
import { useTheme } from "../../hooks/useTheme";
import type { Property, PropertyTypeMetadata } from "../../types/ApiTypes";

interface ChainNodePropertiesProps {
  properties: Property[];
  values: Record<string, unknown>;
  /** Input that is being fed by the previous node (shown as "connected"). */
  connectedInput: string | null;
  onUpdate: (name: string, value: unknown) => void;
}

function getWidgetType(prop: Property): string {
  const t = prop.type.type;

  // Enum values
  if (prop.values && prop.values.length > 0) return "enum";

  switch (t) {
    case "str":
    case "string":
      return "string";
    case "int":
    case "integer":
      return "integer";
    case "float":
    case "number":
      return "float";
    case "bool":
    case "boolean":
      return "boolean";
    default:
      return "string";
  }
}

// ── Individual property renderers ────────────────────────────────────

const StringPropertyWidget: React.FC<{
  prop: Property;
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ReturnType<typeof useTheme>["colors"];
}> = ({ prop, value, onChange, colors }) => (
  <TextInput
    style={[
      styles.textInput,
      {
        backgroundColor: colors.inputBg,
        color: colors.text,
        borderColor: colors.border,
      },
    ]}
    value={String(value ?? "")}
    onChangeText={onChange}
    placeholder={prop.description ?? `Enter ${prop.title ?? prop.name}`}
    placeholderTextColor={colors.textTertiary}
    multiline={String(value ?? "").length > 60}
  />
);

const IntegerPropertyWidget: React.FC<{
  prop: Property;
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ReturnType<typeof useTheme>["colors"];
}> = ({ prop, value, onChange, colors }) => (
  <View style={styles.numberRow}>
    <TextInput
      style={[
        styles.numberInput,
        {
          backgroundColor: colors.inputBg,
          color: colors.text,
          borderColor: colors.border,
        },
      ]}
      value={String(value ?? "")}
      onChangeText={(text) => {
        const parsed = parseInt(text, 10);
        if (!isNaN(parsed)) onChange(parsed);
        else if (text === "" || text === "-") onChange(text);
      }}
      keyboardType="number-pad"
      placeholder="0"
      placeholderTextColor={colors.textTertiary}
    />
    {prop.min != null && prop.max != null && (
      <Text style={[styles.rangeHint, { color: colors.textTertiary }]}>
        {prop.min} \u2013 {prop.max}
      </Text>
    )}
  </View>
);

const FloatPropertyWidget: React.FC<{
  prop: Property;
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ReturnType<typeof useTheme>["colors"];
}> = ({ prop, value, onChange, colors }) => (
  <View style={styles.numberRow}>
    <TextInput
      style={[
        styles.numberInput,
        {
          backgroundColor: colors.inputBg,
          color: colors.text,
          borderColor: colors.border,
        },
      ]}
      value={String(value ?? "")}
      onChangeText={(text) => {
        const parsed = parseFloat(text);
        if (!isNaN(parsed)) onChange(parsed);
        else if (text === "" || text === "-" || text === ".") onChange(text);
      }}
      keyboardType="decimal-pad"
      placeholder="0.0"
      placeholderTextColor={colors.textTertiary}
    />
    {prop.min != null && prop.max != null && (
      <Text style={[styles.rangeHint, { color: colors.textTertiary }]}>
        {prop.min} \u2013 {prop.max}
      </Text>
    )}
  </View>
);

const BoolPropertyWidget: React.FC<{
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ReturnType<typeof useTheme>["colors"];
}> = ({ value, onChange, colors }) => (
  <Switch
    value={Boolean(value)}
    onValueChange={onChange}
    trackColor={{ false: colors.border, true: colors.primary + "80" }}
    thumbColor={Boolean(value) ? colors.primary : colors.textTertiary}
  />
);

const EnumPropertyWidget: React.FC<{
  prop: Property;
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ReturnType<typeof useTheme>["colors"];
}> = ({ prop, value, onChange, colors }) => {
  const options = prop.values ?? [];
  return (
    <View style={styles.enumContainer}>
      {options.map((opt) => {
        const isSelected = String(value) === String(opt);
        return (
          <View
            key={String(opt)}
            style={[
              styles.enumOption,
              {
                backgroundColor: isSelected
                  ? colors.primaryMuted
                  : colors.inputBg,
                borderColor: isSelected
                  ? colors.primary + "60"
                  : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.enumText,
                {
                  color: isSelected ? colors.primary : colors.text,
                },
              ]}
              onPress={() => onChange(opt)}
            >
              {String(opt)}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

// ── Main component ───────────────────────────────────────────────────

export const ChainNodeProperties: React.FC<ChainNodePropertiesProps> = ({
  properties,
  values,
  connectedInput,
  onUpdate,
}) => {
  const { colors } = useTheme();

  const renderProperty = useCallback(
    (prop: Property) => {
      const isConnected = prop.name === connectedInput;
      const value = values[prop.name] ?? prop.default;
      const widget = getWidgetType(prop);

      return (
        <View key={prop.name} style={styles.propertyRow}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, { color: colors.text }]}>
              {prop.title ?? prop.name}
            </Text>
            {prop.required && (
              <Text style={[styles.required, { color: colors.error }]}>*</Text>
            )}
            {isConnected && (
              <View
                style={[
                  styles.connectedBadge,
                  { backgroundColor: colors.accentMuted },
                ]}
              >
                <Text
                  style={[styles.connectedText, { color: colors.accent }]}
                >
                  connected
                </Text>
              </View>
            )}
          </View>

          {prop.description && !isConnected ? (
            <Text
              style={[styles.description, { color: colors.textTertiary }]}
              numberOfLines={2}
            >
              {prop.description}
            </Text>
          ) : null}

          {isConnected ? (
            <View
              style={[
                styles.connectedPlaceholder,
                {
                  backgroundColor: colors.accentMuted,
                  borderColor: colors.accent + "30",
                },
              ]}
            >
              <Text
                style={[
                  styles.connectedPlaceholderText,
                  { color: colors.accent },
                ]}
              >
                Value provided by previous node
              </Text>
            </View>
          ) : (
            <>
              {widget === "string" && (
                <StringPropertyWidget
                  prop={prop}
                  value={value}
                  onChange={(v) => onUpdate(prop.name, v)}
                  colors={colors}
                />
              )}
              {widget === "integer" && (
                <IntegerPropertyWidget
                  prop={prop}
                  value={value}
                  onChange={(v) => onUpdate(prop.name, v)}
                  colors={colors}
                />
              )}
              {widget === "float" && (
                <FloatPropertyWidget
                  prop={prop}
                  value={value}
                  onChange={(v) => onUpdate(prop.name, v)}
                  colors={colors}
                />
              )}
              {widget === "boolean" && (
                <BoolPropertyWidget
                  value={value}
                  onChange={(v) => onUpdate(prop.name, v)}
                  colors={colors}
                />
              )}
              {widget === "enum" && (
                <EnumPropertyWidget
                  prop={prop}
                  value={value}
                  onChange={(v) => onUpdate(prop.name, v)}
                  colors={colors}
                />
              )}
            </>
          )}
        </View>
      );
    },
    [colors, values, connectedInput, onUpdate]
  );

  if (properties.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
          No configurable properties
        </Text>
      </View>
    );
  }

  return <View style={styles.container}>{properties.map(renderProperty)}</View>;
};

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  emptyContainer: {
    paddingVertical: 12,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    fontStyle: "italic",
  },
  propertyRow: {
    gap: 4,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  required: {
    fontSize: 14,
    fontWeight: "700",
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4,
  },
  connectedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  connectedText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  connectedPlaceholder: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  connectedPlaceholderText: {
    fontSize: 13,
    fontStyle: "italic",
  },
  textInput: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 44,
  },
  numberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  numberInput: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 44,
  },
  rangeHint: {
    fontSize: 12,
  },
  enumContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  enumOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  enumText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
