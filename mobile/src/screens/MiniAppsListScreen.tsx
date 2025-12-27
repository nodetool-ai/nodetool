import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
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
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    initializeAndLoadWorkflows();
  }, []);

  const initializeAndLoadWorkflows = async () => {
    try {
      setIsLoading(true);
      await apiService.loadApiHost();
      console.log('API Host loaded:', apiService.getApiHost());
      await loadWorkflows();
    } catch (error) {
      console.error('Failed to initialize:', error);
      setIsLoading(false);
    }
  };

  const loadWorkflows = async () => {
    try {
      const data = await apiService.getWorkflows();
      console.log('Workflows loaded:', data);
      const workflowsList = Array.isArray(data) ? data : (data?.workflows || []);
      setWorkflows(workflowsList);
    } catch (error: any) {
      console.error('Failed to load workflows:', error);
      console.error('Current API Host:', apiService.getApiHost());
      Alert.alert(
        'Error',
        `Failed to load mini apps. Please check your server settings.\n\nError: ${error.message || 'Network Error'}`,
        [
          { text: 'Go to Settings', onPress: () => navigation.navigate('Settings') },
          { text: 'Retry', onPress: loadWorkflows },
        ]
      );
    } finally {
      setIsLoading(false);
    }
  };

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
    >
      <View style={styles.workflowContent}>
        <Text style={[styles.workflowName, { color: colors.text }]}>{item.name}</Text>
        {item.description && (
          <Text style={[styles.workflowDescription, { color: colors.textSecondary }]} numberOfLines={2}>
            {item.description}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={24} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.text} />
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
          >
            <Ionicons name="chatbubble-ellipses-outline" size={26} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.navigate('Settings')}
          >
            <Ionicons name="settings-outline" size={26} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {workflows.length === 0 ? (
        <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
          <Ionicons name="apps-outline" size={64} color={colors.border} style={{ marginBottom: 16 }} />
          <Text style={[styles.emptyText, { color: colors.text }]}>No mini apps found</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Make sure your server is running and configured correctly
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('Settings')}
          >
            <Text style={styles.buttonText}>Go to Settings</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={workflows}
          renderItem={renderWorkflowItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.text}
              colors={[colors.primary]}
            />
          }
        />
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
  headerButtonText: {
    fontSize: 16,
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
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
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
  arrow: {
    fontSize: 28,
    marginLeft: 12,
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
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
