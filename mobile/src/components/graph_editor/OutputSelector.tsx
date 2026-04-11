/**
 * Dropdown selector for choosing which output of a node
 * feeds into the next node in the chain.
 *
 * Only shown when a node has more than one output.
 */

import React, { useState, useCallback } from "react";
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
import type { OutputSlot } from "../../types/ApiTypes";

interface OutputSelectorProps {
  outputs: OutputSlot[];
  selectedOutput: string;
  onSelect: (outputName: string) => void;
}

function formatType(type: { type: string; type_args: Array<{ type: string }> }): string {
  if (type.type_args.length > 0) {
    return `${type.type}[${type.type_args.map((a) => a.type).join(", ")}]`;
  }
  return type.type;
}

export const OutputSelector: React.FC<OutputSelectorProps> = ({
  outputs,
  selectedOutput,
  onSelect,
}) => {
  const { colors } = useTheme();
  const [pickerVisible, setPickerVisible] = useState(false);

  const selected = outputs.find((o) => o.name === selectedOutput);

  const handleSelect = useCallback(
    (name: string) => {
      onSelect(name);
      setPickerVisible(false);
    },
    [onSelect]
  );

  if (outputs.length <= 1) return null;

  return (
    <>
      <TouchableOpacity
        style={[
          styles.trigger,
          {
            backgroundColor: colors.primaryMuted,
            borderColor: colors.primary + "40",
          },
        ]}
        onPress={() => setPickerVisible(true)}
        activeOpacity={0.7}
      >
        <Ionicons
          name="git-branch-outline"
          size={14}
          color={colors.primary}
        />
        <Text style={[styles.triggerText, { color: colors.primary }]}>
          Output: {selected?.name ?? selectedOutput}
        </Text>
        <Text style={[styles.triggerType, { color: colors.primary + "99" }]}>
          {selected ? formatType(selected.type) : ""}
        </Text>
        <Ionicons
          name="chevron-down"
          size={14}
          color={colors.primary}
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
              Select Output
            </Text>
            <FlatList
              data={outputs}
              keyExtractor={(item) => item.name}
              renderItem={({ item }) => {
                const isSelected = item.name === selectedOutput;
                return (
                  <TouchableOpacity
                    style={[
                      styles.option,
                      {
                        backgroundColor: isSelected
                          ? colors.primaryMuted
                          : "transparent",
                        borderColor: isSelected
                          ? colors.primary + "40"
                          : colors.borderLight,
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
                              ? colors.primary
                              : colors.text,
                          },
                        ]}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={[
                          styles.optionType,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {formatType(item.type)}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={colors.primary}
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
  triggerType: {
    fontSize: 11,
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
    maxHeight: 400,
    borderRadius: 16,
    padding: 20,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: "700",
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
