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
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { apiService } from '../services/api';
import { Workflow } from '../types/miniapp';
import { RootStackParamList } from '../navigation/types';

type MiniAppsListScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MiniAppsList'>;
};

export default function MiniAppsListScreen({ navigation }: MiniAppsListScreenProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
      style={styles.workflowCard}
      onPress={() => handleWorkflowPress(item)}
    >
      <View style={styles.workflowContent}>
        <Text style={styles.workflowName}>{item.name}</Text>
        {item.description && (
          <Text style={styles.workflowDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}
      </View>
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading mini apps...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mini Apps</Text>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={styles.settingsButtonText}>⚙️ Settings</Text>
        </TouchableOpacity>
      </View>

      {workflows.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No mini apps found</Text>
          <Text style={styles.emptySubtext}>
            Make sure your server is running and configured correctly
          </Text>
          <TouchableOpacity
            style={styles.button}
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
              tintColor="#007AFF"
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
    backgroundColor: '#f5f5f5',
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
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  settingsButton: {
    padding: 8,
  },
  settingsButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  listContent: {
    padding: 16,
  },
  workflowCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  workflowContent: {
    flex: 1,
  },
  workflowName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  workflowDescription: {
    fontSize: 14,
    color: '#666',
  },
  arrow: {
    fontSize: 28,
    color: '#ccc',
    marginLeft: 12,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
