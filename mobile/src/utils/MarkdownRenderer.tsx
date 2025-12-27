import React from 'react';
import { StyleSheet, View, ScrollView, Platform } from 'react-native';
import Markdown, { RenderRules } from 'react-native-markdown-display';
import SyntaxHighlighter from 'react-native-syntax-highlighter';
import { atomDark, tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '../hooks/useTheme';

interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const { colors, mode } = useTheme();

  const codeTheme = mode === 'dark' ? atomDark : tomorrow;

  const rules: RenderRules = {
    fence: (node, children, parent, styles) => {
      const language = (node as any).sourceInfo || (node as any).attributes?.lang || 'text';

      return (
        <View key={node.key} style={styles.fence}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <SyntaxHighlighter
              language={language}
              highlighter="prism"
              style={codeTheme}
              customStyle={{
                backgroundColor: 'transparent',
                padding: 0,
                margin: 0,
              }}
              fontSize={13}
              fontFamily={Platform.OS === 'ios' ? 'Menlo' : 'monospace'}
              PreTag={View}
              CodeTag={View}
            >
              {node.content.trim()}
            </SyntaxHighlighter>
          </ScrollView>
        </View>
      );
    },
    code_block: (node, children, parent, styles) => {
      return (
        <View key={node.key} style={styles.code_block}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <SyntaxHighlighter
              language="text"
              highlighter="prism"
              style={codeTheme}
              customStyle={{
                backgroundColor: 'transparent',
                padding: 0,
                margin: 0,
              }}
              fontSize={13}
              fontFamily={Platform.OS === 'ios' ? 'Menlo' : 'monospace'}
              PreTag={View}
              CodeTag={View}
            >
              {node.content.trim()}
            </SyntaxHighlighter>
          </ScrollView>
        </View>
      );
    },
  };

  const markdownStyles = StyleSheet.create({
    body: {
      color: colors.text,
      fontSize: 16,
    },
    heading1: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 8,
      marginTop: 16,
      color: colors.text,
    },
    heading2: {
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 8,
      marginTop: 16,
      color: colors.text,
    },
    paragraph: {
      marginBottom: 10,
      lineHeight: 22,
      color: colors.text,
    },
    link: {
      color: colors.primary,
    },
    code_inline: {
      backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
      padding: 2,
      borderRadius: 4,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      color: mode === 'dark' ? '#FF79C6' : '#D00060',
    },
    code_block: {
      backgroundColor: mode === 'dark' ? '#1E1E1E' : '#F5F5F5',
      padding: 12,
      borderRadius: 8,
      marginVertical: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    fence: {
      backgroundColor: mode === 'dark' ? '#1E1E1E' : '#F5F5F5',
      padding: 12,
      borderRadius: 8,
      marginVertical: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
  });

  return (
    <View style={styles.container}>
      <Markdown style={markdownStyles} rules={rules}>
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

export default MarkdownRenderer;
