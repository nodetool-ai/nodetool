/**
 * The three full-screen states every list and viewer needs: loading, empty,
 * and failed. One component each, so a screen that can't load looks and reads
 * the same wherever it happens, and always offers a way out.
 */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import {
  FONT_SIZE,
  FONT_WEIGHT,
  MIN_TOUCH_TARGET,
  RADIUS,
  SPACING,
} from '../utils/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

const NETWORK_ERROR = /failed to fetch|network request failed|network error|load failed|aborted|timed? ?out/i;

/**
 * Turns a transport error ("Failed to fetch", "Network request failed", a
 * timeout) into a sentence a person can act on. Server messages pass through.
 */
export function describeLoadError(message: string | null | undefined): string | null {
  if (!message) {
    return null;
  }
  return NETWORK_ERROR.test(message)
    ? "Can't reach the server. Check your connection and the server address in Settings."
    : message;
}

interface StateAction {
  label: string;
  onPress: () => void;
  icon?: IconName;
}

interface LoadingStateProps {
  label?: string;
  style?: StyleProp<ViewStyle>;
}

export function LoadingState({ label, style }: LoadingStateProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Loading'}
      testID="screen-loading"
    >
      <ActivityIndicator size="large" color={colors.primary} />
      {label ? (
        <Text style={[styles.message, { color: colors.textSecondary }]}>{label}</Text>
      ) : null}
    </View>
  );
}

interface EmptyStateProps {
  icon: IconName;
  title: string;
  message?: ReactNode;
  action?: StateAction;
  /**
   * Inside a list's `ListEmptyComponent` the state sits on the list's own
   * background, so it must not paint one or fill the screen.
   */
  inline?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ icon, title, message, action, inline, style }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        inline ? styles.inline : styles.container,
        !inline && { backgroundColor: colors.background },
        style,
      ]}
      testID="screen-empty"
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.primaryMuted }]}>
        <Ionicons name={icon} size={30} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
        {title}
      </Text>
      {message ? (
        <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
      ) : null}
      {action ? <StateButton action={action} variant="primary" /> : null}
    </View>
  );
}

interface ErrorStateProps {
  title?: string;
  message?: string | null;
  /** Raw error text, shown small and monospaced under the message. */
  details?: string | null;
  onRetry?: () => void;
  /** Screen-reader label for the retry button, naming what it reloads. */
  retryLabel?: string;
  /** A second way out, such as going back, for when retrying can't help. */
  secondaryAction?: StateAction;
  inline?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  details,
  onRetry,
  retryLabel,
  secondaryAction,
  inline,
  style,
}: ErrorStateProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        inline ? styles.inline : styles.container,
        !inline && { backgroundColor: colors.background },
        style,
      ]}
      accessibilityRole="alert"
      testID="screen-error"
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.error + '1F' }]}>
        <Ionicons name="cloud-offline-outline" size={30} color={colors.error} />
      </View>
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
        {title}
      </Text>
      {message ? (
        <Text style={[styles.message, { color: colors.textSecondary }]} numberOfLines={4}>
          {describeLoadError(message)}
        </Text>
      ) : null}
      {details ? (
        <ScrollView
          style={[styles.details, { backgroundColor: colors.surfaceElevated }]}
          contentContainerStyle={styles.detailsContent}
        >
          <Text style={[styles.detailsText, { color: colors.textSecondary }]} selectable>
            {details}
          </Text>
        </ScrollView>
      ) : null}
      <View style={styles.actions}>
        {onRetry ? (
          <StateButton
            action={{ label: 'Try again', onPress: onRetry, icon: 'refresh' }}
            accessibilityLabel={retryLabel}
            variant="primary"
          />
        ) : null}
        {secondaryAction ? <StateButton action={secondaryAction} variant="secondary" /> : null}
      </View>
    </View>
  );
}

/**
 * Offline with nothing cached to show. React Query pauses an uncached query
 * while offline instead of failing it, so without this a screen reads the
 * missing data as "not found".
 */
export function OfflineState({ onRetry, secondaryAction }: Pick<ErrorStateProps, 'onRetry' | 'secondaryAction'>) {
  return (
    <ErrorState
      title="You're offline"
      message="This hasn't been saved on your phone yet. It loads as soon as you're back online."
      onRetry={onRetry}
      secondaryAction={secondaryAction}
    />
  );
}

function StateButton({
  action,
  variant,
  accessibilityLabel,
}: {
  action: StateAction;
  variant: 'primary' | 'secondary';
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const isPrimary = variant === 'primary';
  const fg = isPrimary ? colors.textOnPrimary : colors.primary;
  return (
    <TouchableOpacity
      onPress={action.onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? action.label}
      activeOpacity={0.75}
      style={[
        styles.button,
        isPrimary
          ? { backgroundColor: colors.primary }
          : { backgroundColor: colors.primaryMuted },
      ]}
    >
      {action.icon ? <Ionicons name={action.icon} size={18} color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{action.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    padding: SPACING.xxl,
  },
  inline: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.xxl * 2,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.lg + 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: FONT_SIZE.headline,
    fontWeight: FONT_WEIGHT.semibold,
    textAlign: 'center',
  },
  message: {
    fontSize: FONT_SIZE.body,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 320,
  },
  actions: {
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: MIN_TOUCH_TARGET,
    minWidth: 160,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.md,
    marginTop: SPACING.xs,
  },
  details: {
    maxHeight: 96,
    alignSelf: 'stretch',
    borderRadius: RADIUS.sm,
  },
  detailsContent: {
    padding: SPACING.md,
  },
  detailsText: {
    fontSize: FONT_SIZE.caption,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  buttonText: {
    fontSize: FONT_SIZE.body,
    fontWeight: FONT_WEIGHT.semibold,
  },
});
