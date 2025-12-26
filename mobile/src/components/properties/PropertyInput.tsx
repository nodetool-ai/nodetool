import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MiniAppInputDefinition } from '../../hooks/useMiniAppInputs';
import StringProperty from './StringProperty';
import IntegerProperty from './IntegerProperty';
import FloatProperty from './FloatProperty';
import BoolProperty from './BoolProperty';
import ImageProperty from './ImageProperty';
import AudioProperty from './AudioProperty';

export type PropertyProps = {
  definition: MiniAppInputDefinition;
  value: any;
  onChange: (value: any) => void;
};

export const PropertyRenderer: React.FC<PropertyProps> = (props) => {
  const { definition } = props;
  const { kind, nodeType } = definition;

  // Render based on kind or specific node type
  switch (kind) {
    case 'boolean':
      return <BoolProperty {...props} />;
    case 'integer':
      return <IntegerProperty {...props} />;
    case 'float':
      return <FloatProperty {...props} />;
    case 'string':
      // Check for specific string subtypes if needed (e.g. file paths, specialized inputs)
      // For now we map based on what we know or just default to StringProperty
      if (nodeType.includes('Image')) return <ImageProperty {...props} />;
      if (nodeType.includes('Audio')) return <AudioProperty {...props} />;
      return <StringProperty {...props} />;
    default:
      return (
        <View style={styles.container}>
          <Text style={styles.label}>{definition.data.label}</Text>
          <Text style={styles.unsupported}>Unsupported input type: {kind}</Text>
        </View>
      );
  }
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
  unsupported: {
    color: '#999',
    fontStyle: 'italic',
  },
});
