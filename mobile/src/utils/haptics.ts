/**
 * Thin wrapper around `expo-haptics`.
 *
 * Two things callers get for free: haptics are a no-op on platforms that have
 * no taptic hardware (web, and anything that isn't iOS/Android), and a failing
 * or missing native module never escapes into the caller. Feedback is a garnish
 * — it must not be able to break the action it decorates, so every entry point
 * is fire-and-forget and swallows its own errors.
 *
 * Use sparingly: a buzz on every tap is worse than no buzz at all. Reach for it
 * when something finished, failed, or snapped into place.
 */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export type HapticImpactStyle = 'light' | 'medium' | 'heavy';
export type HapticNotificationType = 'success' | 'warning' | 'error';

/** Taptic hardware only exists on the two native platforms. */
export function hapticsSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

const IMPACT_STYLES = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
} satisfies Record<HapticImpactStyle, Haptics.ImpactFeedbackStyle>;

const NOTIFICATION_TYPES = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
} satisfies Record<
  HapticNotificationType,
  Haptics.NotificationFeedbackType
>;

function fire(run: () => Promise<void>): void {
  if (!hapticsSupported()) {return;}
  try {
    run().catch(() => undefined);
  } catch {
    // Native module unavailable or throwing synchronously: haptics are
    // decorative, so there is nothing to report and nothing to retry.
  }
}

/** A physical tap — a control moved, snapped, or reset. */
export function hapticImpact(style: HapticImpactStyle = 'light'): void {
  fire(() => Haptics.impactAsync(IMPACT_STYLES[style]));
}

/** An outcome — an operation succeeded, warned, or failed. */
export function hapticNotification(type: HapticNotificationType): void {
  fire(() => Haptics.notificationAsync(NOTIFICATION_TYPES[type]));
}
