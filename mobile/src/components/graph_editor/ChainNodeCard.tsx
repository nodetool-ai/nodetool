/**
 * A single node in the vertical chain.
 *
 * Displays the node title, namespace badge, step number,
 * expand/collapse toggle, and (when expanded) properties
 * + output selector + input mapping selector.
 */

import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import type { ChainNode } from "../../types/graphEditor";
import type { PropertyTypeMetadata } from "../../types/ApiTypes";
import { ChainNodeProperties } from "./ChainNodeProperties";
import { OutputSelector } from "./OutputSelector";
import { InputMappingSelector } from "./InputMappingSelector";

// Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ChainNodeCardProps {
  node: ChainNode;
  index: number;
  totalNodes: number;
  /** Output type from the previous node (null for the first node). */
  prevOutputType: PropertyTypeMetadata | null;
  onToggleExpanded: () => void;
  onUpdateProperty: (name: string, value: unknown) => void;
  onSetOutput: (outputName: string) => void;
  onSetInputMapping: (inputName: string) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const NAMESPACE_COLORS: Record<string, string> = {
  text: "#3B82F6",
  image: "#8B5CF6",
  audio: "#EC4899",
  video: "#F97316",
  math: "#10B981",
  list: "#06B6D4",
  logic: "#F59E0B",
  input: "#6366F1",
  output: "#14B8A6",
  llm: "#8B5CF6",
  agents: "#F43F5E",
  http: "#0EA5E9",
  data: "#84CC16",
};

function getNamespaceColor(namespace: string): string {
  const key = namespace.split(".").pop()?.toLowerCase() ?? "";
  return NAMESPACE_COLORS[key] ?? "#6B7280";
}

function formatNamespace(ns: string): string {
  const parts = ns.split(".");
  return parts.length > 1
    ? parts.slice(1).join(" / ")
    : ns;
}

export const ChainNodeCard: React.FC<ChainNodeCardProps> = ({
  node,
  index,
  totalNodes,
  prevOutputType,
  onToggleExpanded,
  onUpdateProperty,
  onSetOutput,
  onSetInputMapping,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}) => {
  const { colors, shadows } = useTheme();
  const nsColor = getNamespaceColor(node.metadata.namespace);

  const handleToggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggleExpanded();
  }, [onToggleExpanded]);

  const outputCount = node.metadata.outputs.length;
  const propertyCount = node.metadata.properties.length;

  // Filter to non-connected properties for the summary
  const configuredCount = useMemo(() => {
    return Object.keys(node.properties).filter(
      (k) => node.properties[k] !== undefined && node.properties[k] !== ""
    ).length;
  }, [node.properties]);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: node.expanded ? nsColor + "50" : colors.border,
        },
        shadows.small,
      ]}
    >
      {/* Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={handleToggle}
        activeOpacity={0.7}
      >
        {/* Step indicator */}
        <View
          style={[
            styles.stepBadge,
            { backgroundColor: nsColor + "20" },
          ]}
        >
          <Text style={[styles.stepNumber, { color: nsColor }]}>
            {index + 1}
          </Text>
        </View>

        <View style={styles.headerContent}>
          <Text
            style={[styles.title, { color: colors.text }]}
            numberOfLines={1}
          >
            {node.metadata.title}
          </Text>
          <View style={styles.subtitleRow}>
            <Text style={[styles.namespace, { color: nsColor }]}>
              {formatNamespace(node.metadata.namespace)}
            </Text>
            {!node.expanded && propertyCount > 0 && (
              <Text
                style={[styles.configSummary, { color: colors.textTertiary }]}
              >
                {configuredCount}/{propertyCount} configured
              </Text>
            )}
          </View>
        </View>

        <Ionicons
          name={node.expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.textSecondary}
        />
      </TouchableOpacity>

      {/* Expanded content */}
      {node.expanded && (
        <View style={styles.expandedContent}>
          {/* Description */}
          {node.metadata.description ? (
            <Text
              style={[styles.description, { color: colors.textSecondary }]}
              numberOfLines={3}
            >
              {node.metadata.description}
            </Text>
          ) : null}

          {/* Input mapping (if not the first node) */}
          {index > 0 && (
            <View style={styles.mappingSection}>
              <InputMappingSelector
                properties={node.metadata.properties}
                selectedInput={node.inputMapping}
                sourceOutputType={prevOutputType}
                onSelect={onSetInputMapping}
              />
            </View>
          )}

          {/* Properties */}
          <View
            style={[
              styles.propertiesSection,
              { borderTopColor: colors.borderLight },
            ]}
          >
            <ChainNodeProperties
              properties={node.metadata.properties}
              values={node.properties}
              connectedInput={node.inputMapping}
              onUpdate={onUpdateProperty}
            />
          </View>

          {/* Output selector (only for multi-output nodes) */}
          {outputCount > 1 && (
            <View style={styles.outputSection}>
              <OutputSelector
                outputs={node.metadata.outputs}
                selectedOutput={node.selectedOutput}
                onSelect={onSetOutput}
              />
            </View>
          )}

          {/* Actions toolbar */}
          <View
            style={[
              styles.actions,
              { borderTopColor: colors.borderLight },
            ]}
          >
            <TouchableOpacity
              style={styles.actionButton}
              onPress={onMoveUp}
              disabled={index === 0}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="arrow-up"
                size={18}
                color={index === 0 ? colors.textTertiary : colors.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={onMoveDown}
              disabled={index === totalNodes - 1}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="arrow-down"
                size={18}
                color={
                  index === totalNodes - 1
                    ? colors.textTertiary
                    : colors.textSecondary
                }
              />
            </TouchableOpacity>

            <View style={styles.actionSpacer} />

            <TouchableOpacity
              style={styles.actionButton}
              onPress={onDuplicate}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="copy-outline"
                size={18}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={onRemove}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="trash-outline"
                size={18}
                color={colors.error}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: "800",
  },
  headerContent: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  namespace: {
    fontSize: 12,
    fontWeight: "600",
  },
  configSummary: {
    fontSize: 11,
  },
  expandedContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 12,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  mappingSection: {
    paddingTop: 4,
  },
  propertiesSection: {
    paddingTop: 12,
    borderTopWidth: 1,
  },
  outputSection: {
    paddingTop: 8,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 4,
  },
  actionButton: {
    padding: 8,
  },
  actionSpacer: {
    flex: 1,
  },
});
