/**
 * The apps browser: every application the server hosts, and the home screen
 * after login.
 *
 * Apps and workflows are orthogonal — an app exists because someone made one,
 * and this list is how a phone reaches it. Opening one pushes its own screen,
 * the same one-document-per-screen model the documents browser uses. The
 * tab bar carries the companion's other surfaces; the header gear opens
 * settings.
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TabScreenNavigationProp } from '../navigation/types';
import { useTheme } from '../hooks/useTheme';
import { useApplications } from '../hooks/useApplications';
import type { ApplicationListItem } from '../services/api';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import LoadErrorBanner from '../components/LoadErrorBanner';
import { FONT_SIZE, FONT_WEIGHT, MIN_TOUCH_TARGET, RADIUS, SPACING } from '../utils/tokens';
import { identityColor } from '../utils/theme';
import { formatRelativeTime } from './DocumentsScreen';

type AppsScreenProps = {
  navigation: TabScreenNavigationProp<'Apps'>;
};

/** First letters of the first two words: "Logo Maker" → "LM", "Brand & Social" → "BS". */
function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => /^[\p{L}\p{N}]/u.test(word));
  const letters = words.slice(0, 2).map((word) => word[0]);
  return (letters.join('') || '?').toUpperCase();
}

export default function AppsScreen({ navigation }: AppsScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isRefetching, error, refetch } = useApplications();
  const apps = data ?? [];

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('Settings')}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          style={styles.headerButton}
        >
          <Ionicons name="settings-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors.text]);

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
          { backgroundColor: colors.cardBg, borderColor: colors.borderLight },
        ]}
        onPress={() => openApp(item)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.name}`}
        activeOpacity={0.7}
      >
        <View style={[styles.rowIcon, { backgroundColor: identityColor(item.name) }]}>
          <Text style={styles.rowInitial} importantForAccessibility="no">
            {monogram(item.name)}
          </Text>
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
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </TouchableOpacity>
    ),
    [colors, openApp]
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
        ListHeaderComponent={
          apps.length > 0 ? (
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              {apps.length === 1 ? '1 app' : `${apps.length} apps`}
            </Text>
          ) : null
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
  headerButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.xs,
  },
  listContent: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  // A content container only grows to its content, so the empty block has
  // nothing to centre in. Let it take the list's height instead.
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: FONT_SIZE.footnote,
    fontWeight: FONT_WEIGHT.medium,
    marginBottom: SPACING.xs,
    marginLeft: SPACING.xs,
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
  // On an identity colour, which is a fixed mid-dark tone in both themes.
  rowInitial: {
    color: '#FFFFFF',
    fontSize: FONT_SIZE.headline,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: 0.5,
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
