/**
 * Modal for selecting a model from available providers.
 *
 * Renders as a full-screen modal (bottom-sheet style) with:
 * - Search bar
 * - Provider filter chips
 * - Scrollable model list grouped by provider
 *
 * Mirrors the web's ModelMenuDialogBase pattern adapted for mobile.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import type { ProviderInfo } from "../../types/ApiTypes";

// ── Types ───────────────────────────────────────────────────────────

interface ModelItem {
  type: string;
  id: string;
  name: string;
  provider: string;
  path?: string | null;
}

interface ModelSelectModalProps {
  visible: boolean;
  title: string;
  models: ModelItem[];
  providers: ProviderInfo[];
  isLoading: boolean;
  selectedModelId: string;
  onSelect: (model: ModelItem) => void;
  onClose: () => void;
}

// ── Component ───────────────────────────────────────────────────────

export const ModelSelectModal: React.FC<ModelSelectModalProps> = ({
  visible,
  title,
  models,
  providers,
  isLoading,
  selectedModelId,
  onSelect,
  onClose,
}) => {
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  // Filter models by search and provider
  const filtered = useMemo(() => {
    let result = models;
    if (selectedProvider) {
      result = result.filter((m) => m.provider === selectedProvider);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (m) =>
          m.name?.toLowerCase().includes(q) ||
          m.id?.toLowerCase().includes(q) ||
          m.provider?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [models, search, selectedProvider]);

  // Group models by provider for section headers
  const grouped = useMemo(() => {
    const map = new Map<string, ModelItem[]>();
    for (const m of filtered) {
      const key = m.provider ?? "unknown";
      if (!map.has(key)) {map.set(key, []);}
      map.get(key)!.push(m);
    }
    // Flatten with section headers
    const items: Array<{ type: "header"; provider: string } | { type: "model"; model: ModelItem }> = [];
    for (const [provider, providerModels] of map) {
      items.push({ type: "header", provider });
      for (const model of providerModels) {
        items.push({ type: "model", model });
      }
    }
    return items;
  }, [filtered]);

  const handleSelect = useCallback(
    (model: ModelItem) => {
      onSelect(model);
      onClose();
      setSearch("");
      setSelectedProvider(null);
    },
    [onSelect, onClose]
  );

  const handleClose = useCallback(() => {
    onClose();
    setSearch("");
    setSelectedProvider(null);
  }, [onClose]);

  const renderItem = useCallback(
    ({ item }: { item: (typeof grouped)[number] }) => {
      if (item.type === "header") {
        return (
          <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              {formatProvider(item.provider)}
            </Text>
          </View>
        );
      }

      const { model } = item;
      const isSelected = model.id === selectedModelId;

      return (
        <TouchableOpacity
          style={[
            styles.modelRow,
            isSelected && { backgroundColor: colors.primaryMuted },
            { borderBottomColor: colors.border },
          ]}
          onPress={() => handleSelect(model)}
          activeOpacity={0.7}
        >
          <View style={styles.modelInfo}>
            <Text
              style={[
                styles.modelName,
                { color: isSelected ? colors.primary : colors.text },
              ]}
              numberOfLines={1}
            >
              {model.name || model.id}
            </Text>
            {model.path ? (
              <Text
                style={[styles.modelPath, { color: colors.textTertiary }]}
                numberOfLines={1}
              >
                {model.path}
              </Text>
            ) : model.name !== model.id ? (
              <Text
                style={[styles.modelPath, { color: colors.textTertiary }]}
                numberOfLines={1}
              >
                {model.id}
              </Text>
            ) : null}
          </View>
          {isSelected && (
            <Ionicons name="checkmark" size={18} color={colors.primary} />
          )}
        </TouchableOpacity>
      );
    },
    [colors, selectedModelId, handleSelect]
  );

  const keyExtractor = useCallback(
    (item: (typeof grouped)[number], index: number) => {
      if (item.type === "header") {return `header-${item.provider}`;}
      return item.model.id ?? `model-${index}`;
    },
    []
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <TouchableOpacity
            onPress={handleClose}
            hitSlop={12}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <View
            style={[
              styles.searchContainer,
              { backgroundColor: colors.inputBg, borderColor: colors.border },
            ]}
          >
            <Ionicons name="search" size={16} color={colors.textTertiary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              value={search}
              onChangeText={setSearch}
              placeholder="Search models..."
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Provider filter chips */}
        {providers.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.providerScroll}
            contentContainerStyle={styles.providerChips}
          >
            <TouchableOpacity
              style={[
                styles.providerChip,
                {
                  backgroundColor: !selectedProvider
                    ? colors.primaryMuted
                    : colors.inputBg,
                  borderColor: !selectedProvider
                    ? colors.primary + "60"
                    : colors.border,
                },
              ]}
              onPress={() => setSelectedProvider(null)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.providerChipText,
                  { color: !selectedProvider ? colors.primary : colors.text },
                ]}
              >
                All
              </Text>
            </TouchableOpacity>
            {providers.map((p) => {
              const isActive = selectedProvider === p.provider;
              return (
                <TouchableOpacity
                  key={p.provider}
                  style={[
                    styles.providerChip,
                    {
                      backgroundColor: isActive
                        ? colors.primaryMuted
                        : colors.inputBg,
                      borderColor: isActive
                        ? colors.primary + "60"
                        : colors.border,
                    },
                  ]}
                  onPress={() =>
                    setSelectedProvider(isActive ? null : p.provider)
                  }
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.providerChipText,
                      { color: isActive ? colors.primary : colors.text },
                    ]}
                  >
                    {formatProvider(p.provider)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Model list */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textTertiary }]}>
              Loading models...
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="cube-outline" size={40} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
              {search ? "No models match your search" : "No models available"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={grouped}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

function formatProvider(provider: string): string {
  // Capitalize provider names
  return provider
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  closeButton: {
    padding: 4,
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: 42,
  },
  providerScroll: {
    maxHeight: 44,
    paddingBottom: 8,
  },
  providerChips: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
  },
  providerChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  providerChipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  list: {
    flex: 1,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modelRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    gap: 10,
  },
  modelInfo: {
    flex: 1,
    gap: 2,
  },
  modelName: {
    fontSize: 15,
    fontWeight: "500",
  },
  modelPath: {
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
  },
});
