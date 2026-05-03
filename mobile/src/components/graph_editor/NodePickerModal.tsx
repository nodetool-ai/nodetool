/**
 * Full-screen modal for searching and selecting node types.
 *
 * Mirrors the web's NodePickerDialog:
 * - Quick action tiles when idle (no search)
 * - Filtered results grouped by namespace when searching
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  SafeAreaView,
  SectionList,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import type { NodeMetadata } from "../../types/ApiTypes";

// ── Props ───────────────────────────────────────────────────────────

interface NodePickerModalProps {
  visible: boolean;
  metadata: NodeMetadata[];
  onSelect: (metadata: NodeMetadata) => void;
  onClose: () => void;
}

// ── Quick actions ───────────────────────────────────────────────────

interface QuickAction {
  key: string;
  label: string;
  nodeType: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { key: "agent", label: "Agent", nodeType: "nodetool.agents.Agent", icon: "people-outline", color: "#4F46E5" },
  { key: "code", label: "Code", nodeType: "nodetool.code.Code", icon: "code-slash-outline", color: "#22C55E" },
  { key: "text-to-image", label: "Text to Image", nodeType: "nodetool.image.TextToImage", icon: "image-outline", color: "#EC4899" },
  { key: "image-to-image", label: "Image to Image", nodeType: "nodetool.image.ImageToImage", icon: "color-wand-outline", color: "#10B981" },
  { key: "text-to-video", label: "Text to Video", nodeType: "nodetool.video.TextToVideo", icon: "videocam-outline", color: "#A855F7" },
  { key: "image-to-video", label: "Image to Video", nodeType: "nodetool.video.ImageToVideo", icon: "film-outline", color: "#F97316" },
  { key: "text-to-speech", label: "Text to Speech", nodeType: "nodetool.audio.TextToSpeech", icon: "mic-outline", color: "#06B6D4" },
  { key: "speech-to-text", label: "Speech to Text", nodeType: "nodetool.text.AutomaticSpeechRecognition", icon: "ear-outline", color: "#0EA5E9" },
];

const CONSTANT_TYPES: Array<{ key: string; label: string; nodeType: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = [
  { key: "c-string", label: "String", nodeType: "nodetool.constant.String", icon: "text-outline", color: "#3B82F6" },
  { key: "c-integer", label: "Integer", nodeType: "nodetool.constant.Integer", icon: "calculator-outline", color: "#8B5CF6" },
  { key: "c-float", label: "Float", nodeType: "nodetool.constant.Float", icon: "trending-up-outline", color: "#10B981" },
  { key: "c-bool", label: "Boolean", nodeType: "nodetool.constant.Boolean", icon: "toggle-outline", color: "#F59E0B" },
  { key: "c-image", label: "Image", nodeType: "nodetool.constant.Image", icon: "image-outline", color: "#EC4899" },
  { key: "c-audio", label: "Audio", nodeType: "nodetool.constant.Audio", icon: "musical-note-outline", color: "#06B6D4" },
  { key: "c-video", label: "Video", nodeType: "nodetool.constant.Video", icon: "videocam-outline", color: "#A855F7" },
  { key: "c-list", label: "List", nodeType: "nodetool.constant.List", icon: "list-outline", color: "#F97316" },
  { key: "c-dict", label: "Dict", nodeType: "nodetool.constant.Dict", icon: "grid-outline", color: "#14B8A6" },
  { key: "c-json", label: "JSON", nodeType: "nodetool.constant.JSON", icon: "code-outline", color: "#6366F1" },
];

// ── Namespace helpers ───────────────────────────────────────────────

const NAMESPACE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
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
  code: "code-slash-outline",
  constant: "cube-outline",
};

function getNamespaceIcon(namespace: string): keyof typeof Ionicons.glyphMap {
  const key = namespace.split(".").pop()?.toLowerCase() ?? "";
  return NAMESPACE_ICONS[key] ?? "cube-outline";
}

function formatNamespace(ns: string): string {
  const parts = ns.split(".");
  const last = parts[parts.length - 1];
  return last.charAt(0).toUpperCase() + last.slice(1);
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
  code: "#22C55E",
  constant: "#6B7280",
};

function getNamespaceColor(namespace: string): string {
  const key = namespace.split(".").pop()?.toLowerCase() ?? "";
  return NAMESPACE_COLORS[key] ?? "#6B7280";
}

// ── Section type ────────────────────────────────────────────────────

interface Section {
  title: string;
  data: NodeMetadata[];
}

// ── Component ───────────────────────────────────────────────────────

export const NodePickerModal: React.FC<NodePickerModalProps> = ({
  visible,
  metadata,
  onSelect,
  onClose,
}) => {
  const { colors } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");

  const hasSearch = searchQuery.trim().length > 0;

  // Build metadata lookup by node_type
  const metadataByType = useMemo(() => {
    const map = new Map<string, NodeMetadata>();
    for (const m of metadata) {
      map.set(m.node_type, m);
    }
    return map;
  }, [metadata]);

  // Filtered + grouped sections for search results
  const sections = useMemo((): Section[] => {
    if (!hasSearch) {return [];}
    const query = searchQuery.toLowerCase().trim();
    const tokens = query.split(/\s+/).filter((t) => t.length > 0);

    const filtered = metadata.filter((m) => {
      const title = m.title.toLowerCase();
      const desc = m.description.toLowerCase();
      const type = m.node_type.toLowerCase();
      const ns = m.namespace.toLowerCase();
      return tokens.every(
        (t) =>
          title.includes(t) ||
          desc.includes(t) ||
          type.includes(t) ||
          ns.includes(t)
      );
    });

    const groups = new Map<string, NodeMetadata[]>();
    for (const m of filtered) {
      const ns = m.namespace;
      if (!groups.has(ns)) {groups.set(ns, []);}
      groups.get(ns)!.push(m);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ns, items]) => ({
        title: ns,
        data: items.sort((a, b) => a.title.localeCompare(b.title)),
      }));
  }, [metadata, searchQuery, hasSearch]);

  const totalResults = useMemo(
    () => sections.reduce((sum, s) => sum + s.data.length, 0),
    [sections]
  );

  // Handlers
  const handleSelect = useCallback(
    (m: NodeMetadata) => {
      onSelect(m);
      setSearchQuery("");
    },
    [onSelect]
  );

  const handleQuickAction = useCallback(
    (nodeType: string) => {
      const m = metadataByType.get(nodeType);
      if (m) {handleSelect(m);}
    },
    [metadataByType, handleSelect]
  );

  const handleClose = useCallback(() => {
    onClose();
    setSearchQuery("");
  }, [onClose]);

  // ── Render helpers ──────────────────────────────────────────────

  const renderResultItem = useCallback(
    ({ item }: { item: NodeMetadata }) => {
      const nsColor = getNamespaceColor(item.namespace);
      return (
        <TouchableOpacity
          style={[
            styles.resultItem,
            { borderBottomColor: colors.border },
          ]}
          onPress={() => handleSelect(item)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={getNamespaceIcon(item.namespace)}
            size={18}
            color={nsColor}
          />
          <View style={styles.resultContent}>
            <Text
              style={[styles.resultTitle, { color: colors.text }]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            {item.description ? (
              <Text
                style={[styles.resultDesc, { color: colors.textTertiary }]}
                numberOfLines={1}
              >
                {item.description}
              </Text>
            ) : null}
          </View>
          <Ionicons name="add-circle-outline" size={20} color={nsColor} />
        </TouchableOpacity>
      );
    },
    [colors, handleSelect]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Section }) => {
      const nsColor = getNamespaceColor(section.title);
      return (
        <View
          style={[styles.sectionHeader, { backgroundColor: colors.background }]}
        >
          <Ionicons
            name={getNamespaceIcon(section.title)}
            size={14}
            color={nsColor}
          />
          <Text style={[styles.sectionTitle, { color: nsColor }]}>
            {formatNamespace(section.title)}
          </Text>
          <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>
            {section.data.length}
          </Text>
        </View>
      );
    },
    [colors]
  );

  // ── Quick action tile ───────────────────────────────────────────

  const renderQuickTile = useCallback(
    (action: QuickAction) => (
      <TouchableOpacity
        key={action.key}
        style={[
          styles.quickTile,
          { backgroundColor: action.color + "15", borderColor: action.color + "25" },
        ]}
        onPress={() => handleQuickAction(action.nodeType)}
        activeOpacity={0.7}
      >
        <Ionicons name={action.icon} size={22} color={action.color} />
        <Text
          style={[styles.quickTileLabel, { color: colors.text }]}
          numberOfLines={2}
        >
          {action.label}
        </Text>
      </TouchableOpacity>
    ),
    [colors, handleQuickAction]
  );

  const renderConstantTile = useCallback(
    (item: typeof CONSTANT_TYPES[number]) => (
      <TouchableOpacity
        key={item.key}
        style={[
          styles.constantTile,
          { backgroundColor: item.color + "12", borderColor: item.color + "20" },
        ]}
        onPress={() => handleQuickAction(item.nodeType)}
        activeOpacity={0.7}
      >
        <Ionicons name={item.icon} size={16} color={item.color} />
        <Text
          style={[styles.constantTileLabel, { color: colors.text }]}
          numberOfLines={1}
        >
          {item.label}
        </Text>
      </TouchableOpacity>
    ),
    [colors, handleQuickAction]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Add Node
          </Text>
          <TouchableOpacity
            onPress={handleClose}
            hitSlop={12}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <View
            style={[
              styles.searchBar,
              { backgroundColor: colors.inputBg, borderColor: colors.border },
            ]}
          >
            <Ionicons name="search" size={18} color={colors.textTertiary} />
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

        {/* Content */}
        {!hasSearch ? (
          /* ── Idle: Quick actions + constants ── */
          <ScrollView
            style={styles.idleScroll}
            contentContainerStyle={styles.idleContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Quick actions */}
            <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>
              Quick Actions
            </Text>
            <View style={styles.quickGrid}>
              {QUICK_ACTIONS.map(renderQuickTile)}
            </View>

            {/* Constants */}
            <Text
              style={[
                styles.groupLabel,
                { color: colors.textSecondary, marginTop: 20 },
              ]}
            >
              Constants
            </Text>
            <View style={styles.constantGrid}>
              {CONSTANT_TYPES.map(renderConstantTile)}
            </View>
          </ScrollView>
        ) : sections.length === 0 ? (
          /* ── Empty search ── */
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={48} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No nodes found
            </Text>
          </View>
        ) : (
          /* ── Search results ── */
          <>
            <Text style={[styles.resultCount, { color: colors.textTertiary }]}>
              {totalResults} {totalResults === 1 ? "result" : "results"}
            </Text>
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.node_type}
              renderItem={renderResultItem}
              renderSectionHeader={renderSectionHeader}
              contentContainerStyle={styles.listContent}
              stickySectionHeadersEnabled
              keyboardShouldPersistTaps="handled"
              initialNumToRender={20}
            />
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
};

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  closeButton: {
    padding: 4,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
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

  // Idle state (quick actions + constants)
  idleScroll: {
    flex: 1,
  },
  idleContent: {
    padding: 16,
    paddingBottom: 40,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickTile: {
    width: "31%",
    minWidth: 100,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  quickTileLabel: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  constantGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  constantTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  constantTileLabel: {
    fontSize: 13,
    fontWeight: "500",
  },

  // Search results
  resultCount: {
    fontSize: 12,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
  },
  sectionCount: {
    fontSize: 11,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    gap: 10,
  },
  resultContent: {
    flex: 1,
    gap: 2,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: "500",
  },
  resultDesc: {
    fontSize: 12,
  },

  // Empty state
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
