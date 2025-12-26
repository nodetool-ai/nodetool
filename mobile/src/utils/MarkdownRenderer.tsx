import React from 'react';
import { StyleSheet, View } from 'react-native';
import Markdown, { MarkdownProps } from 'react-native-markdown-display';

interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <View style={styles.container}>
      <Markdown style={markdownStyles}>
        {content}
      </Markdown>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 8,
  },
});

const markdownStyles = StyleSheet.create({
  body: {
    color: '#333',
    fontSize: 16,
  },
  heading1: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 16,
    color: '#000',
  },
  heading2: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 16,
    color: '#000',
  },
  paragraph: {
    marginBottom: 10,
    lineHeight: 22,
  },
  link: {
    color: '#007AFF',
  },
  code_inline: {
    backgroundColor: '#f0f0f0',
    padding: 2,
    borderRadius: 4,
    fontFamily: 'monospace',
    color: '#d63384',
  },
  code_block: {
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 8,
    marginVertical: 8,
    fontFamily: 'monospace',
    borderWidth: 1,
    borderColor: '#eee',
  },
  fence: {
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 8,
    marginVertical: 8,
    fontFamily: 'monospace',
    borderWidth: 1,
    borderColor: '#eee',
  },
});

export default MarkdownRenderer;
