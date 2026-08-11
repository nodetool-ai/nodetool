declare module 'react-native-syntax-highlighter' {
  import { Component, ComponentType, ReactNode } from 'react';
  import { ViewStyle, TextStyle, ViewProps } from 'react-native';

  interface SyntaxHighlighterProps {
    language?: string;
    style?: Record<string, unknown>;
    customStyle?: ViewStyle;
    codeTagProps?: {
      style?: TextStyle;
    };
    fontSize?: number;
    highlighter?: string;
    children?: string;
    fontFamily?: string;
    /** Container component for the highlighted code block */
    PreTag?: ComponentType<ViewProps & { children?: ReactNode }>;
    /** Component for rendering code content */
    CodeTag?: ComponentType<ViewProps & { children?: ReactNode }>;
  }

  export default class SyntaxHighlighter extends Component<SyntaxHighlighterProps> {}
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism/atom-dark' {
  const style: Record<string, unknown>;
  export default style;
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism/tomorrow' {
  const style: Record<string, unknown>;
  export default style;
}
