import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';

interface LoadErrorBannerProps {
  error: string | null;
}

/** Renders nothing without an error, so list screens can mount it unconditionally. */
export function LoadErrorBanner({ error }: LoadErrorBannerProps) {
  const { colors } = useTheme();

  if (!error) {
    return null;
  }

  return (
    <View style={[styles.banner, { backgroundColor: colors.error + '18' }]}>
      <Ionicons
        name="warning-outline"
        size={14}
        color={colors.error}
        style={styles.icon}
      />
      <Text style={[styles.bannerText, { color: colors.error }]}>{error}</Text>
    </View>
  );
}

export default LoadErrorBanner;

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { marginRight: 6 },
  // The row is centred, so without `flexShrink` a long message overflows it and
  // is clipped at both ends. Shrinking lets it wrap instead.
  bannerText: { fontSize: 13, fontWeight: '500', flexShrink: 1 },
});
