import React from 'react';
import { View, Text, Image, StyleSheet, ScrollView } from 'react-native';
import { Asset } from '../../types/workflow';
import MarkdownRenderer from '../../utils/MarkdownRenderer';

type OutputRendererProps = {
  value: any;
};

// Simple helper to detect type - can be expanded based on ApiTypes from web
const getType = (value: any): string => {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') {
     if (value.type === 'image') return 'image';
     if (value.type === 'audio') return 'audio';
     return 'object';
  }
  return 'unknown';
};

export const OutputRenderer: React.FC<OutputRendererProps> = ({ value }) => {
  const type = getType(value);

  if (value === null || value === undefined) {
    return null;
  }

  switch (type) {
    case 'string':
      return <MarkdownRenderer content={value} />;
    case 'number':
      return <Text style={styles.text}>{String(value)}</Text>;
    case 'boolean':
      return <Text style={styles.text}>{value ? 'True' : 'False'}</Text>;
    case 'image':
      // Match web OutputRenderer logic: prefer uri over data
      // Handle multiple images (value.data is array) or single image
      if (Array.isArray(value?.data)) {
        return (
          <View style={styles.container}>
            {value.data.map((v: any, i: number) => (
              <View key={i} style={styles.arrayItem}>
                <OutputRenderer value={v} />
              </View>
            ))}
          </View>
        );
      }

      const source = value?.uri || value?.data;
      if (!source) return <Text style={styles.error}>Invalid Image Data</Text>;

      // Handle string source
      if (typeof source === 'string') {
        return (
          <Image
            source={{ uri: source.startsWith('http') || source.startsWith('data:') ? source : `data:image/png;base64,${source}` }}
            style={styles.image}
            resizeMode="contain"
          />
        );
      }

      // Handle binary data (Uint8Array, ArrayBuffer)
      if (source instanceof Uint8Array || source instanceof ArrayBuffer) {
        const bytes = source instanceof ArrayBuffer ? new Uint8Array(source) : source;
        let binary = '';
        bytes.forEach((byte) => binary += String.fromCharCode(byte));
        const base64 = btoa(binary);
        return (
          <Image
            source={{ uri: `data:image/png;base64,${base64}` }}
            style={styles.image}
            resizeMode="contain"
          />
        );
      }

      // Handle other source types
      return <Text style={styles.placeholder}>[Unsupported image format: {typeof source}]</Text>;
    case 'audio':
       return <Text style={styles.placeholder}>[Audio Output: {value?.uri || 'Data'}]</Text>;
    case 'array':
       return (
         <View style={styles.container}>
           {value.map((item: any, index: number) => (
             <View key={index} style={styles.arrayItem}>
                <OutputRenderer value={item} />
             </View>
           ))}
         </View>
       );
    case 'object':
      return (
        <ScrollView style={styles.codeBlock}>
          <Text style={styles.code}>{JSON.stringify(value, null, 2)}</Text>
        </ScrollView>
      );
    default:
      return <Text style={styles.text}>{String(value)}</Text>;
  }
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  text: {
    fontSize: 16,
    color: '#000',
    marginBottom: 8,
  },
  error: {
    color: 'red',
    fontSize: 14,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#f0f0f0',
  },
  placeholder: {
    fontStyle: 'italic',
    color: '#666',
    marginBottom: 8,
  },
  arrayItem: {
    marginBottom: 8,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#ddd',
  },
  codeBlock: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    maxHeight: 200,
  },
  code: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
});
