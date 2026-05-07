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

interface ToolEntry {
  id: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  toolIds: string[];
}

const BROWSER_TOOL_IDS = [
  'browser_view',
  'browser_navigate',
  'browser_restart',
  'browser_click',
  'browser_input_text',
  'browser_move_mouse',
  'browser_press_key',
  'browser_select_option',
  'browser_scroll',
  'browser_console_exec',
  'browser_console_view',
];

const SANDBOX_TOOL_IDS = [
  'sandbox_shell_exec',
  'sandbox_shell_wait',
  'sandbox_shell_view',
  'sandbox_shell_write',
  'sandbox_shell_kill',
  'sandbox_file_read',
  'sandbox_file_write',
  'sandbox_file_str_replace',
  'sandbox_file_find_in_content',
  'sandbox_file_find_by_name',
  'sandbox_browser_view',
  'sandbox_browser_navigate',
  'sandbox_browser_restart',
  'sandbox_browser_click',
  'sandbox_browser_input_text',
  'sandbox_browser_move_mouse',
  'sandbox_browser_press_key',
  'sandbox_browser_select_option',
  'sandbox_browser_scroll',
  'sandbox_browser_console_exec',
  'sandbox_browser_console_view',
];

const AVAILABLE_TOOLS: ToolEntry[] = [
  { id: 'read_file', description: 'Read file in workspace', icon: 'document-text-outline', toolIds: ['read_file'] },
  { id: 'write_file', description: 'Write file in workspace', icon: 'create-outline', toolIds: ['write_file'] },
  { id: 'list_directory', description: 'List files in workspace', icon: 'folder-outline', toolIds: ['list_directory'] },
  { id: 'google_search', description: 'Search the web', icon: 'search-outline', toolIds: ['google_search'] },
  { id: 'browser', description: 'Browse the web', icon: 'globe-outline', toolIds: BROWSER_TOOL_IDS },
  { id: 'sandbox', description: 'Sandbox shell, files, and browser', icon: 'lock-closed-outline', toolIds: SANDBOX_TOOL_IDS },
];

interface ChatOptionsBarProps {
  agentMode: boolean;
  helpMode: boolean;
  selectedCollections: string[];
  selectedTools: string[];
  onToggleAgentMode: (next: boolean) => void;
  onToggleHelpMode: (next: boolean) => void;
  onChangeCollections: (next: string[]) => void;
  onChangeTools: (next: string[]) => void;
}

export const ChatOptionsBar: React.FC<ChatOptionsBarProps> = ({
  agentMode,
  helpMode,
  selectedCollections,
  selectedTools,
  onToggleAgentMode,
  onToggleHelpMode,
  onChangeCollections,
  onChangeTools,
}) => {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const [modalOpen, setModalOpen] = useState(false);
  const [toolsModalOpen, setToolsModalOpen] = useState(false);
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

  const selectedToolSet = useMemo(() => new Set(selectedTools), [selectedTools]);
  const selectedToolEntries = useMemo(
    () => AVAILABLE_TOOLS.filter((entry) => entry.toolIds.every((id) => selectedToolSet.has(id))),
    [selectedToolSet],
  );

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

  const handleToggleTool = useCallback(
    (entry: ToolEntry) => {
      const isSelected = entry.toolIds.every((id) => selectedToolSet.has(id));
      const memberSet = new Set(entry.toolIds);
      const next = isSelected
        ? selectedTools.filter((id) => !memberSet.has(id))
        : [...selectedTools.filter((id) => !memberSet.has(id)), ...entry.toolIds];
      onChangeTools(next);
    },
    [selectedTools, selectedToolSet, onChangeTools],
  );

  const renderChip = (
    label: string,
    iconName: keyof typeof Ionicons.glyphMap,
    active: boolean,
    onPress: () => void,
    accessibilityLabel: string,
    key?: string,
  ) => (
    <TouchableOpacity
      key={key}
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
        {selectedToolEntries.map((entry) =>
          renderChip(
            '',
            entry.icon,
            true,
            () => handleToggleTool(entry),
            `Remove ${entry.description}`,
            entry.id,
          ),
        )}
        {renderChip(
          selectedToolEntries.length > 0 ? 'Tools' : 'Tools',
          'add-outline',
          selectedToolEntries.length > 0,
          () => setToolsModalOpen(true),
          'Add or remove tools',
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
        visible={toolsModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setToolsModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setToolsModalOpen(false)}
            accessibilityLabel="Close tools picker"
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
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Tools</Text>
              {selectedTools.length > 0 && (
                <TouchableOpacity onPress={() => onChangeTools([])} accessibilityRole="button">
                  <Text style={[styles.clearText, { color: colors.primary }]}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={[styles.sheetHint, { color: colors.textSecondary }]}>Enable tools the model may call while answering.</Text>
            {AVAILABLE_TOOLS.map((entry) => {
              const checked = entry.toolIds.every((id) => selectedToolSet.has(id));
              return (
                <TouchableOpacity
                  key={entry.id}
                  onPress={() => handleToggleTool(entry)}
                  style={[
                    styles.row,
                    { backgroundColor: checked ? colors.primaryMuted : colors.inputBg },
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={`Toggle ${entry.description}`}
                >
                  <Ionicons name={entry.icon} size={20} color={checked ? colors.primary : colors.textSecondary} />
                  <View style={styles.toolRowMeta}>
                    <Text style={[styles.rowName, { color: colors.text }]}>{entry.description}</Text>
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
            })}
            <TouchableOpacity
              onPress={() => setToolsModalOpen(false)}
              style={[styles.doneBtn, { backgroundColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  toolRowMeta: { flex: 1, marginHorizontal: 12 },
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
