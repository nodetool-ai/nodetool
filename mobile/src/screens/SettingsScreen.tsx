import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Linking,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import axios from 'axios';
import { apiService } from '../services/api';
import { useTheme } from '../hooks/useTheme';

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function SettingsScreen() {
  const [apiHost, setApiHost] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [savedIndicator, setSavedIndicator] = useState(false);
  const { colors, mode, setTheme } = useTheme();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const host = await apiService.loadApiHost();
      setApiHost(host);
    } catch (error) {
      console.error('Failed to load settings:', error);
      Alert.alert('Error', 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const showSavedIndicator = () => {
    setSavedIndicator(true);
    setTimeout(() => setSavedIndicator(false), 2000);
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    const trimmed = apiHost.trim();

    if (!trimmed) {
      Alert.alert('Error', 'Please enter a valid API host');
      return;
    }

    if (!isValidUrl(trimmed)) {
      Alert.alert('Invalid URL', 'Please enter a valid URL starting with http:// or https://');
      return;
    }

    try {
      setIsSaving(true);
      await apiService.saveApiHost(trimmed);
      setApiHost(trimmed);
      showSavedIndicator();
    } catch (error) {
      console.error('Failed to save settings:', error);
      Alert.alert('Error', 'Failed to save API host');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    Keyboard.dismiss();
    const trimmed = apiHost.trim();

    if (!trimmed) {
      Alert.alert('Error', 'Please enter a valid API host');
      return;
    }

    if (!isValidUrl(trimmed)) {
      Alert.alert('Invalid URL', 'Please enter a valid URL starting with http:// or https://');
      return;
    }

    try {
      setConnectionStatus('testing');
      const testClient = axios.create({
        baseURL: trimmed,
        timeout: 15000,
      });
      await testClient.get('/api/workflows/', { params: { limit: 1 } });

      // Auto-save on successful test
      await apiService.saveApiHost(trimmed);
      setApiHost(trimmed);
      setConnectionStatus('success');
      setTimeout(() => setConnectionStatus('idle'), 3000);
    } catch (error: any) {
      console.error('Connection test failed:', error);
      setConnectionStatus('error');
      const detail = error.code === 'ECONNABORTED'
        ? 'Connection timed out. Is the server running?'
        : error.code === 'ERR_NETWORK'
          ? 'Network error. Check the URL and your connection.'
          : 'Could not reach the server. Verify the URL is correct.';
      Alert.alert('Connection Failed', detail);
      setTimeout(() => setConnectionStatus('idle'), 3000);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  const getTestButtonStyle = () => {
    switch (connectionStatus) {
      case 'success':
        return { backgroundColor: colors.success + '20', borderColor: colors.success };
      case 'error':
        return { backgroundColor: colors.error + '20', borderColor: colors.error };
      default:
        return { backgroundColor: colors.cardBg, borderColor: colors.border };
    }
  };

  const getTestButtonContent = () => {
    switch (connectionStatus) {
      case 'testing':
        return <ActivityIndicator color={colors.text} />;
      case 'success':
        return (
          <View style={styles.buttonContent}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} style={styles.buttonIcon} />
            <Text style={[styles.buttonText, { color: colors.success }]}>Connected & Saved</Text>
          </View>
        );
      case 'error':
        return (
          <View style={styles.buttonContent}>
            <Ionicons name="close-circle" size={18} color={colors.error} style={styles.buttonIcon} />
            <Text style={[styles.buttonText, { color: colors.error }]}>Connection Failed</Text>
          </View>
        );
      default:
        return (
          <View style={styles.buttonContent}>
            <Ionicons name="wifi-outline" size={18} color={colors.text} style={styles.buttonIcon} />
            <Text style={[styles.buttonText, { color: colors.text }]}>Test & Save</Text>
          </View>
        );
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: colors.text }]}>Settings</Text>

      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.text }]}>Theme</Text>
        <View style={[styles.themeSwitcher, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          {(['light', 'dark', 'system'] as const).map((theme) => (
            <TouchableOpacity
              key={theme}
              style={[
                styles.themeOption,
                mode === theme && [styles.themeOptionActive, { backgroundColor: colors.primary }]
              ]}
              onPress={() => setTheme(theme)}
              accessibilityRole="button"
              accessibilityLabel={`${theme} theme`}
              accessibilityState={{ selected: mode === theme }}
            >
              <Ionicons
                name={theme === 'light' ? 'sunny-outline' : theme === 'dark' ? 'moon-outline' : 'phone-portrait-outline'}
                size={16}
                color={mode === theme ? '#fff' : colors.textSecondary}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.themeOptionText, { color: mode === theme ? '#fff' : colors.textSecondary }]}>
                {theme.charAt(0).toUpperCase() + theme.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: colors.text }]}>API Host</Text>
          {savedIndicator && (
            <View style={styles.savedBadge}>
              <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              <Text style={[styles.savedText, { color: colors.success }]}>Saved</Text>
            </View>
          )}
        </View>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
          value={apiHost}
          onChangeText={(text) => {
            setApiHost(text);
            setConnectionStatus('idle');
          }}
          placeholder="http://192.168.1.100:7777"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
          accessibilityLabel="API host URL"
        />
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          The URL of your NodeTool server (e.g. http://your-ip:7777)
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.button, getTestButtonStyle(), { borderWidth: 1 }, connectionStatus === 'testing' && styles.buttonDisabled]}
        onPress={handleTestConnection}
        disabled={connectionStatus === 'testing' || isSaving}
        accessibilityRole="button"
        accessibilityLabel="Test connection and save"
      >
        {getTestButtonContent()}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }, isSaving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={connectionStatus === 'testing' || isSaving}
        accessibilityRole="button"
        accessibilityLabel="Save settings"
      >
        {isSaving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.buttonText, { color: '#fff' }]}>Save Only</Text>
        )}
      </TouchableOpacity>

      <View style={[styles.aboutSection, { borderTopColor: colors.border }]}>
        <Text style={[styles.aboutTitle, { color: colors.text }]}>About</Text>
        <View style={styles.aboutRow}>
          <Text style={[styles.aboutLabel, { color: colors.textSecondary }]}>Version</Text>
          <Text style={[styles.aboutValue, { color: colors.text }]}>{appVersion}</Text>
        </View>
        <TouchableOpacity
          style={styles.aboutRow}
          onPress={() => Linking.openURL('https://github.com/nodetool-ai/nodetool')}
          accessibilityRole="link"
          accessibilityLabel="Open NodeTool on GitHub"
        >
          <Text style={[styles.aboutLabel, { color: colors.textSecondary }]}>GitHub</Text>
          <View style={styles.aboutLink}>
            <Text style={[styles.aboutValue, { color: colors.primary }]}>nodetool-ai/nodetool</Text>
            <Ionicons name="open-outline" size={14} color={colors.primary} style={{ marginLeft: 4 }} />
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  section: {
    marginBottom: 25,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  savedText: {
    fontSize: 13,
    fontWeight: '500',
  },
  input: {
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  hint: {
    fontSize: 14,
    marginTop: 6,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  aboutSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
  },
  aboutTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  aboutLabel: {
    fontSize: 15,
  },
  aboutValue: {
    fontSize: 15,
    fontWeight: '500',
  },
  aboutLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeSwitcher: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    padding: 4,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  themeOptionActive: {
  },
  themeOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
