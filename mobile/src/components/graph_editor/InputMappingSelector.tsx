/**
 * Selector for wiring inputs of a node to outputs of any previous node.
 *
 * Shows all input properties and lets the user pick a source
 * (any previous node + output) for each one.
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import type { Property, PropertyTypeMetadata } from "../../types/ApiTypes";
import type { ChainNode, InputMappings, InputSource } from "../../types/graphEditor";
import { areTypesCompatible } from "../../types/graphEditor";

interface InputMappingSelectorProps {
  /** The current node's properties (potential inputs). */
  properties: Property[];
  /** Current input mappings for this node. */
  inputMappings: InputMappings;
  /** Dynamic properties (for dynamic nodes like Code). */
  dynamicProperties: Record<string, unknown>;
  /** Whether this node supports dynamic inputs. */
  isDynamic: boolean;
  /** All nodes that come before this one in the chain. */
  previousNodes: ChainNode[];
  /** Called when user sets/clears a mapping. */
  onSetMapping: (inputName: string, source: InputSource | null) => void;
  /** Called when user adds a dynamic input. */
  onAddDynamicInput?: (inputName: string) => void;
  /** Called when user removes a dynamic input. */
  onRemoveDynamicInput?: (inputName: string) => void;
}

function formatType(type: PropertyTypeMetadata): string {
  if (type.type_args.length > 0) {
    return `${type.type}[${type.type_args.map((a) => a.type).join(", ")}]`;
  }
  return type.type;
}

export const InputMappingSelector: React.FC<InputMappingSelectorProps> = ({
  properties,
  inputMappings,
  dynamicProperties,
  isDynamic,
  previousNodes,
  onSetMapping,
  onAddDynamicInput,
  onRemoveDynamicInput,
}) => {
  const { colors } = useTheme();
  const [activeInput, setActiveInput] = useState<string | null>(null);
  const [newInputName, setNewInputName] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);

  const mappedCount = Object.keys(inputMappings).length;

  // Combine static properties + dynamic properties into a unified list
  const dynamicInputNames = Object.keys(dynamicProperties).filter(
    (name) => !properties.some((p) => p.name === name)
  );

  const handleOpenPicker = useCallback((inputName: string) => {
    setActiveInput(inputName);
  }, []);

  const handleSelect = useCallback(
    (source: InputSource | null) => {
      if (activeInput) {
        onSetMapping(activeInput, source);
      }
      setActiveInput(null);
    },
    [activeInput, onSetMapping]
  );

  // Build source options for the active input
  const sourceOptions = useMemo(() => {
    if (!activeInput) return [];
    const inputProp = properties.find((p) => p.name === activeInput);
    // Dynamic inputs have no static type — treat all sources as compatible
    const isDynamicInput = !inputProp && dynamicInputNames.includes(activeInput);

    if (!inputProp && !isDynamicInput) return [];

    const options: Array<{
      node: ChainNode;
      output: { name: string; type: PropertyTypeMetadata };
      compatible: boolean;
    }> = [];

    for (const node of previousNodes) {
      for (const output of node.metadata.outputs) {
        const compatible = isDynamicInput
          ? true
          : areTypesCompatible(output.type, inputProp!.type);
        options.push({ node, output, compatible });
      }
    }

    // Sort: compatible first
    options.sort((a, b) => (a.compatible === b.compatible ? 0 : a.compatible ? -1 : 1));
    return options;
  }, [activeInput, properties, previousNodes, dynamicInputNames]);

  const handleAddDynamicInput = useCallback(() => {
    const name = newInputName.trim();
    if (name && onAddDynamicInput) {
      onAddDynamicInput(name);
      setNewInputName("");
      setShowAddInput(false);
    }
  }, [newInputName, onAddDynamicInput]);

  if (properties.length === 0 && dynamicInputNames.length === 0 && !isDynamic)
    return null;

  return (
    <>
      {/* Compact summary of all wired inputs */}
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Ionicons name="git-merge-outline" size={14} color={colors.accent} />
          <Text style={[styles.headerText, { color: colors.accent }]}>
            Inputs {mappedCount > 0 ? `(${mappedCount} wired)` : ""}
          </Text>
        </View>

        {properties.map((prop) => {
          const mapping = inputMappings[prop.name];
          const sourceNode = mapping
            ? previousNodes.find((n) => n.id === mapping.sourceNodeId)
            : null;

          return (
            <TouchableOpacity
              key={prop.name}
              style={[
                styles.inputRow,
                {
                  backgroundColor: mapping
                    ? colors.accentMuted
                    : colors.inputBg,
                  borderColor: mapping
                    ? colors.accent + "40"
                    : colors.borderLight,
                },
              ]}
              onPress={() => handleOpenPicker(prop.name)}
              activeOpacity={0.7}
            >
              <View style={styles.inputInfo}>
                <Text
                  style={[
                    styles.inputName,
                    { color: mapping ? colors.accent : colors.text },
                  ]}
                >
                  {prop.title ?? prop.name}
                </Text>
                <Text style={[styles.inputType, { color: colors.textTertiary }]}>
                  {formatType(prop.type)}
                </Text>
              </View>

              {mapping && sourceNode ? (
                <View style={styles.sourceTag}>
                  <Ionicons
                    name="arrow-back"
                    size={10}
                    color={colors.accent}
                  />
                  <Text
                    style={[styles.sourceText, { color: colors.accent }]}
                    numberOfLines={1}
                  >
                    {sourceNode.metadata.title}.{mapping.sourceOutput}
                  </Text>
                  <TouchableOpacity
                    onPress={() => onSetMapping(prop.name, null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name="close-circle"
                      size={14}
                      color={colors.accent}
                    />
                  </TouchableOpacity>
                </View>
              ) : (
                <Ionicons
                  name="add-circle-outline"
                  size={18}
                  color={colors.textTertiary}
                />
              )}
            </TouchableOpacity>
          );
        })}

        {/* Dynamic inputs (not in static metadata) */}
        {dynamicInputNames.map((name) => {
          const mapping = inputMappings[name];
          const sourceNode = mapping
            ? previousNodes.find((n) => n.id === mapping.sourceNodeId)
            : null;

          return (
            <TouchableOpacity
              key={`dyn-${name}`}
              style={[
                styles.inputRow,
                {
                  backgroundColor: mapping
                    ? colors.accentMuted
                    : colors.inputBg,
                  borderColor: mapping
                    ? colors.accent + "40"
                    : colors.borderLight,
                },
              ]}
              onPress={() => handleOpenPicker(name)}
              activeOpacity={0.7}
            >
              <View style={styles.inputInfo}>
                <Text
                  style={[
                    styles.inputName,
                    { color: mapping ? colors.accent : colors.text },
                  ]}
                >
                  {name}
                  <Text style={{ color: colors.textTertiary, fontWeight: "400" }}>
                    {" "}(dynamic)
                  </Text>
                </Text>
              </View>

              {mapping && sourceNode ? (
                <View style={styles.sourceTag}>
                  <Ionicons name="arrow-back" size={10} color={colors.accent} />
                  <Text
                    style={[styles.sourceText, { color: colors.accent }]}
                    numberOfLines={1}
                  >
                    {sourceNode.metadata.title}.{mapping.sourceOutput}
                  </Text>
                  <TouchableOpacity
                    onPress={() => onSetMapping(name, null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={14} color={colors.accent} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.textTertiary} />
                  {onRemoveDynamicInput && (
                    <TouchableOpacity
                      onPress={() => onRemoveDynamicInput(name)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Add dynamic input button */}
        {isDynamic && (
          showAddInput ? (
            <View style={[styles.addInputRow, { borderColor: colors.borderLight }]}>
              <TextInput
                style={[styles.addInputField, { color: colors.text, borderColor: colors.borderLight }]}
                value={newInputName}
                onChangeText={setNewInputName}
                placeholder="Input name..."
                placeholderTextColor={colors.textTertiary}
                autoFocus
                autoCapitalize="none"
                onSubmitEditing={handleAddDynamicInput}
              />
              <TouchableOpacity onPress={handleAddDynamicInput}>
                <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowAddInput(false); setNewInputName(""); }}>
                <Ionicons name="close-circle" size={24} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.addInputButton, { borderColor: colors.borderLight }]}
              onPress={() => setShowAddInput(true)}
            >
              <Ionicons name="add" size={16} color={colors.primary} />
              <Text style={[styles.addInputText, { color: colors.primary }]}>
                Add input
              </Text>
            </TouchableOpacity>
          )
        )}
      </View>

      {/* Source picker modal */}
      <Modal
        visible={activeInput !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveInput(null)}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setActiveInput(null)}
        >
          <SafeAreaView
            style={[
              styles.pickerContainer,
              { backgroundColor: colors.surfaceElevated },
            ]}
          >
            <Text style={[styles.pickerTitle, { color: colors.text }]}>
              Source for "{activeInput}"
            </Text>
            <Text
              style={[styles.pickerSubtitle, { color: colors.textSecondary }]}
            >
              Pick which node output feeds this input
            </Text>

            {/* None option */}
            <TouchableOpacity
              style={[
                styles.option,
                {
                  backgroundColor:
                    activeInput && !inputMappings[activeInput]
                      ? colors.accentMuted
                      : "transparent",
                  borderColor: colors.borderLight,
                },
              ]}
              onPress={() => handleSelect(null)}
            >
              <Text style={[styles.optionName, { color: colors.textSecondary }]}>
                No connection
              </Text>
            </TouchableOpacity>

            <ScrollView style={styles.optionsList}>
              {sourceOptions.map(({ node, output, compatible }) => {
                const isSelected =
                  activeInput &&
                  inputMappings[activeInput]?.sourceNodeId === node.id &&
                  inputMappings[activeInput]?.sourceOutput === output.name;

                return (
                  <TouchableOpacity
                    key={`${node.id}-${output.name}`}
                    style={[
                      styles.option,
                      {
                        backgroundColor: isSelected
                          ? colors.accentMuted
                          : "transparent",
                        borderColor: isSelected
                          ? colors.accent + "40"
                          : colors.borderLight,
                        opacity: compatible ? 1 : 0.4,
                      },
                    ]}
                    onPress={() =>
                      handleSelect({
                        sourceNodeId: node.id,
                        sourceOutput: output.name,
                      })
                    }
                    activeOpacity={0.7}
                  >
                    <View style={styles.optionContent}>
                      <Text
                        style={[
                          styles.optionName,
                          {
                            color: isSelected ? colors.accent : colors.text,
                          },
                        ]}
                      >
                        {node.metadata.title}
                      </Text>
                      <Text
                        style={[
                          styles.optionType,
                          { color: colors.textSecondary },
                        ]}
                      >
                        .{output.name} → {formatType(output.type)}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={colors.accent}
                      />
                    )}
                    {!compatible && (
                      <Ionicons
                        name="warning-outline"
                        size={16}
                        color={colors.warning}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </SafeAreaView>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  headerText: {
    fontSize: 13,
    fontWeight: "600",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  inputInfo: {
    flex: 1,
    gap: 1,
  },
  inputName: {
    fontSize: 13,
    fontWeight: "600",
  },
  inputType: {
    fontSize: 11,
  },
  sourceTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
    maxWidth: "50%",
  },
  sourceText: {
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 1,
  },
  addInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  addInputField: {
    flex: 1,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  addInputButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    alignSelf: "flex-start",
  },
  addInputText: {
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
    maxHeight: 500,
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
  optionsList: {
    maxHeight: 350,
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
