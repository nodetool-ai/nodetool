/**
 * Selector for choosing which input property of a node
 * receives data from the previous node's output.
 *
 * Shows compatible inputs based on type matching.
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import type { Property, PropertyTypeMetadata } from "../../types/ApiTypes";
import { areTypesCompatible } from "../../types/graphEditor";

interface InputMappingSelectorProps {
  properties: Property[];
  selectedInput: string | null;
  /** The output type from the previous node (for compatibility filtering). */
  sourceOutputType: PropertyTypeMetadata | null;
  onSelect: (inputName: string) => void;
}

function formatType(type: PropertyTypeMetadata): string {
  if (type.type_args.length > 0) {
    return `${type.type}[${type.type_args.map((a) => a.type).join(", ")}]`;
  }
  return type.type;
}

export const InputMappingSelector: React.FC<InputMappingSelectorProps> = ({
  properties,
  selectedInput,
  sourceOutputType,
  onSelect,
}) => {
  const { colors } = useTheme();
  const [pickerVisible, setPickerVisible] = useState(false);

  const compatibleProps = useMemo(() => {
    if (!sourceOutputType) return properties;
    return properties.filter((p) =>
      areTypesCompatible(sourceOutputType, p.type)
    );
  }, [properties, sourceOutputType]);

  const allProps = useMemo(() => {
    if (!sourceOutputType) return properties;
    // Show compatible first, then incompatible (dimmed)
    const compatible = new Set(compatibleProps.map((p) => p.name));
    return [
      ...compatibleProps,
      ...properties.filter((p) => !compatible.has(p.name)),
    ];
  }, [properties, compatibleProps, sourceOutputType]);

  const selected = properties.find((p) => p.name === selectedInput);

  const handleSelect = useCallback(
    (name: string) => {
      onSelect(name);
      setPickerVisible(false);
    },
    [onSelect]
  );

  if (!selectedInput && compatibleProps.length === 0) return null;

  return (
    <>
      <TouchableOpacity
        style={[
          styles.trigger,
          {
            backgroundColor: colors.accentMuted,
            borderColor: colors.accent + "40",
          },
        ]}
        onPress={() => setPickerVisible(true)}
        activeOpacity={0.7}
      >
        <Ionicons
          name="enter-outline"
          size={14}
          color={colors.accent}
        />
        <Text style={[styles.triggerText, { color: colors.accent }]}>
          Input: {selected?.title ?? selected?.name ?? selectedInput ?? "none"}
        </Text>
        <Ionicons
          name="chevron-down"
          size={14}
          color={colors.accent}
        />
      </TouchableOpacity>

      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setPickerVisible(false)}
        >
          <SafeAreaView
            style={[
              styles.pickerContainer,
              { backgroundColor: colors.surfaceElevated },
            ]}
          >
            <Text style={[styles.pickerTitle, { color: colors.text }]}>
              Receives Data On
            </Text>
            {sourceOutputType && (
              <Text style={[styles.pickerSubtitle, { color: colors.textSecondary }]}>
                From output type: {formatType(sourceOutputType)}
              </Text>
            )}
            <FlatList
              data={allProps}
              keyExtractor={(item) => item.name}
              renderItem={({ item }) => {
                const isSelected = item.name === selectedInput;
                const isCompatible =
                  !sourceOutputType ||
                  areTypesCompatible(sourceOutputType, item.type);
                return (
                  <TouchableOpacity
                    style={[
                      styles.option,
                      {
                        backgroundColor: isSelected
                          ? colors.accentMuted
                          : "transparent",
                        borderColor: isSelected
                          ? colors.accent + "40"
                          : colors.borderLight,
                        opacity: isCompatible ? 1 : 0.4,
                      },
                    ]}
                    onPress={() => handleSelect(item.name)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.optionContent}>
                      <Text
                        style={[
                          styles.optionName,
                          {
                            color: isSelected
                              ? colors.accent
                              : colors.text,
                          },
                        ]}
                      >
                        {item.title ?? item.name}
                      </Text>
                      <Text
                        style={[
                          styles.optionType,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {formatType(item.type)}
                        {item.description ? ` \u2014 ${item.description}` : ""}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={colors.accent}
                      />
                    )}
                    {!isCompatible && (
                      <Ionicons
                        name="warning-outline"
                        size={16}
                        color={colors.warning}
                      />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </SafeAreaView>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  triggerText: {
    fontSize: 13,
    fontWeight: "600",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  pickerContainer: {
    width: "100%",
    maxHeight: 450,
    borderRadius: 16,
    padding: 20,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 4,
  },
  pickerSubtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  optionContent: {
    flex: 1,
    gap: 2,
  },
  optionName: {
    fontSize: 15,
    fontWeight: "600",
  },
  optionType: {
    fontSize: 12,
  },
});
