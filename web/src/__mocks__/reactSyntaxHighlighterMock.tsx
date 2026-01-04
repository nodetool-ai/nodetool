import React from "react";

export default function MockSyntaxHighlighter({
  children,
  _language,
  _showLineNumbers,
  _theme
}: {
  children?: React.ReactNode;
  _language?: string;
  _showLineNumbers?: boolean;
  _theme?: Record<string, React.CSSProperties>;
}) {
  return <pre className="mock-syntax-highlighter">{children}</pre>;
}

export const Prism = {
  oneDark: {},
  oneLight: {}
};
