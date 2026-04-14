/**
 * Secrets management screen.
 * Allows the user to view, create, update, and delete API secrets.
 * Mirrors the web SecretsMenu feature: list secrets with metadata, show a
 * masked field per entry, reveal/edit value, save or delete.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { apiService, SecretResponse } from '../services/api';
import { useTheme } from '../hooks/useTheme';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Secrets'>;
};

interface EditorState {
  mode: 'create' | 'edit';
  key: string;
  description: string;
  value: string;
  saving: boolean;
}

export default function SecretsScreen({ navigation: _navigation }: Props) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();

  const [secrets, setSecrets] = useState<SecretResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const data = await apiService.listSecrets();
      setSecrets(data.secrets || []);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load secrets';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) { return secrets; }
    return secrets.filter(
      (s) => s.key.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q),
    );
  }, [secrets, query]);

  const openEdit = useCallback((secret: SecretResponse) => {
    setEditor({
      mode: 'edit',
      key: secret.key,
      description: secret.description || '',
      value: '',
      saving: false,
    });
  }, []);

  const openCreate = useCallback(() => {
    setEditor({ mode: 'create', key: '', description: '', value: '', saving: false });
  }, []);

  const closeEditor = useCallback(() => {
    Keyboard.dismiss();
    setEditor(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editor) { return; }
    const key = editor.key.trim();
    const value = editor.value;

    if (!key) {
      Alert.alert('Missing key', 'Please provide a key name.');
      return;
    }
    if (!value) {
      Alert.alert('Missing value', 'Please provide a value for the secret.');
      return;
    }

    setEditor({ ...editor, saving: true });
    try {
      await apiService.updateSecret(key, {
        value,
        description: editor.description.trim() || null,
      });
      await load();
      closeEditor();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save secret';
      Alert.alert('Save failed', message);
      setEditor({ ...editor, saving: false });
    }
  }, [editor, load, closeEditor]);

  const handleDelete = useCallback((secret: SecretResponse) => {
    Alert.alert(
      'Delete secret',
      `Delete "${secret.key}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.deleteSecret(secret.key);
              await load();
            } catch (e) {
              const message = e instanceof Error ? e.message : 'Failed to delete secret';
              Alert.alert('Delete failed', message);
            }
          },
        },
      ],
    );
  }, [load]);

  const renderItem = ({ item }: { item: SecretResponse }) => {
    const configured = item.is_configured;
    return (
      <TouchableOpacity
        onPress={() => openEdit(item)}
        activeOpacity={0.7}
        style={[
          styles.card,
          shadows.small,
          { backgroundColor: colors.cardBg, borderColor: colors.borderLight },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Edit secret ${item.key}`}
      >
        <View style={styles.cardRow}>
          <View style={[
            styles.statusDot,
            { backgroundColor: configured ? colors.success : colors.textTertiary },
          ]} />
          <View style={styles.cardMeta}>
            <Text style={[styles.keyText, { color: colors.text }]} numberOfLines={1}>
              {item.key}
            </Text>
            {item.description ? (
              <Text style={[styles.descText, { color: colors.textSecondary }]} numberOfLines={2}>
                {item.description}
              </Text>
            ) : (
              <Text style={[styles.descText, { color: colors.textTertiary }]}>
                {configured ? 'Configured' : 'Not configured'}
              </Text>
            )}
          </View>
          {configured ? (
            <TouchableOpacity
              onPress={() => handleDelete(item)}
              style={styles.deleteBtn}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${item.key}`}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </TouchableOpacity>
          ) : (
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.searchWrap}>
        <View style={[styles.search, { backgroundColor: colors.inputBg, borderColor: colors.borderLight }]}>
          <Ionicons name="search" size={16} color={colors.textTertiary} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search secrets..."
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search secrets"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loadError && (
        <View style={[styles.banner, { backgroundColor: colors.error + '18' }]}>
          <Ionicons name="warning-outline" size={14} color={colors.error} style={{ marginRight: 6 }} />
          <Text style={[styles.bannerText, { color: colors.error }]}>{loadError}</Text>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 96 }]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="key-outline" size={36} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {query.length > 0 ? `No secrets matching "${query}"` : 'No secrets yet'}
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={[
          styles.fab,
          shadows.medium,
          { backgroundColor: colors.primary, bottom: insets.bottom + 20 },
        ]}
        onPress={openCreate}
        accessibilityRole="button"
        accessibilityLabel="Add secret"
      >
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={editor !== null}
        animationType="slide"
        transparent
        onRequestClose={closeEditor}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={closeEditor}
            accessibilityLabel="Close editor"
          />
          <View
            style={[
              styles.modalSheet,
              shadows.large,
              { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                {editor?.mode === 'edit' ? 'Update secret' : 'New secret'}
              </Text>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Key</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.borderLight,
                    color: editor?.mode === 'edit' ? colors.textSecondary : colors.text,
                  },
                ]}
                value={editor?.key || ''}
                onChangeText={(t) => editor && setEditor({ ...editor, key: t })}
                placeholder="OPENAI_API_KEY"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={editor?.mode !== 'edit'}
                accessibilityLabel="Secret key"
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Value</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.inputBg, borderColor: colors.borderLight, color: colors.text },
                ]}
                value={editor?.value || ''}
                onChangeText={(t) => editor && setEditor({ ...editor, value: t })}
                placeholder="sk-..."
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                accessibilityLabel="Secret value"
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Description (optional)</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.inputMulti,
                  { backgroundColor: colors.inputBg, borderColor: colors.borderLight, color: colors.text },
                ]}
                value={editor?.description || ''}
                onChangeText={(t) => editor && setEditor({ ...editor, description: t })}
                placeholder="API key used by OpenAI provider"
                placeholderTextColor={colors.textTertiary}
                multiline
                accessibilityLabel="Secret description"
              />

              <View style={styles.sheetActions}>
                <TouchableOpacity
                  style={[styles.sheetButton, { backgroundColor: colors.inputBg }]}
                  onPress={closeEditor}
                  disabled={editor?.saving}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={[styles.sheetButtonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sheetButton, { backgroundColor: colors.primary, opacity: editor?.saving ? 0.6 : 1 }]}
                  onPress={handleSave}
                  disabled={editor?.saving}
                  accessibilityRole="button"
                  accessibilityLabel="Save secret"
                >
                  {editor?.saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={[styles.sheetButtonText, { color: '#fff' }]}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  banner: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: { fontSize: 13, fontWeight: '500' },
  list: { padding: 16, paddingTop: 4 },
  card: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  cardMeta: { flex: 1, marginRight: 8 },
  keyText: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  descText: { fontSize: 13, marginTop: 2 },
  deleteBtn: { padding: 4 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 14 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '92%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14, letterSpacing: -0.3 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
    marginTop: 6,
  },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  inputMulti: { minHeight: 70, textAlignVertical: 'top' },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    marginBottom: 4,
  },
  sheetButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  sheetButtonText: { fontSize: 15, fontWeight: '600' },
});
