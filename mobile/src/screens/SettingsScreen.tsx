import { useState, useEffect, useRef } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '../services/api';
import { webSocketService } from '../services/WebSocketService';
import {
  diagnoseServer,
  type ServerDiagnosticStatus,
} from '../services/serverDiagnostics';
import { queryClient } from '../queryClient';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../stores/AuthStore';
import { FONT_SIZE, FONT_WEIGHT, MIN_TOUCH_TARGET, RADIUS, SPACING } from '../utils/tokens';

const SAVED_INDICATOR_MS = 2000;
const STATUS_RESET_MS = 3000;

type ConnectionStatus = 'idle' | 'testing' | ServerDiagnosticStatus;

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Point the app at a new server. Cached queries and the realtime socket belong
 * to the old host, so both are dropped; the socket reconnects to the new host
 * on its next use.
 */
async function switchApiHost(host: string): Promise<void> {
  const previous = apiService.getApiHost();
  await apiService.saveApiHost(host);
  if (host !== previous) {
    webSocketService.disconnect();
  }
  queryClient.clear();
}

function connectionStatusMessage(status: ServerDiagnosticStatus): string {
  switch (status) {
    case 'timeout':
      return 'The server did not respond in time. Check that it is running and reachable from this device.';
    case 'network-error':
      return 'The server could not be reached. Check the URL, network, and device-to-server connection.';
    case 'unauthorized':
      return 'The server is reachable, but it rejected the current session. Sign in or use a valid server account.';
    case 'incompatible':
      return 'The host responded, but it is not a compatible NodeTool server.';
    case 'ready':
      return 'The server is ready.';
  }
}

export default function SettingsScreen() {
  const [apiHost, setApiHost] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [savedIndicator, setSavedIndicator] = useState(false);
  const { colors, shadows, mode, setTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const user = useAuthStore((s) => s.user);
  const authState = useAuthStore((s) => s.state);
  const signOut = useAuthStore((s) => s.signOut);
  const isSigningOut = authState === 'loading';

  const handleSignOut = () => {
    Alert.alert(
      'Sign out?',
      'You will need to sign in again to use this server.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
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

  // Pending indicator resets must not fire into an unmounted screen.
  useEffect(
    () => () => {
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
      }
    },
    []
  );

  const resetStatusLater = () => {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
    }
    statusTimerRef.current = setTimeout(() => setConnectionStatus('idle'), STATUS_RESET_MS);
  };

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const host = await apiService.loadApiHost();
      setApiHost(host);
    } catch (error) {
      console.error('Failed to load settings:', error);
      Alert.alert('Error', 'Could not load settings.');
    } finally {
      setIsLoading(false);
    }
  };

  const showSavedIndicator = () => {
    setSavedIndicator(true);
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
    }
    savedTimerRef.current = setTimeout(() => setSavedIndicator(false), SAVED_INDICATOR_MS);
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    const trimmed = apiHost.trim();

    if (!trimmed) {
      Alert.alert('Error', 'Enter the address of your NodeTool server.');
      return;
    }

    if (!isValidUrl(trimmed)) {
      Alert.alert('Invalid address', 'Enter an address that starts with http:// or https://.');
      return;
    }

    try {
      setIsSaving(true);
      await switchApiHost(trimmed);
      setApiHost(trimmed);
      showSavedIndicator();
    } catch (error) {
      console.error('Failed to save settings:', error);
      Alert.alert('Error', 'Could not save the server address.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    Keyboard.dismiss();
    const trimmed = apiHost.trim();

    if (!trimmed) {
      Alert.alert('Error', 'Enter the address of your NodeTool server.');
      return;
    }

    if (!isValidUrl(trimmed)) {
      Alert.alert('Invalid address', 'Enter an address that starts with http:// or https://.');
      return;
    }

    try {
      setConnectionStatus('testing');
      const result = await diagnoseServer(trimmed);

      if (result.status === 'ready') {
        try {
          await switchApiHost(trimmed);
          setApiHost(trimmed);
        } catch (error: unknown) {
          console.error('Failed to save the tested server:', error);
          Alert.alert('Server ready', 'The server is ready, but its URL could not be saved.');
        }
      }

      setConnectionStatus(result.status);
      if (result.status !== 'ready') {
        Alert.alert('Connection failed', connectionStatusMessage(result.status));
      }
      resetStatusLater();
    } catch (error: unknown) {
      console.error('Connection test failed:', error);
      setConnectionStatus('network-error');
      Alert.alert('Connection failed', 'The server check could not be completed.');
      resetStatusLater();
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
      case 'testing':
        return { backgroundColor: colors.inputBg, borderColor: colors.borderLight };
      case 'ready':
        return { backgroundColor: colors.success + '15', borderColor: colors.success };
      case 'unauthorized':
      case 'timeout':
        return { backgroundColor: colors.warning + '15', borderColor: colors.warning };
      case 'network-error':
      case 'incompatible':
        return { backgroundColor: colors.error + '15', borderColor: colors.error };
      default:
        return { backgroundColor: colors.primary, borderColor: colors.primary };
    }
  };

  const getTestButtonContent = () => {
    switch (connectionStatus) {
      case 'testing':
        return <ActivityIndicator color={colors.textSecondary} />;
      case 'ready':
        return (
          <View style={styles.buttonContent}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} style={styles.buttonIcon} />
            <Text style={[styles.buttonText, { color: colors.success }]}>Connected and saved</Text>
          </View>
        );
      case 'unauthorized':
        return (
          <View style={styles.buttonContent}>
            <Ionicons name="lock-closed" size={18} color={colors.warning} style={styles.buttonIcon} />
            <Text style={[styles.buttonText, { color: colors.warning }]}>Sign-in required</Text>
          </View>
        );
      case 'timeout':
        return (
          <View style={styles.buttonContent}>
            <Ionicons name="time-outline" size={18} color={colors.warning} style={styles.buttonIcon} />
            <Text style={[styles.buttonText, { color: colors.warning }]}>Timed out</Text>
          </View>
        );
      case 'incompatible':
        return (
          <View style={styles.buttonContent}>
            <Ionicons name="server-outline" size={18} color={colors.error} style={styles.buttonIcon} />
            <Text style={[styles.buttonText, { color: colors.error }]}>Not a NodeTool server</Text>
          </View>
        );
      case 'network-error':
        return (
          <View style={styles.buttonContent}>
            <Ionicons name="close-circle" size={18} color={colors.error} style={styles.buttonIcon} />
            <Text style={[styles.buttonText, { color: colors.error }]}>Can't reach server</Text>
          </View>
        );
      default:
        return (
          <View style={styles.buttonContent}>
            <Ionicons name="pulse-outline" size={18} color={colors.textOnPrimary} style={styles.buttonIcon} />
            <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>Test and save</Text>
          </View>
        );
    }
  };

  const themeOptions = [
    { value: 'light', label: 'Light', icon: 'sunny-outline' },
    { value: 'dark', label: 'Dark', icon: 'moon-outline' },
    { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  ] as const;

  const cardStyle = [styles.card, { backgroundColor: colors.cardBg, borderColor: colors.borderLight }];
  const sectionLabelStyle = [styles.sectionLabel, { color: colors.textSecondary }];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + SPACING.xxl }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={sectionLabelStyle} accessibilityRole="header">Appearance</Text>
      <View style={cardStyle}>
        <View style={[styles.themeSwitcher, { backgroundColor: colors.background }]}>
          {themeOptions.map((option) => {
            const selected = mode === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.themeOption,
                  selected && [shadows.small, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }],
                ]}
                onPress={() => setTheme(option.value)}
                accessibilityRole="button"
                accessibilityLabel={`${option.value} theme`}
                accessibilityState={{ selected }}
              >
                <Ionicons
                  name={option.icon}
                  size={15}
                  color={selected ? colors.text : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.themeOptionText,
                    { color: selected ? colors.text : colors.textSecondary },
                    selected && styles.themeOptionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.sectionLabelRow}>
        <Text style={sectionLabelStyle} accessibilityRole="header">Server</Text>
        {savedIndicator && (
          <View style={styles.savedBadge}>
            <Ionicons name="checkmark-circle" size={13} color={colors.success} />
            <Text style={[styles.savedText, { color: colors.success }]}>Saved</Text>
          </View>
        )}
      </View>
      <View style={cardStyle}>
        <Text style={[styles.inputLabel, { color: colors.text }]}>Server address</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
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
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          The NodeTool server this phone talks to, for example http://your-ip:7777.
        </Text>

        <TouchableOpacity
          style={[styles.button, getTestButtonStyle(), connectionStatus === 'testing' && styles.buttonDisabled]}
          onPress={handleTestConnection}
          disabled={connectionStatus === 'testing' || isSaving}
          accessibilityRole="button"
          accessibilityLabel="Test connection and save"
        >
          {getTestButtonContent()}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.textButton, isSaving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={connectionStatus === 'testing' || isSaving}
          accessibilityRole="button"
          accessibilityLabel="Save settings"
        >
          {isSaving ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={[styles.textButtonText, { color: colors.primary }]}>Save without testing</Text>
          )}
        </TouchableOpacity>
      </View>

      {user && (
        <>
          <Text style={sectionLabelStyle} accessibilityRole="header">Account</Text>
          <View style={[cardStyle, styles.listCard]}>
            <View style={[styles.listRow, { borderBottomColor: colors.borderLight }]}>
              <Text style={[styles.listLabel, { color: colors.text }]}>Signed in as</Text>
              <Text
                style={[styles.listValue, styles.listValueShrink, { color: colors.textSecondary }]}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {user.email || user.id}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.listRow, styles.listRowLast, isSigningOut && styles.buttonDisabled]}
              onPress={handleSignOut}
              disabled={isSigningOut}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              {isSigningOut ? (
                <ActivityIndicator color={colors.error} />
              ) : (
                <Text style={[styles.listLabel, { color: colors.error }]}>Sign out</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}

      <Text style={sectionLabelStyle} accessibilityRole="header">About</Text>
      <View style={[cardStyle, styles.listCard]}>
        <View style={[styles.listRow, { borderBottomColor: colors.borderLight }]}>
          <Text style={[styles.listLabel, { color: colors.text }]}>Version</Text>
          <Text style={[styles.listValue, { color: colors.textSecondary }]}>{appVersion}</Text>
        </View>
        <TouchableOpacity
          style={[styles.listRow, styles.listRowLast]}
          onPress={() => Linking.openURL('https://github.com/nodetool-ai/nodetool')}
          accessibilityRole="link"
          accessibilityLabel="Open NodeTool on GitHub"
        >
          <Text style={[styles.listLabel, { color: colors.text }]}>Source code</Text>
          <View style={styles.listLink}>
            <Text style={[styles.listValue, { color: colors.textSecondary }]}>GitHub</Text>
            <Ionicons name="open-outline" size={14} color={colors.textTertiary} />
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
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xs,
  },
  // Grouped-list layout: a small caps label above each card, as in the
  // platform settings apps.
  sectionLabel: {
    fontSize: FONT_SIZE.caption,
    fontWeight: FONT_WEIGHT.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  card: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  listCard: {
    paddingVertical: 0,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
    marginRight: SPACING.xs,
  },
  savedText: {
    fontSize: FONT_SIZE.caption,
    fontWeight: FONT_WEIGHT.semibold,
  },
  inputLabel: {
    fontSize: FONT_SIZE.footnote,
    fontWeight: FONT_WEIGHT.semibold,
    marginBottom: SPACING.sm,
  },
  input: {
    minHeight: MIN_TOUCH_TARGET + SPACING.xs,
    paddingHorizontal: SPACING.md + 2,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: FONT_SIZE.body,
  },
  hint: {
    fontSize: FONT_SIZE.footnote,
    lineHeight: 18,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  button: {
    minHeight: MIN_TOUCH_TARGET + SPACING.xs,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonIcon: {
    marginRight: SPACING.sm,
  },
  buttonText: {
    fontSize: FONT_SIZE.body,
    fontWeight: FONT_WEIGHT.semibold,
  },
  textButton: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xs,
    marginBottom: -SPACING.sm,
  },
  textButtonText: {
    fontSize: FONT_SIZE.body,
    fontWeight: FONT_WEIGHT.medium,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET + SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Rows carry a hairline separator; the last row in a card must not, or the
  // divider sits on the card's bottom edge.
  listRowLast: {
    borderBottomWidth: 0,
  },
  listLabel: {
    fontSize: FONT_SIZE.body,
  },
  listValue: {
    fontSize: FONT_SIZE.body,
  },
  listValueShrink: {
    flexShrink: 1,
    marginLeft: SPACING.md,
  },
  listLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  themeSwitcher: {
    flexDirection: 'row',
    borderRadius: RADIUS.md,
    padding: 3,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.xs + 2,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm + 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  themeOptionText: {
    fontSize: FONT_SIZE.footnote,
    fontWeight: FONT_WEIGHT.medium,
  },
  themeOptionTextSelected: {
    fontWeight: FONT_WEIGHT.semibold,
  },
});
