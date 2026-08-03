/**
 * Renders the editable properties of a chain node.
 *
 * Uses PropertyField for each property, mirroring the web's
 * ChainNodeProperties which delegates to getComponentForProperty.
 */

import React, { useCallback, useRef } from "react";
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

/** Binds one property's name into `onChange` so editing a sibling property —
 * which replaces the whole `values` object — doesn't re-render this widget. */
const PropertyRow = React.memo(function PropertyRow({
  property,
  value,
  nodeType,
  isConnected,
  onUpdate,
}: {
  property: Property;
  value: unknown;
  nodeType: string;
  isConnected: boolean;
  onUpdate: (name: string, value: unknown) => void;
}) {
  const handleChange = useCallback(
    (v: unknown) => onUpdate(property.name, v),
    [onUpdate, property.name]
  );
  return (
    <PropertyField
      property={property}
      value={value}
      nodeType={nodeType}
      isConnected={isConnected}
      onChange={handleChange}
    />
  );
});

export const ChainNodeProperties: React.FC<ChainNodePropertiesProps> = ({
  nodeType,
  properties,
  values,
  connectedInputs,
  onUpdate,
}) => {
  const { colors } = useTheme();

  // ChainEditor builds `onUpdate` inline per node, so it changes every render;
  // going through a ref keeps each row's callback stable.
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const handleChange = useCallback((name: string, value: unknown) => {
    onUpdateRef.current(name, value);
  }, []);

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
        <PropertyRow
          key={prop.name}
          property={prop}
          value={values[prop.name] ?? prop.default}
          nodeType={nodeType}
          isConnected={connectedInputs.includes(prop.name)}
          onUpdate={handleChange}
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
