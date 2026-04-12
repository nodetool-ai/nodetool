import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { apiService } from '../services/api';
import { Workflow } from '../types/miniapp';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type MiniAppsListScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MiniAppsList'>;
};

export default function MiniAppsListScreen({ navigation }: MiniAppsListScreenProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      setDebouncedQuery(text);
    }, 300);
  }, []);

  const filteredWorkflows = useMemo(() => {
    if (!debouncedQuery.trim()) {return workflows;}
    const query = debouncedQuery.toLowerCase();
    return workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(query) ||
        (w.description && w.description.toLowerCase().includes(query))
    );
  }, [workflows, debouncedQuery]);

  const loadWorkflows = useCallback(async () => {
    try {
      setLoadError(null);
      const data = await apiService.getWorkflows();
      const workflowsList = Array.isArray(data) ? data : (data?.workflows || []);
      setWorkflows(workflowsList);
    } catch (error: unknown) {
      console.error('Failed to load workflows:', error);
      const errorMessage = error instanceof Error ? error.message : 'Network Error';
      setLoadError(errorMessage);
      Alert.alert(
        'Connection Error',
        `Could not load mini apps.\n\n${errorMessage}`,
        [
          { text: 'Settings', onPress: () => navigation.navigate('Settings') },
          { text: 'Retry', onPress: loadWorkflows },
        ]
      );
    } finally {
      setIsLoading(false);
    }
  }, [navigation]);

  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);
      try {
        await apiService.loadApiHost();
      } catch (error) {
        console.error('Failed to initialize:', error);
      }
      await loadWorkflows();
    };
    initialize();
  }, [loadWorkflows]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadWorkflows();
    setIsRefreshing(false);
  };

  const handleWorkflowPress = (workflow: Workflow) => {
    navigation.navigate('MiniApp', { workflowId: workflow.id, workflowName: workflow.name });
  };

  const renderWorkflowItem = ({ item }: { item: Workflow }) => (
    <TouchableOpacity
      style={[
        styles.workflowCard,
        shadows.small,
        { backgroundColor: colors.cardBg, borderColor: colors.borderLight },
      ]}
      onPress={() => handleWorkflowPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.name}${item.description ? `: ${item.description}` : ''}`}
      activeOpacity={0.7}
    >
      <View style={[styles.workflowIcon, { backgroundColor: colors.primaryMuted }]}>
        <Ionicons name="cube-outline" size={20} color={colors.primary} />
      </View>
      <View style={styles.workflowContent}>
        <Text style={[styles.workflowName, { color: colors.text }]}>{item.name}</Text>
        {item.description ? (
          <Text style={[styles.workflowDescription, { color: colors.textSecondary }]} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
      </View>
      <View style={[styles.chevronContainer, { backgroundColor: colors.primaryLight }]}>
        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.loadingIconWrap, { backgroundColor: colors.primaryMuted }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading mini apps...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[
        styles.header,
        {
          backgroundColor: colors.surfaceHeader,
          borderBottomColor: colors.borderLight,
          paddingTop: insets.top + 12,
        }
      ]}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Mini Apps</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {workflows.length > 0 ? `${workflows.length} available` : 'Your workflows'}
          </Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.headerButton, { backgroundColor: colors.primaryMuted }]}
            onPress={() => navigation.navigate('Chat')}
            accessibilityRole="button"
            accessibilityLabel="Open chat"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerButton, { backgroundColor: colors.primaryMuted }]}
            onPress={() => navigation.navigate('Settings')}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <Ionicons name="settings-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {workflows.length === 0 ? (
        <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.primaryMuted }]}>
            <Ionicons name="apps-outline" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.emptyText, { color: colors.text }]}>
            {loadError ? 'Connection failed' : 'No mini apps found'}
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            {loadError
              ? 'Could not connect to the server.\nCheck your settings and try again.'
              : 'Make sure your server is running\nand configured correctly.'}
          </Text>
          <View style={styles.emptyButtons}>
            <TouchableOpacity
              style={[styles.button, shadows.small, { backgroundColor: colors.primary }]}
              onPress={loadWorkflows}
              accessibilityRole="button"
              accessibilityLabel="Retry loading"
            >
              <Ionicons name="refresh-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.buttonText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.buttonOutline, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => navigation.navigate('Settings')}
              accessibilityRole="button"
              accessibilityLabel="Go to Settings"
            >
              <Ionicons name="settings-outline" size={16} color={colors.text} style={{ marginRight: 6 }} />
              <Text style={[styles.buttonOutlineText, { color: colors.text }]}>Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          {workflows.length > 3 && (
            <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
              <View style={[styles.searchBar, { backgroundColor: colors.inputBg, borderColor: colors.borderLight }]}>
                <Ionicons name="search" size={18} color={colors.textTertiary} style={styles.searchIcon} />
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  placeholder="Search mini apps..."
                  placeholderTextColor={colors.textTertiary}
                  value={searchQuery}
                  onChangeText={handleSearchChange}
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                  accessibilityLabel="Search mini apps"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => { setSearchQuery(''); setDebouncedQuery(''); }} accessibilityLabel="Clear search">
                    <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          <FlatList
            data={filteredWorkflows}
            renderItem={renderWorkflowItem}
            keyExtractor={(item: Workflow) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            ListEmptyComponent={
              searchQuery.length > 0 ? (
                <View style={styles.noResultsContainer}>
                  <View style={[styles.noResultsIconWrap, { backgroundColor: colors.primaryMuted }]}>
                    <Ionicons name="search-outline" size={28} color={colors.primary} />
                  </View>
                  <Text style={[styles.noResultsText, { color: colors.textSecondary }]}>
                    No results for &quot;{searchQuery}&quot;
                  </Text>
                </View>
              ) : null
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  loadingIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 15,
  },
  listContent: {
    padding: 16,
    paddingTop: 12,
  },
  workflowCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  workflowIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  workflowContent: {
    flex: 1,
    marginRight: 8,
  },
  workflowName: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  workflowDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  chevronContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  emptySubtext: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
  emptyButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
  },
  buttonOutlineText: {
    fontSize: 15,
    fontWeight: '600',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    height: 42,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  noResultsContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  noResultsIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: 15,
  },
});
