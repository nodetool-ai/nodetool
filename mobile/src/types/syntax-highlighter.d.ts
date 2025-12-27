declare module 'react-native-syntax-highlighter' {
  import { Component, ComponentType } from 'react';
  import { ViewStyle, TextStyle } from 'react-native';

  interface SyntaxHighlighterProps {
    language?: string;
    style?: any;
    customStyle?: ViewStyle;
    codeTagProps?: {
      style?: TextStyle;
    };
    fontSize?: number;
    highlighter?: string;
    children?: string;
    fontFamily?: string;
    PreTag?: ComponentType<any>;
    CodeTag?: ComponentType<any>;
  }

  export default class SyntaxHighlighter extends Component<SyntaxHighlighterProps> {}
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism' {
  export const atomDark: any;
  export const tomorrow: any;
}
