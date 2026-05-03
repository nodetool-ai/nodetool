import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/AuthStore';
import { useTheme } from '../hooks/useTheme';
import { isSupabaseConfigured } from '../services/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const state = useAuthStore((s) => s.state);
  const error = useAuthStore((s) => s.error);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const clearError = useAuthStore((s) => s.clearError);

  const isLoading = state === 'loading';

  const handleGoogleSignIn = async () => {
    Keyboard.dismiss();
    clearError();
    await signInWithGoogle();
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 40,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.logoWrap, { backgroundColor: colors.primaryMuted }]}>
          <Ionicons name="cube-outline" size={32} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>NodeTool</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Sign in to continue
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

        {error && (
          <View
            style={[
              styles.errorBox,
              { backgroundColor: colors.error + '15', borderColor: colors.error },
            ]}
          >
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.googleButton,
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
          {isLoading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <>
              <Ionicons
                name="logo-google"
                size={18}
                color={colors.text}
                style={styles.googleIcon}
              />
              <Text style={[styles.googleButtonText, { color: colors.text }]}>
                Continue with Google
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  googleIcon: {
    marginRight: 10,
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
