/**
 * Collections (RAG / vector store) screen.
 * Lets the user browse collections, see indexed item counts, create new
 * collections, and delete existing ones. Mirrors the web CollectionsExplorer
 * feature but scoped to the essentials that fit a mobile form factor.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
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
import { RootStackParamList } from '../navigation/types';
import { apiService, CollectionResponse } from '../services/api';
import { useTheme } from '../hooks/useTheme';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Collections'>;
};

const DEFAULT_EMBEDDING_MODEL = 'all-minilm:latest';

interface CreateState {
  name: string;
  embedding_model: string;
  saving: boolean;
}

export default function CollectionsScreen({ navigation: _navigation }: Props) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();

  const [collections, setCollections] = useState<CollectionResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [creator, setCreator] = useState<CreateState | null>(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const data = await apiService.listCollections();
      setCollections(data.collections || []);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load collections';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) { return collections; }
    return collections.filter((c) => c.name.toLowerCase().includes(q));
  }, [collections, query]);

  const openCreate = useCallback(() => {
    setCreator({ name: '', embedding_model: DEFAULT_EMBEDDING_MODEL, saving: false });
  }, []);

  const closeCreate = useCallback(() => {
    Keyboard.dismiss();
    setCreator(null);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!creator) { return; }
    const name = creator.name.trim();
    const embeddingModel = creator.embedding_model.trim() || DEFAULT_EMBEDDING_MODEL;

    if (!name) {
      Alert.alert('Missing name', 'Please provide a collection name.');
      return;
    }

    setCreator({ ...creator, saving: true });
    try {
      await apiService.createCollection({ name, embedding_model: embeddingModel });
      await load();
      closeCreate();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to create collection';
      Alert.alert('Create failed', message);
      setCreator({ ...creator, saving: false });
    }
  }, [creator, load, closeCreate]);

  const handleDelete = useCallback((collection: CollectionResponse) => {
    Alert.alert(
      'Delete collection',
      `Delete "${collection.name}"? Indexed documents will also be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.deleteCollection(collection.name);
              await load();
            } catch (e) {
              const message = e instanceof Error ? e.message : 'Failed to delete collection';
              Alert.alert('Delete failed', message);
            }
          },
        },
      ],
    );
  }, [load]);

  const renderItem = ({ item }: { item: CollectionResponse }) => (
    <View
      style={[
        styles.card,
        shadows.small,
        { backgroundColor: colors.cardBg, borderColor: colors.borderLight },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.accentMuted }]}>
        <Ionicons name="library-outline" size={20} color={colors.accent} />
      </View>
      <View style={styles.meta}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {item.count.toLocaleString()} {item.count === 1 ? 'item' : 'items'}
          {item.workflow_name ? ` · ${item.workflow_name}` : ''}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => handleDelete(item)}
        style={styles.deleteBtn}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${item.name}`}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="trash-outline" size={18} color={colors.error} />
      </TouchableOpacity>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.searchWrap}>
        <View style={[styles.search, { backgroundColor: colors.inputBg, borderColor: colors.borderLight }]}>
          <Ionicons name="search" size={16} color={colors.textTertiary} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search collections..."
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search collections"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loadError && (
        <View style={[styles.banner, { backgroundColor: colors.error + '18' }]}>
          <Ionicons name="warning-outline" size={14} color={colors.error} style={{ marginRight: 6 }} />
          <Text style={[styles.bannerText, { color: colors.error }]}>{loadError}</Text>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(c) => c.name}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 96 }]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="library-outline" size={36} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {query.length > 0 ? `No collections matching "${query}"` : 'No collections yet'}
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={[
          styles.fab,
          shadows.medium,
          { backgroundColor: colors.primary, bottom: insets.bottom + 20 },
        ]}
        onPress={openCreate}
        accessibilityRole="button"
        accessibilityLabel="Create collection"
      >
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={creator !== null}
        animationType="slide"
        transparent
        onRequestClose={closeCreate}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={closeCreate}
            accessibilityLabel="Close editor"
          />
          <View
            style={[
              styles.modalSheet,
              shadows.large,
              { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.sheetTitle, { color: colors.text }]}>New collection</Text>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.borderLight, color: colors.text }]}
                value={creator?.name || ''}
                onChangeText={(t) => creator && setCreator({ ...creator, name: t })}
                placeholder="my-knowledge-base"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Collection name"
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Embedding model</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.borderLight, color: colors.text }]}
                value={creator?.embedding_model || ''}
                onChangeText={(t) => creator && setCreator({ ...creator, embedding_model: t })}
                placeholder={DEFAULT_EMBEDDING_MODEL}
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Embedding model"
              />
              <Text style={[styles.hint, { color: colors.textTertiary }]}>
                Defaults to {DEFAULT_EMBEDDING_MODEL}. Make sure the embedding model is available on your server.
              </Text>

              <View style={styles.sheetActions}>
                <TouchableOpacity
                  style={[styles.sheetButton, { backgroundColor: colors.inputBg }]}
                  onPress={closeCreate}
                  disabled={creator?.saving}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={[styles.sheetButtonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sheetButton, { backgroundColor: colors.primary, opacity: creator?.saving ? 0.6 : 1 }]}
                  onPress={handleCreate}
                  disabled={creator?.saving}
                  accessibilityRole="button"
                  accessibilityLabel="Create"
                >
                  {creator?.saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={[styles.sheetButtonText, { color: '#fff' }]}>Create</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  banner: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: { fontSize: 13, fontWeight: '500' },
  list: { padding: 16, paddingTop: 4 },
  card: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  meta: { flex: 1, marginRight: 8 },
  name: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  subtitle: { fontSize: 13, marginTop: 2 },
  deleteBtn: { padding: 4 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 14 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
    maxHeight: '92%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14, letterSpacing: -0.3 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
    marginTop: 6,
  },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  hint: { fontSize: 12, marginTop: 6 },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    marginBottom: 4,
  },
  sheetButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  sheetButtonText: { fontSize: 15, fontWeight: '600' },
});
