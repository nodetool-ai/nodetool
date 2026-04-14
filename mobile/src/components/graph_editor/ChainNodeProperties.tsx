/**
 * Renders the editable properties of a chain node.
 *
 * Uses PropertyField for each property, mirroring the web's
 * ChainNodeProperties which delegates to getComponentForProperty.
 */

import React, { useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import type { Property } from "../../types/ApiTypes";
import { PropertyField } from "./PropertyField";

interface ChainNodePropertiesProps {
  nodeType: string;
  properties: Property[];
  values: Record<string, unknown>;
  /** Inputs that are wired from other nodes (shown as "connected"). */
  connectedInputs: string[];
  onUpdate: (name: string, value: unknown) => void;
}

export const ChainNodeProperties: React.FC<ChainNodePropertiesProps> = ({
  nodeType,
  properties,
  values,
  connectedInputs,
  onUpdate,
}) => {
  const { colors } = useTheme();

  const handleChange = useCallback(
    (name: string, value: unknown) => {
      onUpdate(name, value);
    },
    [onUpdate]
  );

  if (properties.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
          No configurable properties
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {properties.map((prop) => (
        <PropertyField
          key={prop.name}
          property={prop}
          value={values[prop.name] ?? prop.default}
          nodeType={nodeType}
          isConnected={connectedInputs.includes(prop.name)}
          onChange={(v) => handleChange(prop.name, v)}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  emptyContainer: {
    paddingVertical: 12,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    fontStyle: "italic",
  },
});
