/**
 * The games browser: every game the signed-in user owns, newest first.
 *
 * Each row opens the game's published revision in the player. Games are made
 * and edited in the desktop or web editor, or by the assistant; the phone only
 * plays them. Reached from the controller button on the Apps header.
 */

import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../navigation/types';
import { trpc, type RouterOutputs } from '../trpc/client';
import { useTheme } from '../hooks/useTheme';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import LoadErrorBanner from '../components/LoadErrorBanner';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../utils/tokens';
import { identityColor } from '../utils/theme';
import { formatRelativeTime } from './DocumentsScreen';

type GameListItem = RouterOutputs['games']['listAll'][number];

type GamesScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Games'>;
};

export default function GamesScreen({ navigation }: GamesScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isRefetching, error, refetch } = trpc.games.listAll.useQuery();
  const games = data ?? [];

  const openGame = useCallback(
    (game: GameListItem) => {
      navigation.navigate('GamePlayer', { gameId: game.id, name: game.name });
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: GameListItem }) => (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: colors.cardBg, borderColor: colors.borderLight }]}
        onPress={() => openGame(item)}
        accessibilityRole="button"
        accessibilityLabel={`Play ${item.name}`}
        activeOpacity={0.7}
      >
        <View style={[styles.rowIcon, { backgroundColor: identityColor(item.name) }]}>
          <Ionicons name="game-controller-outline" size={22} color="#FFFFFF" />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.rowMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {formatRelativeTime(item.updatedAt)}
          </Text>
        </View>
        <Ionicons name="play" size={18} color={colors.textTertiary} />
      </TouchableOpacity>
    ),
    [colors, openGame]
  );

  if (isLoading) {
    return <LoadingState label="Loading games" />;
  }

  if (error && games.length === 0) {
    return (
      <ErrorState
        title="Couldn't load games"
        message={error.message || 'Check your connection and the server address in Settings.'}
        onRetry={() => { void refetch(); }}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LoadErrorBanner
        error={error ? error.message || 'Could not refresh games' : null}
        onRetry={() => { void refetch(); }}
      />
      <FlatList
        data={games}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + SPACING.xl },
          games.length === 0 && styles.listContentEmpty,
        ]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState
            inline
            icon="game-controller-outline"
            title="No games yet"
            message="Make a game in the desktop or web editor, or ask the assistant to build one, and it shows up here to play."
            action={{
              label: 'Ask the assistant',
              icon: 'chatbubble-ellipses-outline',
              onPress: () => navigation.navigate('Main', { screen: 'Chat' }),
            }}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: SPACING.xxs,
  },
  rowName: {
    fontSize: FONT_SIZE.body,
    fontWeight: FONT_WEIGHT.semibold,
  },
  rowMeta: {
    fontSize: FONT_SIZE.footnote,
  },
});
