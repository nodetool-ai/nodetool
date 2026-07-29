// One Dark / One Light syntax-highlight palettes for the chat CodeBlock —
// color-as-data (a fixed editor color scheme), exempt from design-token lint
// like JSONRenderer.tsx and textEditor/codeHighlightStyles.ts.

export interface CodeThemeColors {
  background: string;
  foreground: string;
  comment: string;
  keyword: string;
  tag: string;
  string: string;
  number: string;
  function: string;
  url: string;
}

export const oneDarkColors: CodeThemeColors = {
  background: "#282c34",
  foreground: "#abb2bf",
  comment: "#5c6370",
  keyword: "#c678dd",
  tag: "#e06c75",
  string: "#98c379",
  number: "#d19a66",
  function: "#61afef",
  url: "#56b6c2"
};

export const oneLightColors: CodeThemeColors = {
  background: "#fafafa",
  foreground: "#383a42",
  comment: "#a0a1a7",
  keyword: "#a626a4",
  tag: "#e45649",
  string: "#50a14f",
  number: "#986801",
  function: "#4078f2",
  url: "#0184bc"
};
