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
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search input
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
    if (!debouncedQuery.trim()) return workflows;
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
    } catch (error: any) {
      console.error('Failed to load workflows:', error);
      const errorMessage = error.message || 'Network Error';
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

  // Cleanup debounce timer
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
      style={[styles.workflowCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
      onPress={() => handleWorkflowPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.name}${item.description ? `: ${item.description}` : ''}`}
      activeOpacity={0.7}
    >
      <View style={[styles.workflowIcon, { backgroundColor: colors.primaryMuted }]}>
        <Ionicons name="cube-outline" size={22} color={colors.primary} />
      </View>
      <View style={styles.workflowContent}>
        <Text style={[styles.workflowName, { color: colors.text }]}>{item.name}</Text>
        {item.description && (
          <Text style={[styles.workflowDescription, { color: colors.textSecondary }]} numberOfLines={2}>
            {item.description}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
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
          borderBottomColor: colors.border,
          paddingTop: insets.top + 10
        }
      ]}>
        <Text style={[styles.title, { color: colors.text }]}>Mini Apps</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.navigate('Chat')}
            accessibilityRole="button"
            accessibilityLabel="Open chat"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={26} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.navigate('Settings')}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <Ionicons name="settings-outline" size={26} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {workflows.length === 0 ? (
        <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
          <Ionicons name="apps-outline" size={64} color={colors.border} style={{ marginBottom: 16 }} />
          <Text style={[styles.emptyText, { color: colors.text }]}>
            {loadError ? 'Connection failed' : 'No mini apps found'}
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            {loadError
              ? 'Could not connect to the server. Check your settings and try again.'
              : 'Make sure your server is running and configured correctly'}
          </Text>
          <View style={styles.emptyButtons}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={loadWorkflows}
              accessibilityRole="button"
              accessibilityLabel="Retry loading"
            >
              <Ionicons name="refresh-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.buttonText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.buttonOutline, { borderColor: colors.border }]}
              onPress={() => navigation.navigate('Settings')}
              accessibilityRole="button"
              accessibilityLabel="Go to Settings"
            >
              <Text style={[styles.buttonOutlineText, { color: colors.text }]}>Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          {workflows.length > 3 && (
            <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
              <View style={[styles.searchBar, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <Ionicons name="search" size={18} color={colors.textSecondary} style={styles.searchIcon} />
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  placeholder="Search mini apps..."
                  placeholderTextColor={colors.textSecondary}
                  value={searchQuery}
                  onChangeText={handleSearchChange}
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                  accessibilityLabel="Search mini apps"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => { setSearchQuery(''); setDebouncedQuery(''); }} accessibilityLabel="Clear search">
                    <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          <FlatList
            data={filteredWorkflows}
            renderItem={renderWorkflowItem}
            keyExtractor={(item) => item.id}
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
                  <Ionicons name="search-outline" size={48} color={colors.border} />
                  <Text style={[styles.noResultsText, { color: colors.textSecondary }]}>
                    No results for "{searchQuery}"
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
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButton: {
    padding: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  listContent: {
    padding: 16,
  },
  workflowCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  workflowIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  workflowContent: {
    flex: 1,
  },
  workflowName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  workflowDescription: {
    fontSize: 14,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
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
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonOutline: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  buttonOutlineText: {
    fontSize: 16,
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
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
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
  noResultsText: {
    fontSize: 16,
  },
});
