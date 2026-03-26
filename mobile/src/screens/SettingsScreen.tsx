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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import axios from 'axios';
import { apiService } from '../services/api';
import { useTheme } from '../hooks/useTheme';

export default function SettingsScreen() {
  const [apiHost, setApiHost] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
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

  const handleSave = async () => {
    if (!apiHost.trim()) {
      Alert.alert('Error', 'Please enter a valid API host');
      return;
    }

    try {
      setIsSaving(true);
      await apiService.saveApiHost(apiHost.trim());
      Alert.alert('Success', 'API host saved successfully');
    } catch (error) {
      console.error('Failed to save settings:', error);
      Alert.alert('Error', 'Failed to save API host');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!apiHost.trim()) {
      Alert.alert('Error', 'Please enter a valid API host');
      return;
    }

    try {
      setIsTesting(true);
      const testClient = axios.create({
        baseURL: apiHost.trim(),
        timeout: 30000,
      });
      await testClient.get('/api/workflows/', { params: { limit: 1 } });
      
      await apiService.saveApiHost(apiHost.trim());
      Alert.alert('Success', 'Connection successful!');
    } catch (error) {
      console.error('Connection test failed:', error);
      Alert.alert('Error', 'Failed to connect to server. Please check the host URL.');
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.scrollContent}>
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
              <Text style={[styles.themeOptionText, { color: mode === theme ? '#fff' : colors.textSecondary }]}>
                {theme.charAt(0).toUpperCase() + theme.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.text }]}>API Host</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
          value={apiHost}
          onChangeText={setApiHost}
          placeholder="http://localhost:7777"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          accessibilityLabel="API host URL"
        />
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Enter the URL of your NodeTool server
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.cardBg, borderColor: colors.border, borderWidth: 1 }, isTesting && styles.buttonDisabled]}
        onPress={handleTestConnection}
        disabled={isTesting || isSaving}
        accessibilityRole="button"
        accessibilityLabel="Test connection"
      >
        {isTesting ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <View style={styles.buttonContent}>
            <Ionicons name="wifi-outline" size={18} color={colors.text} style={styles.buttonIcon} />
            <Text style={[styles.buttonText, { color: colors.text }]}>Test Connection</Text>
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }, isSaving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={isTesting || isSaving}
        accessibilityRole="button"
        accessibilityLabel="Save settings"
      >
        {isSaving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.buttonText, { color: '#fff' }]}>Save</Text>
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
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
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
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  themeOptionActive: {
  },
  themeOptionText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
