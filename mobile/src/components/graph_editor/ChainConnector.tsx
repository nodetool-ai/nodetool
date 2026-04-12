/**
 * Visual connector drawn between two chain nodes.
 *
 * Renders a vertical line with a dot, plus the output/input
 * type labels on each end.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";

interface ChainConnectorProps {
  sourceOutput: string;
  targetInput: string | null;
  /** Whether the connection has a type mismatch. */
  hasWarning?: boolean;
}

export const ChainConnector: React.FC<ChainConnectorProps> = ({
  sourceOutput,
  targetInput,
  hasWarning = false,
}) => {
  const { colors } = useTheme();

  const lineColor = hasWarning ? colors.warning : colors.primary;

  return (
    <View style={styles.container}>
      {/* Connection line */}
      <View style={styles.lineContainer}>
        <View style={[styles.line, { backgroundColor: lineColor + "50" }]} />
        <View style={[styles.dot, { backgroundColor: lineColor }]} />
        <View style={[styles.line, { backgroundColor: lineColor + "50" }]} />
      </View>

      {/* Labels */}
      <View style={styles.labels}>
        <View style={styles.labelRow}>
          <Ionicons
            name="arrow-down"
            size={12}
            color={colors.textTertiary}
          />
          <Text style={[styles.labelText, { color: colors.textTertiary }]}>
            {sourceOutput}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={10}
            color={colors.textTertiary}
          />
          <Text style={[styles.labelText, { color: colors.textTertiary }]}>
            {targetInput ?? "auto"}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: 2,
  },
  lineContainer: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
  },
  line: {
    width: 2,
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  labels: {
    alignItems: "center",
    marginTop: -2,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  labelText: {
    fontSize: 11,
    fontWeight: "500",
  },
});
