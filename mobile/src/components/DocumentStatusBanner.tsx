import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { DocumentStatus } from '../documents/documentStore';
import { useTheme } from '../hooks/useTheme';

interface DocumentStatusBannerProps {
  status: DocumentStatus;
  error: string | null;
  /** Title-cased kind — reads as "Storyboard changed elsewhere". */
  documentLabel: string;
  /** Kind as it appears on the reload button — "Reload storyboard". */
  reloadNoun: string;
  /** Kind as it appears in the conflict sentence — "saved this sequence". */
  conflictNoun: string;
  onReload: () => void;
}

/**
 * The conflict and error banners every document editor screen shows above its
 * body. `documentStore` never reports both at once, so at most one renders.
 */
export default function DocumentStatusBanner({
  status,
  error,
  documentLabel,
  reloadNoun,
  conflictNoun,
  onReload,
}: DocumentStatusBannerProps) {
  const { colors } = useTheme();

  if (status === 'conflict') {
    return (
      <View
        style={[styles.banner, { backgroundColor: colors.warning + '22' }]}
        accessibilityLabel={`${documentLabel} changed elsewhere`}
      >
        <Ionicons name="git-compare-outline" size={16} color={colors.warning} />
        <Text style={[styles.bannerText, { color: colors.text }]}>
          {`Someone else saved this ${conflictNoun}. Reload to get their version — your unsaved edits here will be lost.`}
        </Text>
        <TouchableOpacity
          onPress={onReload}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Reload ${reloadNoun}`}
          style={[styles.bannerButton, { backgroundColor: colors.warning }]}
        >
          <Text style={styles.bannerButtonText}>Reload</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === 'error' && error !== null) {
    return (
      <View style={[styles.banner, { backgroundColor: colors.error + '18' }]}>
        <Ionicons name="warning-outline" size={16} color={colors.error} />
        <Text style={[styles.bannerText, { color: colors.error }]}>{error}</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  bannerText: { flex: 1, fontSize: 13 },
  bannerButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  bannerButtonText: { fontSize: 13, fontWeight: '600', color: '#fff' },
});
