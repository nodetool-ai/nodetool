import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { PropertyProps } from './PropertyInput';
import { useTheme } from '../../hooks/useTheme';

const StringProperty: React.FC<PropertyProps> = ({ definition, value, onChange }) => {
  const { colors } = useTheme();
  
  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.text }]}>{definition.data.label}</Text>
      {definition.data.description ? (
        <Text style={[styles.description, { color: colors.textSecondary }]}>{definition.data.description}</Text>
      ) : null}
      <TextInput
        style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
        value={String(value ?? '')}
        onChangeText={onChange}
        placeholder={`Enter ${definition.data.label?.toLowerCase() || 'text'}`}
        placeholderTextColor={colors.textSecondary}
        multiline
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 48, 
    textAlignVertical: 'top' // Android alignment
  },
});

export default StringProperty;
