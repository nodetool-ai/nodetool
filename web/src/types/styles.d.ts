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
    style?: Record<string, React.CSSProperties>;
    PreTag?: React.ElementType;
    children?: React.ReactNode;
    customStyle?: React.CSSProperties;
    className?: string;
  }
  const SyntaxHighlighter: React.FC<SyntaxHighlighterProps>;
  export default SyntaxHighlighter;
}

declare module "react-syntax-highlighter/dist/esm/styles/prism" {
  import type { CSSProperties } from "react";
  type SyntaxTheme = Record<string, CSSProperties>;
  export const okaidia: SyntaxTheme;
  export const gruvboxDark: SyntaxTheme;
  export const oneDark: SyntaxTheme;
  export const oneLight: SyntaxTheme;
  export const materialDark: SyntaxTheme;
  export const materialLight: SyntaxTheme;
}
