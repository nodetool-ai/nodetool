/**
 * Main chain-based graph editor.
 *
 * Renders a vertical scrollable list of chain node cards
 * threaded together, with add-node buttons between each
 * pair and at the end.
 */

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { useGraphEditorStore } from "../../stores/GraphEditorStore";
import { ChainNodeCard } from "./ChainNodeCard";
import { AddNodeButton } from "./AddNodeButton";
import { NodePickerModal } from "./NodePickerModal";
import type { NodeMetadata } from "../../types/ApiTypes";
import type { ChainNode, InputSource } from "../../types/graphEditor";

interface ChainRowProps {
  node: ChainNode;
  index: number;
  totalNodes: number;
  workflowId: string | null;
  previousNodes: ChainNode[];
  onRemove: (nodeId: string) => void;
}

/**
 * `previousNodes` is a fresh slice every render, so the default memo comparison
 * would never hit. Compare it by contents: `updateProperty` and friends rebuild
 * only the node they touch, so the prefix of an untouched card holds the same
 * node objects it did before.
 */
const chainRowPropsEqual = (a: ChainRowProps, b: ChainRowProps): boolean =>
  a.node === b.node &&
  a.index === b.index &&
  a.totalNodes === b.totalNodes &&
  a.workflowId === b.workflowId &&
  a.onRemove === b.onRemove &&
  a.previousNodes.length === b.previousNodes.length &&
  a.previousNodes.every((prev, i) => prev === b.previousNodes[i]);

/**
 * Binding the card's handlers here rather than in the parent's map is what makes
 * the memo hold. A card carries four runner subscriptions, two looping
 * animations and a per-second timer, so an untouched card is expensive to
 * repaint — and before this, every keystroke in one node's property, and every
 * open of the node picker, repainted the whole chain.
 */
const ChainRow = React.memo(function ChainRow({
  node,
  index,
  totalNodes,
  workflowId,
  previousNodes,
  onRemove,
}: ChainRowProps) {
  const showNodePicker = useGraphEditorStore((s) => s.showNodePicker);
  const toggleExpanded = useGraphEditorStore((s) => s.toggleExpanded);
  const updateProperty = useGraphEditorStore((s) => s.updateProperty);
  const setSelectedOutput = useGraphEditorStore((s) => s.setSelectedOutput);
  const setInputMapping = useGraphEditorStore((s) => s.setInputMapping);
  const addDynamicInput = useGraphEditorStore((s) => s.addDynamicInput);
  const removeDynamicInput = useGraphEditorStore((s) => s.removeDynamicInput);
  const duplicateNode = useGraphEditorStore((s) => s.duplicateNode);
  const moveNode = useGraphEditorStore((s) => s.moveNode);

  const nodeId = node.id;
  const handleInsertAbove = useCallback(
    () => showNodePicker(index),
    [showNodePicker, index]
  );
  const handleToggleExpanded = useCallback(
    () => toggleExpanded(nodeId),
    [toggleExpanded, nodeId]
  );
  const handleUpdateProperty = useCallback(
    (name: string, value: unknown) => updateProperty(nodeId, name, value),
    [updateProperty, nodeId]
  );
  const handleSetOutput = useCallback(
    (outputName: string) => setSelectedOutput(nodeId, outputName),
    [setSelectedOutput, nodeId]
  );
  const handleSetInputMapping = useCallback(
    (inputName: string, source: InputSource | null) =>
      setInputMapping(nodeId, inputName, source),
    [setInputMapping, nodeId]
  );
  const handleAddDynamicInput = useCallback(
    (inputName: string) => addDynamicInput(nodeId, inputName),
    [addDynamicInput, nodeId]
  );
  const handleRemoveDynamicInput = useCallback(
    (inputName: string) => removeDynamicInput(nodeId, inputName),
    [removeDynamicInput, nodeId]
  );
  const handleRemove = useCallback(() => onRemove(nodeId), [onRemove, nodeId]);
  const handleDuplicate = useCallback(
    () => duplicateNode(nodeId),
    [duplicateNode, nodeId]
  );
  const handleMoveUp = useCallback(
    () => moveNode(index, index - 1),
    [moveNode, index]
  );
  const handleMoveDown = useCallback(
    () => moveNode(index, index + 1),
    [moveNode, index]
  );

  return (
    <View>
      {/* Insert point above this node */}
      <AddNodeButton onPress={handleInsertAbove} />

      <ChainNodeCard
        node={node}
        index={index}
        totalNodes={totalNodes}
        workflowId={workflowId}
        previousNodes={previousNodes}
        onToggleExpanded={handleToggleExpanded}
        onUpdateProperty={handleUpdateProperty}
        onSetOutput={handleSetOutput}
        onSetInputMapping={handleSetInputMapping}
        onAddDynamicInput={handleAddDynamicInput}
        onRemoveDynamicInput={handleRemoveDynamicInput}
        onRemove={handleRemove}
        onDuplicate={handleDuplicate}
        onMoveUp={handleMoveUp}
        onMoveDown={handleMoveDown}
      />
    </View>
  );
}, chainRowPropsEqual);

export const ChainEditor: React.FC = () => {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  // ── Store selectors ────────────────────────────────────────────────
  const chain = useGraphEditorStore((s) => s.chain);
  const workflowId = useGraphEditorStore((s) => s.workflowId);
  const allMetadata = useGraphEditorStore((s) => s.allMetadata);
  const metadataLoading = useGraphEditorStore((s) => s.metadataLoading);
  const metadataError = useGraphEditorStore((s) => s.metadataError);
  const nodePickerVisible = useGraphEditorStore((s) => s.nodePickerVisible);
  const insertAtIndex = useGraphEditorStore((s) => s.insertAtIndex);

  const fetchMetadata = useGraphEditorStore((s) => s.fetchMetadata);
  const addNode = useGraphEditorStore((s) => s.addNode);
  const removeNode = useGraphEditorStore((s) => s.removeNode);
  const showNodePicker = useGraphEditorStore((s) => s.showNodePicker);
  const hideNodePicker = useGraphEditorStore((s) => s.hideNodePicker);

  // Built once per chain change instead of a fresh `chain.slice(0, index)` per
  // card per render — the prefixes are what each row's memo compares against.
  const previousNodesByIndex = useMemo(
    () => chain.map((_, index) => chain.slice(0, index)),
    [chain]
  );

  // ── Fetch metadata on mount ────────────────────────────────────────
  useEffect(() => {
    if (allMetadata.length === 0 && !metadataLoading) {
      fetchMetadata();
    }
  }, [allMetadata.length, metadataLoading, fetchMetadata]);

  // ── Handlers ───────────────────────────────────────────────────────
  const handleAddNode = useCallback(
    (metadata: NodeMetadata) => {
      const idx = insertAtIndex === -1 ? undefined : insertAtIndex;
      addNode(metadata, idx);
      hideNodePicker();
      // Scroll to the new node after a tick
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 300);
    },
    [addNode, hideNodePicker, insertAtIndex]
  );

  const handleRemove = useCallback(
    (nodeId: string) => {
      Alert.alert("Remove Node", "Are you sure you want to remove this node?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeNode(nodeId),
        },
      ]);
    },
    [removeNode]
  );

  const handleAppend = useCallback(() => showNodePicker(-1), [showNodePicker]);

  // ── Render ─────────────────────────────────────────────────────────

  if (metadataLoading && allMetadata.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading node catalog...
        </Text>
      </View>
    );
  }

  if (metadataError) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Ionicons name="warning-outline" size={48} color={colors.error} />
        <Text style={[styles.errorText, { color: colors.error }]}>
          {metadataError}
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={fetchMetadata}
        >
          <Text style={[styles.retryText, { color: colors.textOnPrimary }]}>
            Retry
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Chain */}
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={metadataLoading}
              onRefresh={fetchMetadata}
              tintColor={colors.primary}
            />
          }
        >
          {chain.length === 0 ? (
            <View style={styles.emptyState}>
              <View
                style={[
                  styles.emptyIcon,
                  { backgroundColor: colors.primaryMuted },
                ]}
              >
                <Ionicons
                  name="git-network-outline"
                  size={48}
                  color={colors.primary}
                />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Build Your Workflow
              </Text>
              <Text
                style={[styles.emptySubtitle, { color: colors.textSecondary }]}
              >
                Add nodes to create a processing chain.{"\n"}
                Each node's output flows into the next.
              </Text>
              <AddNodeButton
                isHero
                onPress={() => showNodePicker(0)}
              />
            </View>
          ) : (
            <>
              {chain.map((node, index) => (
                <ChainRow
                  key={node.id}
                  node={node}
                  index={index}
                  totalNodes={chain.length}
                  workflowId={workflowId}
                  previousNodes={previousNodesByIndex[index]}
                  onRemove={handleRemove}
                />
              ))}

              {/* Add button at the end */}
              <AddNodeButton onPress={handleAppend} />
            </>
          )}

          {/* Bottom spacer for keyboard */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Node picker modal */}
        <NodePickerModal
          visible={nodePickerVisible}
          metadata={allMetadata}
          onSelect={handleAddNode}
          onClose={hideNodePicker}
        />
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    alignItems: "stretch",
    maxWidth: 600,
    width: "100%",
    alignSelf: "center",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    marginTop: 8,
  },
  errorText: {
    fontSize: 15,
    textAlign: "center",
    marginHorizontal: 32,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  retryText: {
    fontSize: 15,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "800",
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  bottomSpacer: {
    height: 120,
  },
});
