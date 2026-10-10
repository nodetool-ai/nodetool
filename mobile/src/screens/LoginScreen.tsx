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
import { BrandMark } from '../components/BrandMark';
import { FONT_SIZE, FONT_WEIGHT, MIN_TOUCH_TARGET, RADIUS, SPACING } from '../utils/tokens';

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
          paddingTop: insets.top + SPACING.xxl,
          paddingBottom: insets.bottom + SPACING.xl,
        },
      ]}
    >
      <View style={styles.header}>
        <BrandMark size={80} style={styles.logo} />
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
          NodeTool
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Run your apps, brief the agent, and follow jobs from your phone.
        </Text>
      </View>

      <View style={styles.actions}>
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
            shadows.small,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
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
        <Text style={[styles.footnote, { color: colors.textTertiary }]}>
          Signing in connects this phone to your NodeTool account.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
    justifyContent: 'space-between',
  },
  header: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: 30,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: -0.6,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZE.body,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 300,
  },
  actions: {
    gap: SPACING.md,
  },
  footnote: {
    fontSize: FONT_SIZE.caption,
    textAlign: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
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
    minHeight: MIN_TOUCH_TARGET + SPACING.sm,
    borderRadius: RADIUS.md,
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
