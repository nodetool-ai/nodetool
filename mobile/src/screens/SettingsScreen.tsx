import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Settings</Text>

      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.text }]}>Theme</Text>
        <View style={[styles.themeSwitcher, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.themeOption,
              mode === 'light' && [styles.themeOptionActive, { backgroundColor: colors.primary }]
            ]}
            onPress={() => setTheme('light')}
          >
            <Text style={[styles.themeOptionText, { color: mode === 'light' ? '#fff' : colors.textSecondary }]}>
              Light
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.themeOption,
              mode === 'dark' && [styles.themeOptionActive, { backgroundColor: colors.primary }]
            ]}
            onPress={() => setTheme('dark')}
          >
            <Text style={[styles.themeOptionText, { color: mode === 'dark' ? '#fff' : colors.textSecondary }]}>
              Dark
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.themeOption,
              mode === 'system' && [styles.themeOptionActive, { backgroundColor: colors.primary }]
            ]}
            onPress={() => setTheme('system')}
          >
            <Text style={[styles.themeOptionText, { color: mode === 'system' ? '#fff' : colors.textSecondary }]}>
              System
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.text }]}>API Host</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
          value={apiHost}
          onChangeText={setApiHost}
          placeholder="http://localhost:8000"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Enter the URL of your NodeTool server
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.cardBg }, isTesting && styles.buttonDisabled]}
        onPress={handleTestConnection}
        disabled={isTesting || isSaving}
      >
        {isTesting ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={[styles.buttonText, { color: colors.text }]}>Test Connection</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }, isSaving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={isTesting || isSaving}
      >
        {isSaving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.buttonText, { color: '#fff' }]}>Save</Text>
        )}
      </TouchableOpacity>
    </View>
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
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
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
