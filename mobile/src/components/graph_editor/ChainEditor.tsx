/**
 * Main chain-based graph editor.
 *
 * Renders a vertical scrollable list of chain node cards
 * connected by visual connectors, with add-node buttons
 * between each pair and at the end.
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
import { ChainConnector } from "./ChainConnector";
import { AddNodeButton } from "./AddNodeButton";
import { NodePickerModal } from "./NodePickerModal";
import type { NodeMetadata } from "../../types/ApiTypes";

export const ChainEditor: React.FC = () => {
  const { colors, shadows, isDark } = useTheme();
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
  const moveNode = useGraphEditorStore((s) => s.moveNode);
  const duplicateNode = useGraphEditorStore((s) => s.duplicateNode);
  const updateProperty = useGraphEditorStore((s) => s.updateProperty);
  const setSelectedOutput = useGraphEditorStore((s) => s.setSelectedOutput);
  const setInputMapping = useGraphEditorStore((s) => s.setInputMapping);
  const toggleExpanded = useGraphEditorStore((s) => s.toggleExpanded);
  const showNodePicker = useGraphEditorStore((s) => s.showNodePicker);
  const hideNodePicker = useGraphEditorStore((s) => s.hideNodePicker);

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
                <View key={node.id}>
                  {/* Add button before first node */}
                  {index === 0 && (
                    <AddNodeButton
                      onPress={() => showNodePicker(0)}
                    />
                  )}

                  {/* Connector from previous node */}
                  {index > 0 && (
                    <>
                      <AddNodeButton
                        onPress={() => showNodePicker(index)}
                      />
                      <ChainConnector
                        sourceOutput={chain[index - 1].selectedOutput}
                        targetInput={
                          Object.keys(node.inputMappings).length > 0
                            ? Object.keys(node.inputMappings).join(", ")
                            : null
                        }
                      />
                    </>
                  )}

                  {/* The node card */}
                  <ChainNodeCard
                    node={node}
                    index={index}
                    totalNodes={chain.length}
                    workflowId={workflowId}
                    previousNodes={chain.slice(0, index)}
                    onToggleExpanded={() => toggleExpanded(node.id)}
                    onUpdateProperty={(name, value) =>
                      updateProperty(node.id, name, value)
                    }
                    onSetOutput={(out) => setSelectedOutput(node.id, out)}
                    onSetInputMapping={(inp, source) =>
                      setInputMapping(node.id, inp, source)
                    }
                    onRemove={() => handleRemove(node.id)}
                    onDuplicate={() => duplicateNode(node.id)}
                    onMoveUp={() => moveNode(index, index - 1)}
                    onMoveDown={() => moveNode(index, index + 1)}
                  />
                </View>
              ))}

              {/* Add button at the end */}
              <AddNodeButton
                onPress={() => showNodePicker(-1)}
              />
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
