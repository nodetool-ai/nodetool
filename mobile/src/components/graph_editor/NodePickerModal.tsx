/**
 * Full-screen modal for searching and selecting node types.
 *
 * Groups nodes by namespace, supports fuzzy text search,
 * and shows a brief description for each node type.
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Modal,
  StyleSheet,
  SafeAreaView,
  SectionList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import type { NodeMetadata } from "../../types/ApiTypes";

interface NodePickerModalProps {
  visible: boolean;
  metadata: NodeMetadata[];
  onSelect: (metadata: NodeMetadata) => void;
  onClose: () => void;
}

interface Section {
  title: string;
  data: NodeMetadata[];
}

const NAMESPACE_ICONS: Record<string, string> = {
  text: "document-text-outline",
  image: "image-outline",
  audio: "musical-notes-outline",
  video: "videocam-outline",
  math: "calculator-outline",
  list: "list-outline",
  logic: "git-branch-outline",
  input: "enter-outline",
  output: "exit-outline",
  llm: "chatbubble-ellipses-outline",
  agents: "people-outline",
  http: "globe-outline",
  data: "grid-outline",
};

function getNamespaceIcon(namespace: string): string {
  const key = namespace.split(".").pop()?.toLowerCase() ?? "";
  return NAMESPACE_ICONS[key] ?? "cube-outline";
}

function formatNamespace(ns: string): string {
  // "nodetool.text" -> "Text"
  const parts = ns.split(".");
  const last = parts[parts.length - 1];
  return last.charAt(0).toUpperCase() + last.slice(1);
}

export const NodePickerModal: React.FC<NodePickerModalProps> = ({
  visible,
  metadata,
  onSelect,
  onClose,
}) => {
  const { colors, shadows } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");

  const sections = useMemo((): Section[] => {
    const query = searchQuery.toLowerCase().trim();

    const filtered = query
      ? metadata.filter(
          (m) =>
            m.title.toLowerCase().includes(query) ||
            m.description.toLowerCase().includes(query) ||
            m.node_type.toLowerCase().includes(query)
        )
      : metadata;

    // Group by namespace
    const groups = new Map<string, NodeMetadata[]>();
    for (const m of filtered) {
      const ns = m.namespace;
      if (!groups.has(ns)) groups.set(ns, []);
      groups.get(ns)!.push(m);
    }

    // Sort namespaces alphabetically
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ns, items]) => ({
        title: ns,
        data: items.sort((a, b) => a.title.localeCompare(b.title)),
      }));
  }, [metadata, searchQuery]);

  const renderItem = useCallback(
    ({ item }: { item: NodeMetadata }) => (
      <TouchableOpacity
        style={[
          styles.nodeItem,
          { backgroundColor: colors.surface, borderColor: colors.borderLight },
        ]}
        onPress={() => {
          onSelect(item);
          setSearchQuery("");
        }}
        activeOpacity={0.7}
      >
        <View style={styles.nodeItemContent}>
          <View style={styles.nodeItemHeader}>
            <Ionicons
              name={getNamespaceIcon(item.namespace) as never}
              size={18}
              color={colors.primary}
            />
            <Text
              style={[styles.nodeTitle, { color: colors.text }]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
          </View>
          {item.description ? (
            <Text
              style={[styles.nodeDescription, { color: colors.textSecondary }]}
              numberOfLines={2}
            >
              {item.description}
            </Text>
          ) : null}
          <View style={styles.nodeMetaRow}>
            {item.outputs.length > 0 && (
              <View
                style={[styles.badge, { backgroundColor: colors.primaryMuted }]}
              >
                <Text style={[styles.badgeText, { color: colors.primary }]}>
                  {item.outputs.length} output
                  {item.outputs.length !== 1 ? "s" : ""}
                </Text>
              </View>
            )}
            {item.properties.length > 0 && (
              <View
                style={[styles.badge, { backgroundColor: colors.accentMuted }]}
              >
                <Text style={[styles.badgeText, { color: colors.accent }]}>
                  {item.properties.length} input
                  {item.properties.length !== 1 ? "s" : ""}
                </Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons
          name="add-circle-outline"
          size={24}
          color={colors.primary}
        />
      </TouchableOpacity>
    ),
    [colors, onSelect]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Section }) => (
      <View
        style={[
          styles.sectionHeader,
          { backgroundColor: colors.background },
        ]}
      >
        <Ionicons
          name={getNamespaceIcon(section.title) as never}
          size={16}
          color={colors.textSecondary}
        />
        <Text
          style={[styles.sectionTitle, { color: colors.textSecondary }]}
        >
          {formatNamespace(section.title)}
        </Text>
        <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>
          {section.data.length}
        </Text>
      </View>
    ),
    [colors]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            { borderBottomColor: colors.border },
          ]}
        >
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Add Node
          </Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons
              name="search"
              size={18}
              color={colors.textSecondary}
            />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search nodes..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
        </View>

        {/* Node list */}
        {sections.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="search-outline"
              size={48}
              color={colors.textTertiary}
            />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No nodes found
            </Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.node_type}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            contentContainerStyle={styles.listContent}
            stickySectionHeadersEnabled
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: 44,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
  },
  sectionCount: {
    fontSize: 12,
  },
  nodeItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  nodeItemContent: {
    flex: 1,
    gap: 4,
  },
  nodeItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nodeTitle: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  nodeDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 26,
  },
  nodeMetaRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
    marginLeft: 26,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
  },
});
