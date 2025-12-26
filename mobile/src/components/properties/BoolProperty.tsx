import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { PropertyProps } from './PropertyInput';

const BoolProperty: React.FC<PropertyProps> = ({ definition, value, onChange }) => {
  return (
    <View style={styles.container}>
      <View style={styles.switchContainer}>
        <View style={styles.switchLabel}>
          <Text style={styles.label}>{definition.data.label}</Text>
          {definition.data.description ? (
            <Text style={styles.description}>{definition.data.description}</Text>
          ) : null}
        </View>
        <Switch
          value={!!value}
          onValueChange={onChange}
          trackColor={{ false: '#767577', true: '#81b0ff' }}
          thumbColor={value ? '#007AFF' : '#f4f3f4'}
        />
      </View>
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
    color: '#333',
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  switchLabel: {
    flex: 1,
    marginRight: 12,
  },
});

export default BoolProperty;
