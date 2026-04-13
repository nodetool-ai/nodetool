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
import { apiService } from '../services/api';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../stores/AuthStore';

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
  const { colors, shadows, mode, setTheme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const authState = useAuthStore((s) => s.state);
  const signOut = useAuthStore((s) => s.signOut);
  const isSigningOut = authState === 'loading';

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
          },
        },
      ],
      { cancelable: true }
    );
  };

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
      await apiService.saveApiHost(trimmed);
      await apiService.getWorkflows(1);
      setApiHost(trimmed);
      setConnectionStatus('success');
      setTimeout(() => setConnectionStatus('idle'), 3000);
    } catch (error: unknown) {
      console.error('Connection test failed:', error);
      setConnectionStatus('error');
      const message = error instanceof Error ? error.message : String(error);
      const detail = message.includes('timeout') || message.includes('Timeout')
        ? 'Connection timed out. Is the server running?'
        : message.includes('Network') || message.includes('fetch')
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
        return { backgroundColor: colors.success + '15', borderColor: colors.success };
      case 'error':
        return { backgroundColor: colors.error + '15', borderColor: colors.error };
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
      {/* Theme Section */}
      <View style={[styles.card, shadows.small, { backgroundColor: colors.cardBg, borderColor: colors.borderLight }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.cardIconWrap, { backgroundColor: colors.accentMuted }]}>
            <Ionicons name="color-palette-outline" size={16} color={colors.accent} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Appearance</Text>
        </View>
        <View style={[styles.themeSwitcher, { backgroundColor: colors.inputBg, borderColor: colors.borderLight }]}>
          {(['light', 'dark', 'system'] as const).map((theme) => (
            <TouchableOpacity
              key={theme}
              style={[
                styles.themeOption,
                mode === theme && [styles.themeOptionActive, shadows.small, { backgroundColor: colors.primary }]
              ]}
              onPress={() => setTheme(theme)}
              accessibilityRole="button"
              accessibilityLabel={`${theme} theme`}
              accessibilityState={{ selected: mode === theme }}
            >
              <Ionicons
                name={theme === 'light' ? 'sunny-outline' : theme === 'dark' ? 'moon-outline' : 'phone-portrait-outline'}
                size={15}
                color={mode === theme ? '#fff' : colors.textSecondary}
                style={{ marginRight: 5 }}
              />
              <Text style={[styles.themeOptionText, { color: mode === theme ? '#fff' : colors.textSecondary }]}>
                {theme.charAt(0).toUpperCase() + theme.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Server Section */}
      <View style={[styles.card, shadows.small, { backgroundColor: colors.cardBg, borderColor: colors.borderLight }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.cardIconWrap, { backgroundColor: colors.primaryMuted }]}>
            <Ionicons name="server-outline" size={16} color={colors.primary} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Server Connection</Text>
          {savedIndicator && (
            <View style={[styles.savedBadge, { backgroundColor: colors.success + '15' }]}>
              <Ionicons name="checkmark-circle" size={13} color={colors.success} />
              <Text style={[styles.savedText, { color: colors.success }]}>Saved</Text>
            </View>
          )}
        </View>

        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>API Host</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.borderLight }]}
          value={apiHost}
          onChangeText={(text: string) => {
            setApiHost(text);
            setConnectionStatus('idle');
          }}
          placeholder="http://192.168.1.100:7777"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
          accessibilityLabel="API host URL"
        />
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          The URL of your NodeTool server (e.g. http://your-ip:7777)
        </Text>

        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[styles.button, getTestButtonStyle(), { borderWidth: 1, flex: 1 }, connectionStatus === 'testing' && styles.buttonDisabled]}
            onPress={handleTestConnection}
            disabled={connectionStatus === 'testing' || isSaving}
            accessibilityRole="button"
            accessibilityLabel="Test connection and save"
          >
            {getTestButtonContent()}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary, flex: 1 }, isSaving && styles.buttonDisabled]}
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
        </View>
      </View>

      {/* Account Section */}
      {user && (
        <View style={[styles.card, shadows.small, { backgroundColor: colors.cardBg, borderColor: colors.borderLight }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: colors.primaryMuted }]}>
              <Ionicons name="person-circle-outline" size={16} color={colors.primary} />
            </View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Account</Text>
          </View>

          <View style={[styles.aboutRow, { borderBottomColor: colors.borderLight }]}>
            <Text style={[styles.aboutLabel, { color: colors.textSecondary }]}>Signed in as</Text>
            <Text
              style={[styles.aboutValue, { color: colors.text, flexShrink: 1, marginLeft: 12 }]}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {user.email || user.id}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.button,
              {
                backgroundColor: colors.error + '15',
                borderColor: colors.error,
                borderWidth: 1,
                marginTop: 12,
              },
              isSigningOut && styles.buttonDisabled,
            ]}
            onPress={handleSignOut}
            disabled={isSigningOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            {isSigningOut ? (
              <ActivityIndicator color={colors.error} />
            ) : (
              <View style={styles.buttonContent}>
                <Ionicons
                  name="log-out-outline"
                  size={18}
                  color={colors.error}
                  style={styles.buttonIcon}
                />
                <Text style={[styles.buttonText, { color: colors.error }]}>Sign Out</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* About Section */}
      <View style={[styles.card, shadows.small, { backgroundColor: colors.cardBg, borderColor: colors.borderLight }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.cardIconWrap, { backgroundColor: colors.primaryMuted }]}>
            <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>About</Text>
        </View>

        <View style={[styles.aboutRow, { borderBottomColor: colors.borderLight }]}>
          <Text style={[styles.aboutLabel, { color: colors.textSecondary }]}>Version</Text>
          <View style={[styles.versionBadge, { backgroundColor: colors.primaryMuted }]}>
            <Text style={[styles.aboutValue, { color: colors.primary }]}>{appVersion}</Text>
          </View>
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
            <Ionicons name="open-outline" size={13} color={colors.primary} style={{ marginLeft: 4 }} />
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    letterSpacing: -0.2,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  savedText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
  },
  hint: {
    fontSize: 13,
    marginTop: 6,
    marginBottom: 14,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
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
    fontSize: 14,
    fontWeight: '600',
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  aboutLabel: {
    fontSize: 15,
  },
  aboutValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  aboutLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  versionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  themeSwitcher: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  themeOptionActive: {
  },
  themeOptionText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
