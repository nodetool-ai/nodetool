/**
 * Threads (chat history) screen.
 * Lists past chat threads from the server, lets the user open a previous
 * thread back into the chat screen or delete it. Mirrors the web
 * ThreadList sidebar.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
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
import { apiService, Thread } from '../services/api';
import { useTheme } from '../hooks/useTheme';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Threads'>;
};

function formatRelative(iso: string | null | undefined): string {
  if (!iso) { return ''; }
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) { return iso; }
  const diff = Date.now() - t;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) { return 'just now'; }
  if (minutes < 60) { return `${minutes}m ago`; }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) { return `${hours}h ago`; }
  const days = Math.floor(hours / 24);
  if (days < 7) { return `${days}d ago`; }
  return new Date(iso).toLocaleDateString();
}

export default function ThreadsScreen({ navigation }: Props) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const data = await apiService.listThreads({ limit: 100, reverse: true });
      setThreads(data.threads || []);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load threads';
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
    if (!q) { return threads; }
    return threads.filter((t) => (t.title || '').toLowerCase().includes(q));
  }, [threads, query]);

  const handleOpen = useCallback((thread: Thread) => {
    navigation.navigate('Chat', { threadId: thread.id });
  }, [navigation]);

  const handleNew = useCallback(() => {
    navigation.navigate('Chat', { threadId: undefined });
  }, [navigation]);

  const handleDelete = useCallback((thread: Thread) => {
    Alert.alert(
      'Delete thread',
      `Delete "${thread.title || 'Untitled'}"? Messages will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.deleteThread(thread.id);
              await load();
            } catch (e) {
              const message = e instanceof Error ? e.message : 'Failed to delete thread';
              Alert.alert('Delete failed', message);
            }
          },
        },
      ],
    );
  }, [load]);

  const renderItem = ({ item }: { item: Thread }) => (
    <TouchableOpacity
      onPress={() => handleOpen(item)}
      activeOpacity={0.7}
      style={[
        styles.card,
        shadows.small,
        { backgroundColor: colors.cardBg, borderColor: colors.borderLight },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open thread ${item.title || 'untitled'}`}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.primaryMuted }]}>
        <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
      </View>
      <View style={styles.meta}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {item.title || 'Untitled conversation'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textTertiary }]}>
          {formatRelative(item.updated_at || item.created_at)}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => handleDelete(item)}
        style={styles.deleteBtn}
        accessibilityRole="button"
        accessibilityLabel={`Delete thread ${item.title || 'untitled'}`}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="trash-outline" size={18} color={colors.error} />
      </TouchableOpacity>
    </TouchableOpacity>
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
            placeholder="Search threads..."
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search threads"
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
        keyExtractor={(t) => t.id}
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
            <Ionicons name="chatbubbles-outline" size={36} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {query.length > 0 ? `No threads matching "${query}"` : 'No conversations yet'}
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
        onPress={handleNew}
        accessibilityRole="button"
        accessibilityLabel="Start new conversation"
      >
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>
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
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  meta: { flex: 1, marginRight: 8 },
  title: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  subtitle: { fontSize: 12, marginTop: 2 },
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
});
