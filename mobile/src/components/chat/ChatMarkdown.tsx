import React from 'react';
import { StyleSheet, View, ScrollView, Platform, Text } from 'react-native';
import Markdown, { RenderRules } from 'react-native-markdown-display';
import SyntaxHighlighter from 'react-native-syntax-highlighter';
import { atomDark, tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '../../hooks/useTheme';

interface ChatMarkdownProps {
  content: string;
}

export const ChatMarkdown: React.FC<ChatMarkdownProps> = ({ content }) => {
  const { colors, mode } = useTheme();
  
  if (!content) {
    return null;
  }

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
      fontSize: 15,
      lineHeight: 22,
    },
    heading1: {
      color: colors.text,
      fontSize: 24,
      fontWeight: 'bold',
      marginTop: 12,
      marginBottom: 8,
    },
    heading2: {
      color: colors.text,
      fontSize: 20,
      fontWeight: 'bold',
      marginTop: 10,
      marginBottom: 6,
    },
    heading3: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '600',
      marginTop: 8,
      marginBottom: 4,
    },
    link: {
      color: colors.primary,
      textDecorationLine: 'underline',
    },
    blockquote: {
      backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      paddingLeft: 12,
      paddingVertical: 4,
      marginVertical: 8,
    },
    code_inline: {
      backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
      color: colors.primary,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 13,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
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
    bullet_list_icon: {
      color: colors.primary,
      marginRight: 8,
    },
    ordered_list_icon: {
      color: colors.primary,
      marginRight: 8,
    },
    table: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 4,
      marginVertical: 8,
    },
    thead: {
      backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    },
    th: {
      padding: 8,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
      fontWeight: '600',
    },
    td: {
      padding: 8,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
    },
    hr: {
      backgroundColor: colors.border,
      height: 1,
      marginVertical: 12,
    },
    strong: {
      fontWeight: 'bold',
      color: colors.text,
    },
    em: {
      fontStyle: 'italic',
      color: colors.text,
    },
  });

  return (
    <Markdown style={markdownStyles} rules={rules}>
      {content}
    </Markdown>
  );
};

export default ChatMarkdown;
