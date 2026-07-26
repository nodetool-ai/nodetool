/**
 * The apps browser: every application the server hosts.
 *
 * Apps and workflows are orthogonal — an app exists because someone made one,
 * and this list is how a phone reaches it. Opening one pushes its own screen,
 * the same one-document-per-screen model the documents browser uses.
 */

import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../hooks/useTheme';
import { useApplications } from '../hooks/useApplications';
import type { ApplicationListItem } from '../services/api';
import { formatRelativeTime } from './DocumentsScreen';

type AppsScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Apps'>;
};

export default function AppsScreen({ navigation }: AppsScreenProps) {
  const { colors, shadows } = useTheme();
  const { data, isLoading, isRefetching, error, refetch } = useApplications();

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
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.centerText, { color: colors.textSecondary }]}>
          Loading apps...
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
            {error.message || 'Could not load apps'}
          </Text>
        </View>
      ) : null}
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="apps-outline" size={40} color={colors.textSecondary} />
            <Text style={[styles.centerText, { color: colors.textSecondary }]}>
              No apps yet. Build one in the desktop app builder.
            </Text>
          </View>
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
    padding: 16,
    gap: 10,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  centerText: {
    fontSize: 15,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowMeta: {
    fontSize: 12,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    marginBottom: 0,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
  },
});
