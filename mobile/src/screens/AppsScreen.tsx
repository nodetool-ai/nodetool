/**
 * The apps browser: every application the server hosts, and the home screen
 * after login.
 *
 * Apps and workflows are orthogonal — an app exists because someone made one,
 * and this list is how a phone reaches it. Opening one pushes its own screen,
 * the same one-document-per-screen model the documents browser uses. The
 * header carries the companion's other surfaces: chat, documents, jobs,
 * assets, and settings.
 */

import { useCallback, useLayoutEffect } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../hooks/useTheme';
import { useApplications } from '../hooks/useApplications';
import type { ApplicationListItem } from '../services/api';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import LoadErrorBanner from '../components/LoadErrorBanner';
import { FONT_SIZE, FONT_WEIGHT, MIN_TOUCH_TARGET, RADIUS, SPACING } from '../utils/tokens';
import { formatRelativeTime } from './DocumentsScreen';

type AppsScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Apps'>;
};

type HeaderRoute = 'Chat' | 'Documents' | 'Jobs' | 'Assets' | 'Settings';

const HEADER_ACTIONS: readonly { route: HeaderRoute; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { route: 'Chat', icon: 'chatbubble-ellipses-outline', label: 'Open chat' },
  { route: 'Documents', icon: 'documents-outline', label: 'Open documents' },
  { route: 'Jobs', icon: 'pulse-outline', label: 'Open jobs' },
  { route: 'Assets', icon: 'images-outline', label: 'Open assets' },
  { route: 'Settings', icon: 'settings-outline', label: 'Open settings' },
];

export default function AppsScreen({ navigation }: AppsScreenProps) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isRefetching, error, refetch } = useApplications();
  const apps = data ?? [];

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          {HEADER_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.route}
              onPress={() => navigation.navigate(action.route)}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              style={styles.headerButton}
            >
              <Ionicons name={action.icon} size={22} color={colors.primary} />
            </TouchableOpacity>
          ))}
        </View>
      ),
    });
  }, [navigation, colors.primary]);

  const openApp = useCallback(
    (app: ApplicationListItem) => {
      navigation.navigate('App', { applicationId: app.id, name: app.name });
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: ApplicationListItem }) => (
      <TouchableOpacity
        style={[
          styles.row,
          shadows.small,
          { backgroundColor: colors.cardBg, borderColor: colors.borderLight },
        ]}
        onPress={() => openApp(item)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.name}`}
        activeOpacity={0.7}
      >
        <View style={[styles.rowIcon, { backgroundColor: colors.primaryMuted }]}>
          <Ionicons name="apps-outline" size={20} color={colors.primary} />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.rowMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.operationCount === 1
              ? '1 operation'
              : `${item.operationCount} operations`}
            {' · '}
            {formatRelativeTime(item.updatedAt)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    ),
    [colors, openApp, shadows]
  );

  if (isLoading) {
    return <LoadingState label="Loading apps" />;
  }

  if (error && apps.length === 0) {
    return (
      <ErrorState
        title="Couldn't load apps"
        message={error.message || 'Check your connection and the server address in Settings.'}
        onRetry={() => { void refetch(); }}
        secondaryAction={{
          label: 'Open settings',
          icon: 'settings-outline',
          onPress: () => navigation.navigate('Settings'),
        }}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LoadErrorBanner
        error={error ? error.message || 'Could not refresh apps' : null}
        onRetry={() => { void refetch(); }}
      />
      <FlatList
        data={apps}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 24 },
          apps.length === 0 && styles.listContentEmpty,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            inline
            icon="apps-outline"
            title="No apps yet"
            message="Build a mini app in the desktop or web app and it shows up here, ready to run."
            action={{
              label: 'Ask the assistant',
              icon: 'chatbubble-ellipses-outline',
              onPress: () => navigation.navigate('Chat'),
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    width: 38,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: SPACING.lg,
    gap: SPACING.sm + 2,
  },
  // A content container only grows to its content, so the empty block has
  // nothing to centre in. Let it take the list's height instead.
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md + 2,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    width: 40,
    height: 40,
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
    fontSize: FONT_SIZE.caption,
  },
});
