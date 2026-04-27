/**
 * A single node in the vertical chain.
 *
 * Displays the node title, namespace badge, step number,
 * expand/collapse toggle, and (when expanded) properties
 * + output selector + input mapping selector.
 *
 * When a workflowId is provided, the card also reflects
 * execution state (running / completed / error) from the
 * WorkflowRunner store: a progress bar, status icons and a
 * result preview for the selected output.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
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
import type { ChainNode, InputSource } from "../../types/graphEditor";
import { ChainNodeProperties } from "./ChainNodeProperties";
import { OutputSelector } from "./OutputSelector";
import { InputMappingSelector } from "./InputMappingSelector";
import { OutputRenderer } from "../outputs/OutputRenderer";
import { useWorkflowRunner } from "../../stores/WorkflowRunner";

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
  /** Workflow id, used to subscribe to execution state. Null when not running. */
  workflowId: string | null;
  /** All nodes before this one in the chain (for input mapping). */
  previousNodes: ChainNode[];
  onToggleExpanded: () => void;
  onUpdateProperty: (name: string, value: unknown) => void;
  onSetOutput: (outputName: string) => void;
  onSetInputMapping: (inputName: string, source: InputSource | null) => void;
  onAddDynamicInput?: (inputName: string) => void;
  onRemoveDynamicInput?: (inputName: string) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function getOutputFromResult(result: unknown): unknown {
  if (result === undefined || result === null) return undefined;
  if (
    typeof result === "object" &&
    !Array.isArray(result) &&
    "output" in (result as Record<string, unknown>)
  ) {
    return (result as Record<string, unknown>).output;
  }
  return result;
}

/**
 * Subscribe to the WorkflowRunner for execution state on a given node.
 * Returns sensible defaults when no workflowId is provided.
 */
function useNodeExecState(workflowId: string | null, nodeId: string) {
  // Always call the hook so the rules of hooks hold — use an empty id
  // when we don't want to track execution.
  const runnerStore = useWorkflowRunner(workflowId ?? "__idle__");
  const status = runnerStore((s) =>
    workflowId ? s.nodeStatus[nodeId] : undefined
  );
  const progress = runnerStore((s) =>
    workflowId ? s.nodeProgress[nodeId] : undefined
  );
  // Per-node result from node_update, falling back to job-level results
  const result = runnerStore((s) => {
    if (!workflowId) return undefined;
    const nodeResult = s.nodeResults[nodeId];
    if (nodeResult !== undefined) return nodeResult;
    const results = s.results as Record<string, unknown> | null | undefined;
    if (results && typeof results === "object" && !Array.isArray(results)) {
      return (results as Record<string, unknown>)[nodeId];
    }
    return undefined;
  });
  // Per-node error message
  const error = runnerStore((s) =>
    workflowId ? s.nodeErrors[nodeId] : undefined
  );

  const isRunning =
    status === "running" || status === "booting" || status === "starting";
  const isCompleted = status === "completed";
  const isError = status === "error";

  return { status, progress, result, error, isRunning, isCompleted, isError };
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
  workflowId,
  previousNodes,
  onToggleExpanded,
  onUpdateProperty,
  onSetOutput,
  onSetInputMapping,
  onAddDynamicInput,
  onRemoveDynamicInput,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}) => {
  const { colors, shadows } = useTheme();
  const nsColor = getNamespaceColor(node.metadata.namespace);

  const { progress, result, error, isRunning, isCompleted, isError } =
    useNodeExecState(workflowId, node.id);

  const outputValue = useMemo(() => getOutputFromResult(result), [result]);

  // Indeterminate progress bar animation
  const indeterminateAnim = useRef(new Animated.Value(0)).current;
  const hasDeterminateProgress = progress !== undefined && progress.total > 0;
  useEffect(() => {
    if (!isRunning || hasDeterminateProgress) {
      indeterminateAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(indeterminateAnim, {
        toValue: 1,
        duration: 1500,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [isRunning, hasDeterminateProgress, indeterminateAnim]);

  // Execution time tracking
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (isRunning) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  const handleToggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggleExpanded();
  }, [onToggleExpanded]);

  const outputCount = node.metadata.outputs.length;

  // Spinning icon animation for running state
  const spinAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isRunning) {
      spinAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [isRunning, spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // Pulse animation while running (mirrors the web's pulseGlow keyframes).
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isRunning) {
      pulseAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isRunning, pulseAnim]);

  // Border color reflects execution state (running pulse, completed, error),
  // falling back to the namespace color when expanded.
  const borderColor = isRunning
    ? (pulseAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [nsColor + "50", nsColor],
      }) as unknown as string)
    : isError
      ? colors.error
      : isCompleted
        ? colors.success
        : node.expanded
          ? nsColor + "50"
          : colors.border;

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor,
        },
        shadows.small,
      ]}
    >
      {/* Progress bar while running */}
      {isRunning && (
        <View
          style={[styles.progressTrack, { backgroundColor: nsColor + "20" }]}
        >
          {hasDeterminateProgress ? (
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: nsColor,
                  width: `${Math.min(100, (progress.progress / progress.total) * 100)}%`,
                },
              ]}
            />
          ) : (
            <Animated.View
              style={[
                styles.progressFill,
                {
                  backgroundColor: nsColor,
                  width: "40%",
                  transform: [
                    {
                      translateX: indeterminateAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-100, 300],
                      }),
                    },
                  ],
                },
              ]}
            />
          )}
        </View>
      )}
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
          {node.expanded && (
            <Text
              style={[styles.namespace, { color: nsColor }]}
              numberOfLines={1}
            >
              {formatNamespace(node.metadata.namespace)}
            </Text>
          )}
        </View>

        {/* Running indicator with time */}
        {isRunning && (
          <View style={styles.statusRow}>
            {hasDeterminateProgress && (
              <Text style={[styles.progressText, { color: nsColor }]}>
                {progress.progress}/{progress.total}
              </Text>
            )}
            <Text style={[styles.elapsedText, { color: colors.textTertiary }]}>
              {elapsed}s
            </Text>
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Ionicons name="sync-outline" size={16} color={nsColor} />
            </Animated.View>
          </View>
        )}
        {isCompleted && (
          <View style={styles.statusRow}>
            {elapsed > 0 && (
              <Text
                style={[styles.elapsedText, { color: colors.textTertiary }]}
              >
                {elapsed}s
              </Text>
            )}
            <Ionicons
              name="checkmark-circle"
              size={18}
              color={colors.success}
            />
          </View>
        )}
        {isError && (
          <Ionicons
            name="alert-circle"
            size={18}
            color={colors.error}
          />
        )}

        <Ionicons
          name={node.expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.textSecondary}
        />
      </TouchableOpacity>

      {/* Error message (visible even when collapsed) */}
      {isError && error && (
        <View style={[styles.errorBanner, { backgroundColor: colors.error + "12" }]}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]} numberOfLines={4}>
            {error}
          </Text>
        </View>
      )}

      {/* Result preview (visible even when collapsed) */}
      {outputValue !== undefined && !isRunning && !isError && (
        <View style={styles.resultPreview}>
          <OutputRenderer value={outputValue} />
        </View>
      )}

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

          {/* Input mappings (wire inputs from any previous node) */}
          {(previousNodes.length > 0 || node.metadata.is_dynamic) && (
            <View style={styles.mappingSection}>
              <InputMappingSelector
                properties={node.metadata.properties}
                inputMappings={node.inputMappings}
                dynamicProperties={node.dynamicProperties}
                isDynamic={node.metadata.is_dynamic}
                previousNodes={previousNodes}
                onSetMapping={onSetInputMapping}
                onAddDynamicInput={onAddDynamicInput}
                onRemoveDynamicInput={onRemoveDynamicInput}
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
              nodeType={node.nodeType}
              properties={node.metadata.properties}
              values={node.properties}
              connectedInputs={Object.keys(node.inputMappings)}
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
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: "hidden",
  },
  progressTrack: {
    height: 3,
    width: "100%",
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
    borderRadius: 1.5,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  progressText: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  elapsedText: {
    fontSize: 11,
    fontWeight: "600",
    fontFamily: "monospace",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 12,
    padding: 10,
    borderRadius: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  resultPreview: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    maxHeight: 300,
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
  namespace: {
    fontSize: 11,
    fontWeight: "600",
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
