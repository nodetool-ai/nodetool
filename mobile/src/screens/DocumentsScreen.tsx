/**
 * The documents browser: every kind in one list.
 *
 * Web puts each open document in a workspace tab with a left rail of sections.
 * A phone has no room for either, so the rail collapses into filter chips and
 * opening a document pushes a screen. Which screen is decided by the kind
 * registry, not by this file.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DocumentKind } from '../documents/kinds';

import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors, ThemeShadows } from '../utils/theme';
import { DOCUMENT_KINDS, documentKindInfo } from '../documents/kinds';
import {
  useAllDocuments,
  useCreateDocument,
  useDeleteDocument,
  useRenameDocument,
  type DocumentListEntry,
} from '../documents/useDocuments';

type DocumentsScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Documents'>;
};

type IconName = keyof typeof Ionicons.glyphMap;

const icon = (name: string): IconName => name as IconName;

/** Coarse "2h ago" stamp. Rows only need recency, so no date library. */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return '';
  }
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) {
    return 'just now';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  const weeks = Math.round(days / 7);
  if (weeks < 5) {
    return `${weeks}w ago`;
  }
  const months = Math.round(days / 30);
  if (months < 12) {
    return `${months}mo ago`;
  }
  return `${Math.round(days / 365)}y ago`;
}

const CREATABLE_KINDS = DOCUMENT_KINDS.filter((entry) => entry.creatable);

const DocumentRow = React.memo(function DocumentRow({
  entry,
  colors,
  shadows,
  onOpen,
  onShowActions,
}: {
  entry: DocumentListEntry;
  colors: ThemeColors;
  shadows: ThemeShadows;
  onOpen: (entry: DocumentListEntry) => void;
  onShowActions: (entry: DocumentListEntry) => void;
}) {
  const info = documentKindInfo(entry.kind);
  const isReadOnly = info.surface === 'viewer';
  const handleOpen = useCallback(() => onOpen(entry), [onOpen, entry]);
  const handleShowActions = useCallback(
    () => onShowActions(entry),
    [onShowActions, entry]
  );

  return (
    <View
      style={[
        styles.row,
        shadows.small,
        { backgroundColor: colors.cardBg, borderColor: colors.borderLight },
      ]}
    >
      <TouchableOpacity
        style={styles.rowMain}
        onPress={handleOpen}
        onLongPress={handleShowActions}
        accessibilityRole="button"
        accessibilityLabel={`Open ${entry.name}, ${info.label}`}
        activeOpacity={0.7}
      >
        <View style={[styles.rowIcon, { backgroundColor: colors.primaryMuted }]}>
          <Ionicons name={icon(info.icon)} size={20} color={colors.primary} />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
            {entry.name}
          </Text>
          <View style={styles.rowMetaLine}>
            <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
              {info.label} · {formatRelativeTime(entry.updatedAt)}
            </Text>
            {isReadOnly ? (
              <View style={[styles.badge, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="eye-outline" size={11} color={colors.textSecondary} />
                <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                  Read-only
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.rowAction}
        onPress={handleShowActions}
        accessibilityRole="button"
        accessibilityLabel={`Actions for ${entry.name}`}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
});

export default function DocumentsScreen({ navigation }: DocumentsScreenProps) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();

  const [activeKind, setActiveKind] = useState<DocumentKind | null>(null);
  const [renameTarget, setRenameTarget] = useState<DocumentListEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const { documents, isLoading, isRefetching, error, refetch } = useAllDocuments();
  const createDocument = useCreateDocument();
  const renameDocument = useRenameDocument();
  const deleteDocument = useDeleteDocument();

  const visibleDocuments = useMemo(
    () =>
      activeKind === null
        ? documents
        : documents.filter((entry) => entry.kind === activeKind),
    [documents, activeKind]
  );

  /**
   * The registry says which route opens a kind; the param shapes differ, so the
   * switch is over the three routes rather than over every kind.
   */
  const openDocument = useCallback(
    (entry: DocumentListEntry) => {
      const info = documentKindInfo(entry.kind);
      switch (info.route) {
        case 'StoryboardEditor':
          navigation.navigate('StoryboardEditor', { id: entry.id, name: entry.name });
          break;
        case 'ScriptEditor':
          navigation.navigate('ScriptEditor', { id: entry.id, name: entry.name });
          break;
        case 'JsScriptEditor':
          navigation.navigate('JsScriptEditor', { id: entry.id, name: entry.name });
          break;
        case 'TimelineViewer':
          navigation.navigate('TimelineViewer', { id: entry.id, name: entry.name });
          break;
        case 'SketchViewer':
          navigation.navigate('SketchViewer', { id: entry.id, name: entry.name });
          break;
        case 'DocumentViewer':
          navigation.navigate('DocumentViewer', {
            kind: entry.kind,
            id: entry.id,
            name: entry.name,
          });
          break;
      }
    },
    [navigation]
  );

  const handleCreate = useCallback(
    async (kind: DocumentKind, label: string) => {
      try {
        const created = await createDocument.mutateAsync({
          kind,
          name: `New ${label}`,
        });
        openDocument(created);
      } catch (createError: unknown) {
        const message =
          createError instanceof Error ? createError.message : `Could not create ${label}`;
        Alert.alert('Error', message);
      }
    },
    [createDocument, openDocument]
  );

  // `useMutation` returns a fresh object every render; `mutate` does not.
  const deleteDocumentMutate = deleteDocument.mutate;

  const handleDelete = useCallback(
    (entry: DocumentListEntry) => {
      Alert.alert(
        'Delete document?',
        `This will permanently delete "${entry.name}".`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              deleteDocumentMutate(
                { kind: entry.kind, id: entry.id },
                {
                  onError: (deleteError) => {
                    Alert.alert('Error', deleteError.message);
                  },
                }
              );
            },
          },
        ]
      );
    },
    [deleteDocumentMutate]
  );

  const handleRenameSubmit = useCallback(async () => {
    const target = renameTarget;
    if (!target) {
      return;
    }
    const name = renameValue.trim();
    if (!name || name === target.name) {
      setRenameTarget(null);
      return;
    }
    try {
      await renameDocument.mutateAsync({
        kind: target.kind,
        id: target.id,
        name,
      });
      setRenameTarget(null);
    } catch (renameError: unknown) {
      const message =
        renameError instanceof Error ? renameError.message : 'Could not rename document';
      Alert.alert('Error', message);
    }
  }, [renameTarget, renameValue, renameDocument]);

  const showRowActions = useCallback(
    (entry: DocumentListEntry) => {
      Alert.alert(entry.name, undefined, [
        {
          text: 'Rename',
          onPress: () => {
            setRenameValue(entry.name);
            setRenameTarget(entry);
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDelete(entry),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [handleDelete]
  );

  const renderItem = useCallback(
    ({ item }: { item: DocumentListEntry }) => (
      <DocumentRow
        entry={item}
        colors={colors}
        shadows={shadows}
        onOpen={openDocument}
        onShowActions={showRowActions}
      />
    ),
    [colors, shadows, openDocument, showRowActions]
  );

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.centerText, { color: colors.textSecondary }]}>
          Loading documents...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {error ? (
        <View
          style={[
            styles.errorBanner,
            { backgroundColor: colors.primaryMuted, borderColor: colors.border },
          ]}
        >
          <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]} numberOfLines={2}>
            {error.message || 'Could not load documents'}
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading documents"
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="refresh-outline" size={18} color={colors.error} />
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipRow}
      >
        <FilterChip
          label="All"
          isActive={activeKind === null}
          onPress={() => setActiveKind(null)}
          colors={colors}
        />
        {DOCUMENT_KINDS.map((entry) => (
          <FilterChip
            key={entry.kind}
            label={entry.plural}
            iconName={entry.icon}
            isActive={activeKind === entry.kind}
            onPress={() => setActiveKind(entry.kind)}
            colors={colors}
          />
        ))}
      </ScrollView>

      {CREATABLE_KINDS.length > 0 ? (
        <View style={styles.createRow}>
          {CREATABLE_KINDS.map((entry) => (
            <TouchableOpacity
              key={entry.kind}
              style={[styles.createButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                void handleCreate(entry.kind, entry.label);
              }}
              accessibilityRole="button"
              accessibilityLabel={`New ${entry.label}`}
              activeOpacity={0.7}
              disabled={createDocument.isPending}
            >
              <Ionicons name="add" size={16} color={colors.textOnPrimary} />
              <Text style={[styles.createButtonText, { color: colors.textOnPrimary }]}>
                New {entry.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <FlatList
        data={visibleDocuments}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primaryMuted }]}>
              <Ionicons name="documents-outline" size={36} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {activeKind === null ? 'No documents yet' : 'Nothing of this kind'}
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Storyboards, scripts, timelines, and sketches are usually built by
              asking the assistant. Describe what you want and it writes the
              document for you.
            </Text>
            <TouchableOpacity
              style={[styles.emptyButton, shadows.small, { backgroundColor: colors.primary }]}
              onPress={() => navigation.navigate('Chat')}
              accessibilityRole="button"
              accessibilityLabel="Open chat with the assistant"
              activeOpacity={0.7}
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={16}
                color={colors.textOnPrimary}
              />
              <Text style={[styles.emptyButtonText, { color: colors.textOnPrimary }]}>
                Ask the assistant
              </Text>
            </TouchableOpacity>
          </View>
        }
      />

      <Modal
        visible={renameTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameTarget(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalCard, shadows.large, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Rename document</Text>
            <TextInput
              style={[
                styles.modalInput,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.inputBg,
                },
              ]}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Document name"
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel="Document name"
              autoFocus
              autoCorrect={false}
              selectTextOnFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.modalButtonOutline,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => setRenameTarget(null)}
                accessibilityRole="button"
                accessibilityLabel="Cancel rename"
                activeOpacity={0.7}
                disabled={renameDocument.isPending}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={() => {
                  void handleRenameSubmit();
                }}
                accessibilityRole="button"
                accessibilityLabel="Save rename"
                activeOpacity={0.7}
                disabled={renameDocument.isPending}
              >
                {renameDocument.isPending ? (
                  <ActivityIndicator color={colors.textOnPrimary} />
                ) : (
                  <Text style={[styles.modalButtonText, { color: colors.textOnPrimary }]}>
                    Save
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

type FilterChipProps = {
  label: string;
  iconName?: string;
  isActive: boolean;
  onPress: () => void;
  colors: {
    primary: string;
    primaryMuted: string;
    text: string;
    textSecondary: string;
    border: string;
    surface: string;
  };
};

function FilterChip({ label, iconName, isActive, onPress, colors }: FilterChipProps) {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: isActive ? colors.primaryMuted : colors.surface,
          borderColor: isActive ? colors.primary : colors.border,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Filter by ${label}`}
      accessibilityState={{ selected: isActive }}
      activeOpacity={0.7}
    >
      {iconName ? (
        <Ionicons
          name={icon(iconName)}
          size={14}
          color={isActive ? colors.primary : colors.textSecondary}
        />
      ) : null}
      <Text
        style={[
          styles.chipText,
          { color: isActive ? colors.primary : colors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  centerText: {
    fontSize: 15,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
  },
  // A horizontal ScrollView is still a flex child of the column above it: left
  // to grow it takes the leftover vertical space and stretches every chip to
  // its height. Pinning it to its content and centring the row keeps the chips
  // at their natural height.
  chipScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  createRow: {
    flexDirection: 'row',
    // Two buttons already fill a 320pt screen, so let them wrap instead of
    // spilling past the edge.
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingTop: 12,
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    marginBottom: 3,
  },
  rowMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowMeta: {
    fontSize: 13,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  rowAction: {
    paddingHorizontal: 14,
    paddingVertical: 18,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  modalButtonOutline: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  modalButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
