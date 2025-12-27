import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { apiService } from '../services/api';
import { useChatStore } from '../stores/ChatStore';
import { useTheme } from '../hooks/useTheme';

export default function LanguageModelSelectionScreen() {
  const navigation = useNavigation();
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);
  const [step, setStep] = useState<1 | 2>(1);
  const [providers, setProviders] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { colors } = useTheme();

  // Update header title based on step
  useLayoutEffect(() => {
    navigation.setOptions({
      title: step === 1 ? 'Select Provider' : selectedProvider || 'Select Model',
      headerLeft: step === 2 ? () => (
        <TouchableOpacity 
          onPress={() => setStep(1)} 
          style={{ marginRight: 15, flexDirection: 'row', alignItems: 'center' }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
      ) : undefined,
    });
  }, [navigation, step, selectedProvider, colors.text]);

  // Load providers on mount
  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      setLoading(true);
      const data = await apiService.getLanguageModelProviders();
      setProviders(data);
    } catch (error) {
      console.error('Failed to load providers:', error);
      Alert.alert('Error', 'Failed to load model providers');
    } finally {
      setLoading(false);
    }
  };

  const handleProviderSelect = async (provider: string) => {
    setSelectedProvider(provider);
    setLoading(true);
    try {
      const data = await apiService.getLanguageModels(provider);
      setModels(data);
      setStep(2);
    } catch (error) {
      console.error('Failed to load models:', error);
      Alert.alert('Error', 'Failed to load models');
    } finally {
      setLoading(false);
    }
  };

  const handleModelSelect = (model: any) => {
    setSelectedModel(model);
    navigation.goBack();
  };

  const renderProviderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.item, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
      onPress={() => handleProviderSelect(item.provider)}
    >
      <Text style={[styles.itemText, { color: colors.text }]}>{item.provider}</Text>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  const renderModelItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.item, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
      onPress={() => handleModelSelect(item)}
    >
      <View>
        <Text style={[styles.itemText, { color: colors.text }]}>{item.name}</Text>
        {item.id !== item.name && (
          <Text style={[styles.subText, { color: colors.textSecondary }]}>{item.id}</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {step === 1 ? (
        <FlatList
          data={providers}
          renderItem={renderProviderItem}
          keyExtractor={(item) => item.provider}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No providers found</Text>
          }
        />
      ) : (
        <FlatList
          data={models}
          renderItem={renderModelItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No models found</Text>
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
  },
  listContent: {
    paddingVertical: 20,
  },
  item: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemText: {
    fontSize: 17,
  },
  subText: {
    fontSize: 12,
    marginTop: 4,
  },
  chevron: {
    fontSize: 20,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 17,
  },
});
