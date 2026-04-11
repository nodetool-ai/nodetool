import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { apiService } from '../services/api';
import { useChatStore } from '../stores/ChatStore';
import { useTheme } from '../hooks/useTheme';
import { LanguageModel } from '../types';

interface Provider {
  provider: string;
}

export default function LanguageModelSelectionScreen() {
  const navigation = useNavigation();
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);
  const [step, setStep] = useState<1 | 2>(1);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<LanguageModel[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { colors, shadows } = useTheme();

  useLayoutEffect(() => {
    navigation.setOptions({
      title: step === 1 ? 'Select Provider' : selectedProvider || 'Select Model',
      headerLeft: step === 2 ? () => (
        <TouchableOpacity
          onPress={() => { setStep(1); setSearchQuery(''); }}
          style={{ marginRight: 15, flexDirection: 'row', alignItems: 'center' }}
          accessibilityLabel="Go back to providers"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
      ) : undefined,
    });
  }, [navigation, step, selectedProvider, colors.text]);

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
      Alert.alert('Error', 'Failed to load model providers. Check your server connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleProviderSelect = async (provider: string) => {
    setSelectedProvider(provider);
    setSearchQuery('');
    setLoading(true);
    try {
      const data = await apiService.getLanguageModels(provider);
      setModels(data);
      setStep(2);
    } catch (error) {
      console.error('Failed to load models:', error);
      Alert.alert('Error', 'Failed to load models for this provider.');
    } finally {
      setLoading(false);
    }
  };

  const handleModelSelect = (model: LanguageModel) => {
    setSelectedModel(model);
    navigation.goBack();
  };

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return models;
    const query = searchQuery.toLowerCase();
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query)
    );
  }, [models, searchQuery]);

  const filteredProviders = useMemo(() => {
    if (!searchQuery.trim()) return providers;
    const query = searchQuery.toLowerCase();
    return providers.filter((p) => p.provider.toLowerCase().includes(query));
  }, [providers, searchQuery]);

  const renderSearchBar = () => (
    <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
      <View style={[styles.searchBar, { backgroundColor: colors.inputBg, borderColor: colors.borderLight }]}>
        <Ionicons name="search" size={18} color={colors.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder={step === 1 ? 'Search providers...' : 'Search models...'}
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderProviderItem = ({ item }: { item: Provider }) => (
    <TouchableOpacity
      style={[styles.item, shadows.small, { backgroundColor: colors.cardBg, borderColor: colors.borderLight }]}
      onPress={() => handleProviderSelect(item.provider)}
      accessibilityRole="button"
      accessibilityLabel={`Select provider ${item.provider}`}
      activeOpacity={0.7}
    >
      <View style={[styles.itemIconWrap, { backgroundColor: colors.primaryMuted }]}>
        <Ionicons name="cloud-outline" size={18} color={colors.primary} />
      </View>
      <Text style={[styles.itemText, { color: colors.text }]}>{item.provider}</Text>
      <View style={[styles.itemChevron, { backgroundColor: colors.primaryLight }]}>
        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </View>
    </TouchableOpacity>
  );

  const renderModelItem = ({ item }: { item: LanguageModel }) => (
    <TouchableOpacity
      style={[styles.item, shadows.small, { backgroundColor: colors.cardBg, borderColor: colors.borderLight }]}
      onPress={() => handleModelSelect(item)}
      accessibilityRole="button"
      accessibilityLabel={`Select model ${item.name}`}
      activeOpacity={0.7}
    >
      <View style={[styles.itemIconWrap, { backgroundColor: colors.accentMuted }]}>
        <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
      </View>
      <View style={styles.modelInfo}>
        <Text style={[styles.itemText, { color: colors.text }]}>{item.name}</Text>
        {item.id !== item.name && (
          <Text style={[styles.subText, { color: colors.textTertiary }]}>{item.id}</Text>
        )}
      </View>
      <Ionicons name="checkmark-circle-outline" size={20} color={colors.textTertiary} />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.loadingWrap, { backgroundColor: colors.primaryMuted }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          {step === 1 ? 'Loading providers...' : 'Loading models...'}
        </Text>
      </View>
    );
  }

  const renderEmptyList = (type: string) => (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconWrap, { backgroundColor: colors.primaryMuted }]}>
        <Ionicons name="search-outline" size={28} color={colors.primary} />
      </View>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
        {searchQuery ? `No ${type} matching "${searchQuery}"` : `No ${type} found`}
      </Text>
      {!searchQuery && (
        <TouchableOpacity
          style={[styles.retryButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
          onPress={step === 1 ? loadProviders : () => selectedProvider && handleProviderSelect(selectedProvider)}
        >
          <Ionicons name="refresh-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
          <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Step indicator */}
      <View style={[styles.stepIndicator, { borderBottomColor: colors.borderLight }]}>
        <View style={[styles.stepDot, { backgroundColor: step === 1 ? colors.primary : colors.border }]} />
        <View style={[styles.stepLine, { backgroundColor: step === 2 ? colors.primary : colors.border }]} />
        <View style={[styles.stepDot, { backgroundColor: step === 2 ? colors.primary : colors.border }]} />
      </View>

      {((step === 1 && providers.length > 5) || (step === 2 && models.length > 5)) && renderSearchBar()}

      {step === 1 ? (
        <FlatList
          data={filteredProviders}
          renderItem={renderProviderItem}
          keyExtractor={(item: Provider) => item.provider}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyList('providers')}
        />
      ) : (
        <FlatList
          data={filteredModels}
          renderItem={renderModelItem}
          keyExtractor={(item: LanguageModel) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyList('models')}
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
  loadingWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 15,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stepLine: {
    width: 28,
    height: 2,
    marginHorizontal: 6,
    borderRadius: 1,
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
  listContent: {
    padding: 16,
    paddingTop: 12,
    gap: 8,
  },
  item: {
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemChevron: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modelInfo: {
    flex: 1,
    marginRight: 12,
  },
  itemText: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  subText: {
    fontSize: 12,
    marginTop: 3,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 15,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
