import React, { useMemo, ReactNode } from 'react';
import { StyleSheet, View, ScrollView, Platform, ViewStyle } from 'react-native';
import Markdown, {
  ASTNode,
  MarkdownIt,
  RenderRules,
  renderRules as defaultRenderRules,
} from 'react-native-markdown-display';
import { parseResourceUri } from '@nodetool-ai/protocol/resource-uri';
import SyntaxHighlighter from 'react-native-syntax-highlighter';
// Deep imports: the `styles/prism` barrel pulls all 47 themes into the bundle.
import atomDark from 'react-syntax-highlighter/dist/esm/styles/prism/atom-dark';
import tomorrow from 'react-syntax-highlighter/dist/esm/styles/prism/tomorrow';
import { useTheme } from '../../hooks/useTheme';
import { InlineResourcePreview } from './InlineResourcePreview';
import { resourceMentionsPlugin } from './resourceMentions';

/**
 * One parser for every message. `resourceMentionsPlugin` turns a bare resource
 * URI, and a code span holding only one, into an image token, so the `image`
 * rule below sees every resource reference the agent can write.
 */
const markdownParser = MarkdownIt({ typographer: true }).use(resourceMentionsPlugin);

interface ChatMarkdownProps {
  content: string;
}

export const ChatMarkdown: React.FC<ChatMarkdownProps> = ({ content }) => {
  const { colors, isDark } = useTheme();

  const codeTheme = isDark ? atomDark : tomorrow;
  const fontFamily = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

  const rules: RenderRules = useMemo(() => ({
    // `![Label](sketch://<id>)`, `![Label](timeline://<id>)`, and the forms the
    // plugin rewrites: a resource URI gets a preview and a chip, anything else
    // is an ordinary image.
    image: (node, children, parent, styles, allowedImageHandlers, defaultImageHandler) => {
      const src = String(node.attributes.src ?? '');
      if (parseResourceUri(src) !== null) {
        return (
          <InlineResourcePreview
            key={node.key}
            uri={src}
            label={String(node.attributes.alt ?? '')}
          />
        );
      }
      return defaultRenderRules.image?.(
        node,
        children,
        parent,
        styles,
        allowedImageHandlers,
        defaultImageHandler
      );
    },
    fence: (node: ASTNode, _children: ReactNode[], _parent: ASTNode[], styles: Record<string, ViewStyle>) => {
      const language = (node as ASTNode & { sourceInfo?: string }).sourceInfo || node.attributes['lang'] as string | undefined || 'text';

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
              fontFamily={fontFamily}
              PreTag={View}
              CodeTag={View}
            >
              {node.content.trim()}
            </SyntaxHighlighter>
          </ScrollView>
        </View>
      );
    },
    code_block: (node: ASTNode, _children: ReactNode[], _parent: ASTNode[], styles: Record<string, ViewStyle>) => {
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
              fontFamily={fontFamily}
              PreTag={View}
              CodeTag={View}
            >
              {node.content.trim()}
            </SyntaxHighlighter>
          </ScrollView>
        </View>
      );
    },
  }), [codeTheme, fontFamily]);

  const markdownStyles = useMemo(() => StyleSheet.create({
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
      backgroundColor: colors.inputBg,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      paddingLeft: 12,
      paddingVertical: 4,
      marginVertical: 8,
    },
    code_inline: {
      backgroundColor: colors.inputBg,
      color: colors.primary,
      fontFamily: fontFamily,
      fontSize: 13,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    code_block: {
      backgroundColor: colors.surfaceElevated,
      padding: 12,
      borderRadius: 8,
      marginVertical: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    fence: {
      backgroundColor: colors.surfaceElevated,
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
      backgroundColor: colors.inputBg,
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
  }), [colors, fontFamily]);

  if (!content) {
    return null;
  }

  return (
    <Markdown style={markdownStyles} rules={rules} markdownit={markdownParser}>
      {content}
    </Markdown>
  );
};

export default ChatMarkdown;
