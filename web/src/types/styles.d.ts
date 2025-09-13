declare module "*.css" {
  const content: { [className: string]: string };
  export default content;
}

// moved to types/svg-react.d.ts

// Ambient declarations for ESM subpath imports used by react-syntax-highlighter
declare module "react-syntax-highlighter/dist/esm/prism" {
  import * as React from "react";
  export interface SyntaxHighlighterProps {
    language?: string;
    style?: any;
    PreTag?: any;
    children?: React.ReactNode;
    customStyle?: React.CSSProperties;
    className?: string;
  }
  const SyntaxHighlighter: React.FC<SyntaxHighlighterProps>;
  export default SyntaxHighlighter;
}

declare module "react-syntax-highlighter/dist/esm/styles/prism" {
  export const okaidia: any;
  export const gruvboxDark: any;
  export const oneDark: any;
  export const oneLight: any;
  export const materialDark: any;
  export const materialLight: any;
}
