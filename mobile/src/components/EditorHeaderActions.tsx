import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';

interface EditorHeaderActionsProps {
  onChat: () => void;
  chatLabel: string;
  onSave: () => void;
  saveLabel: string;
  dirty: boolean;
  saving: boolean;
}

/** The `headerRight` every document editor screen hands the navigator. */
export default function EditorHeaderActions({
  onChat,
  chatLabel,
  onSave,
  saveLabel,
  dirty,
  saving,
}: EditorHeaderActionsProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.headerActions}>
      <TouchableOpacity
        onPress={onChat}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={chatLabel}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name="chatbubble-ellipses-outline"
          size={22}
          color={colors.primary}
        />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onSave}
        activeOpacity={0.7}
        disabled={!dirty || saving}
        accessibilityRole="button"
        accessibilityLabel={saveLabel}
        accessibilityState={{ disabled: !dirty || saving }}
      >
        {saving ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text
            style={[
              styles.saveText,
              { color: dirty ? colors.primary : colors.textTertiary },
            ]}
          >
            Save
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    // Native headers inset their own items; the web header does not.
    paddingRight: Platform.OS === 'web' ? 12 : 0,
  },
  saveText: { fontSize: 16, fontWeight: '600' },
});
