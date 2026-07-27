import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useTheme } from '../hooks/useTheme';

const OFFLINE_MESSAGE = 'No internet connection. Showing saved data.';

/**
 * Thin banner shown while the device is offline.
 *
 * Renders nothing when online, so it can be mounted permanently at the root.
 * Screens keep rendering their (persisted) query data underneath — the banner
 * only explains why nothing is updating.
 */
export function OfflineBanner() {
  const { isOffline } = useNetworkStatus();
  const { colors } = useTheme();

  useEffect(() => {
    if (isOffline) {
      // Screen readers don't announce a newly mounted view on their own.
      AccessibilityInfo.announceForAccessibility(OFFLINE_MESSAGE);
    }
  }, [isOffline]);

  if (!isOffline) {
    return null;
  }

  return (
    <View
      style={[styles.banner, { backgroundColor: colors.warning }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={OFFLINE_MESSAGE}
      testID="offline-banner"
    >
      <Ionicons name="cloud-offline-outline" size={14} color={colors.background} />
      <Text style={[styles.text, { color: colors.background }]} numberOfLines={1}>
        {OFFLINE_MESSAGE}
      </Text>
    </View>
  );
}

export default OfflineBanner;

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  text: { fontSize: 13, fontWeight: '600' },
});
