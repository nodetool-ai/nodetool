/**
 * Button placed between chain nodes (and at the end) to
 * insert a new node at a specific position.
 */

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";

interface AddNodeButtonProps {
  onPress: () => void;
  /** Whether this is the primary "get started" button (larger variant). */
  isHero?: boolean;
}

export const AddNodeButton: React.FC<AddNodeButtonProps> = ({
  onPress,
  isHero = false,
}) => {
  const { colors, shadows } = useTheme();

  if (isHero) {
    return (
      <TouchableOpacity
        style={[
          styles.heroButton,
          {
            backgroundColor: colors.primary,
          },
          shadows.medium,
        ]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={colors.textOnPrimary} />
        <Text style={[styles.heroText, { color: colors.textOnPrimary }]}>
          Add First Node
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View
        style={[styles.lineSegment, { backgroundColor: colors.border }]}
      />
      <TouchableOpacity
        style={[
          styles.button,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
        onPress={onPress}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
      >
        <Ionicons name="add" size={18} color={colors.primary} />
      </TouchableOpacity>
      <View
        style={[styles.lineSegment, { backgroundColor: colors.border }]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: 2,
  },
  lineSegment: {
    width: 2,
    height: 8,
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  heroButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 16,
    alignSelf: "center",
    marginTop: 24,
  },
  heroText: {
    fontSize: 17,
    fontWeight: "700",
  },
});
