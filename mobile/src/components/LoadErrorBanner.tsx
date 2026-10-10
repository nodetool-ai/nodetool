import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { describeLoadError } from './ScreenState';
import { FONT_SIZE, FONT_WEIGHT, HIT_SLOP, RADIUS, SPACING } from '../utils/tokens';

interface LoadErrorBannerProps {
  error: string | null;
  /** Shows a retry button. Pull-to-refresh is easy to miss as the only way. */
  onRetry?: () => void;
  /** Screen-reader label for the retry button. */
  retryLabel?: string;
}

/**
 * A refresh failed while older data is still on screen. Renders nothing
 * without an error, so list screens can mount it unconditionally. When there
 * is no data to show at all, use `ErrorState` instead.
 */
export function LoadErrorBanner({ error, onRetry, retryLabel = 'Retry' }: LoadErrorBannerProps) {
  const { colors } = useTheme();

  if (!error) {
    return null;
  }

  return (
    <View
      style={[styles.banner, { backgroundColor: colors.error + '18', borderColor: colors.error + '40' }]}
      accessibilityRole="alert"
    >
      <Ionicons name="warning-outline" size={16} color={colors.error} />
      <Text style={[styles.bannerText, { color: colors.error }]} numberOfLines={3}>
        {describeLoadError(error)}
      </Text>
      {onRetry ? (
        <TouchableOpacity
          onPress={onRetry}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
          style={styles.retry}
        >
          <Text style={[styles.retryText, { color: colors.error }]}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default LoadErrorBanner;

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // Without `flexShrink` a long message pushes the retry button off the row.
  bannerText: {
    fontSize: FONT_SIZE.footnote,
    fontWeight: FONT_WEIGHT.medium,
    flexShrink: 1,
    flexGrow: 1,
  },
  retry: {
    paddingHorizontal: SPACING.xs,
  },
  retryText: {
    fontSize: FONT_SIZE.footnote,
    fontWeight: FONT_WEIGHT.semibold,
  },
});
