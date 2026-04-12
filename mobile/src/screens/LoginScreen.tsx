import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/AuthStore';
import { useTheme } from '../hooks/useTheme';
import { isSupabaseConfigured } from '../services/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Mode = 'signin' | 'signup';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function LoginScreen() {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const state = useAuthStore((s) => s.state);
  const error = useAuthStore((s) => s.error);
  const signInWithPassword = useAuthStore((s) => s.signInWithPassword);
  const signUpWithPassword = useAuthStore((s) => s.signUpWithPassword);
  const signInWithOAuth = useAuthStore((s) => s.signInWithOAuth);
  const clearError = useAuthStore((s) => s.clearError);

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const isLoading = state === 'loading';

  const handleSubmit = async () => {
    Keyboard.dismiss();
    setLocalError(null);
    clearError();

    const trimmedEmail = email.trim();
    if (!isValidEmail(trimmedEmail)) {
      setLocalError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }

    if (mode === 'signin') {
      await signInWithPassword(trimmedEmail, password);
    } else {
      await signUpWithPassword(trimmedEmail, password);
    }
  };

  const toggleMode = () => {
    setMode((prev) => (prev === 'signin' ? 'signup' : 'signin'));
    setLocalError(null);
    clearError();
  };

  const handleGoogleSignIn = async () => {
    Keyboard.dismiss();
    setLocalError(null);
    clearError();
    await signInWithOAuth('google');
  };

  const displayError = localError || error;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={[styles.logoWrap, { backgroundColor: colors.primaryMuted }]}>
            <Ionicons name="cube-outline" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>NodeTool</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {mode === 'signin' ? 'Sign in to continue' : 'Create your account'}
          </Text>
        </View>

        <View
          style={[
            styles.card,
            shadows.small,
            { backgroundColor: colors.cardBg, borderColor: colors.borderLight },
          ]}
        >
          {!isSupabaseConfigured && (
            <View
              style={[
                styles.banner,
                { backgroundColor: colors.warning + '15', borderColor: colors.warning },
              ]}
            >
              <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
              <Text style={[styles.bannerText, { color: colors.warning }]}>
                Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and
                EXPO_PUBLIC_SUPABASE_ANON_KEY to enable login.
              </Text>
            </View>
          )}

          <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Email</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBg,
                color: colors.text,
                borderColor: colors.borderLight,
              },
            ]}
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (localError) setLocalError(null);
              if (error) clearError();
            }}
            placeholder="you@example.com"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType="next"
            textContentType="emailAddress"
            accessibilityLabel="Email"
            editable={!isLoading}
          />

          <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 14 }]}>
            Password
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBg,
                color: colors.text,
                borderColor: colors.borderLight,
              },
            ]}
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (localError) setLocalError(null);
              if (error) clearError();
            }}
            placeholder="••••••••"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            returnKeyType="done"
            textContentType={mode === 'signin' ? 'password' : 'newPassword'}
            onSubmitEditing={handleSubmit}
            accessibilityLabel="Password"
            editable={!isLoading}
          />

          {displayError && (
            <View
              style={[
                styles.errorBox,
                { backgroundColor: colors.error + '15', borderColor: colors.error },
              ]}
            >
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>{displayError}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: colors.primary },
              isLoading && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel={mode === 'signin' ? 'Sign in' : 'Sign up'}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.borderLight }]} />
            <Text style={[styles.dividerText, { color: colors.textTertiary }]}>OR</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.borderLight }]} />
          </View>

          <TouchableOpacity
            style={[
              styles.oauthButton,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.borderLight,
              },
              isLoading && styles.buttonDisabled,
            ]}
            onPress={handleGoogleSignIn}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
          >
            <Ionicons
              name="logo-google"
              size={18}
              color={colors.text}
              style={styles.oauthIcon}
            />
            <Text style={[styles.oauthButtonText, { color: colors.text }]}>
              Continue with Google
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchModeButton}
            onPress={toggleMode}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel={
              mode === 'signin' ? 'Switch to sign up' : 'Switch to sign in'
            }
          >
            <Text style={[styles.switchModeText, { color: colors.textSecondary }]}>
              {mode === 'signin'
                ? "Don't have an account?"
                : 'Already have an account?'}{' '}
              <Text style={[styles.switchModeLink, { color: colors.primary }]}>
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
  },
  bannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
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
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 14,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  primaryButton: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 18,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 12,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  oauthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  oauthIcon: {
    marginRight: 10,
  },
  oauthButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  switchModeButton: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchModeText: {
    fontSize: 14,
  },
  switchModeLink: {
    fontWeight: '600',
  },
});
