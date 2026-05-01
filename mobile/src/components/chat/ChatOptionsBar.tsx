/**
 * Compact options bar shown above the chat composer.
 * Exposes the same backend-level chat options as the web ChatComposer
 * (agent mode, help mode, attached RAG collections).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService, CollectionResponse } from '../../services/api';
import { useTheme } from '../../hooks/useTheme';

interface ChatOptionsBarProps {
  agentMode: boolean;
  helpMode: boolean;
  selectedCollections: string[];
  onToggleAgentMode: (next: boolean) => void;
  onToggleHelpMode: (next: boolean) => void;
  onChangeCollections: (next: string[]) => void;
}

export const ChatOptionsBar: React.FC<ChatOptionsBarProps> = ({
  agentMode,
  helpMode,
  selectedCollections,
  onToggleAgentMode,
  onToggleHelpMode,
  onChangeCollections,
}) => {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const [modalOpen, setModalOpen] = useState(false);
  const [collections, setCollections] = useState<CollectionResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCollections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.listCollections();
      setCollections(data.collections || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (modalOpen) {
      loadCollections();
    }
  }, [modalOpen, loadCollections]);

  const collectionsLabel = useMemo(() => {
    if (selectedCollections.length === 0) { return 'Collections'; }
    if (selectedCollections.length === 1) { return selectedCollections[0]; }
    return `${selectedCollections.length} collections`;
  }, [selectedCollections]);

  const handleToggleCollection = useCallback(
    (name: string) => {
      const isSelected = selectedCollections.includes(name);
      const next = isSelected
        ? selectedCollections.filter((c) => c !== name)
        : [...selectedCollections, name];
      onChangeCollections(next);
    },
    [selectedCollections, onChangeCollections],
  );

  const handleClearCollections = useCallback(() => {
    onChangeCollections([]);
  }, [onChangeCollections]);

  const renderChip = (
    label: string,
    iconName: keyof typeof Ionicons.glyphMap,
    active: boolean,
    onPress: () => void,
    accessibilityLabel: string,
  ) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.primary : colors.inputBg,
          borderColor: active ? colors.primary : colors.borderLight,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons
        name={iconName}
        size={13}
        color={active ? '#fff' : colors.textSecondary}
        style={{ marginRight: 4 }}
      />
      <Text style={[styles.chipText, { color: active ? '#fff' : colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View
      style={[
        styles.container,
        { borderTopColor: colors.borderLight, backgroundColor: colors.surfaceHeader },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {renderChip(
          'Agent',
          'sparkles-outline',
          agentMode,
          () => onToggleAgentMode(!agentMode),
          agentMode ? 'Disable agent mode' : 'Enable agent mode',
        )}
        {renderChip(
          'Help',
          'help-circle-outline',
          helpMode,
          () => onToggleHelpMode(!helpMode),
          helpMode ? 'Disable help mode' : 'Enable help mode',
        )}
        {renderChip(
          collectionsLabel,
          'library-outline',
          selectedCollections.length > 0,
          () => setModalOpen(true),
          'Choose collections',
        )}
      </ScrollView>

      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setModalOpen(false)}
            accessibilityLabel="Close collections picker"
          />
          <View
            style={[
              styles.modalSheet,
              shadows.large,
              { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Collections</Text>
              {selectedCollections.length > 0 && (
                <TouchableOpacity onPress={handleClearCollections} accessibilityRole="button">
                  <Text style={[styles.clearText, { color: colors.primary }]}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={[styles.sheetHint, { color: colors.textSecondary }]}>
              Attach vector collections so the model can use them as RAG context.
            </Text>

            {loading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : error ? (
              <View style={[styles.errorBox, { backgroundColor: colors.error + '14' }]}>
                <Ionicons name="warning-outline" size={14} color={colors.error} />
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </View>
            ) : collections.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="library-outline" size={28} color={colors.textTertiary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  No collections available.
                </Text>
              </View>
            ) : (
              <FlatList
                data={collections}
                keyExtractor={(c) => c.name}
                style={styles.list}
                renderItem={({ item }) => {
                  const checked = selectedCollections.includes(item.name);
                  return (
                    <TouchableOpacity
                      onPress={() => handleToggleCollection(item.name)}
                      style={[
                        styles.row,
                        { backgroundColor: checked ? colors.primaryMuted : colors.inputBg },
                      ]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={`Toggle collection ${item.name}`}
                    >
                      <View style={styles.rowMeta}>
                        <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>
                          {item.count} {item.count === 1 ? 'item' : 'items'}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.checkBox,
                          {
                            borderColor: checked ? colors.primary : colors.border,
                            backgroundColor: checked ? colors.primary : 'transparent',
                          },
                        ]}
                      >
                        {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            <TouchableOpacity
              onPress={() => setModalOpen(false)}
              style={[styles.doneBtn, { backgroundColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 220,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  clearText: { fontSize: 14, fontWeight: '600' },
  sheetHint: { fontSize: 13, marginBottom: 12 },
  modalLoading: { paddingVertical: 24, alignItems: 'center' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 10,
  },
  errorText: { fontSize: 13, flex: 1 },
  emptyBox: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 14 },
  list: { marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 6,
  },
  rowMeta: { flex: 1, marginRight: 12 },
  rowName: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 2 },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBtn: {
    marginTop: 12,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

export default ChatOptionsBar;
