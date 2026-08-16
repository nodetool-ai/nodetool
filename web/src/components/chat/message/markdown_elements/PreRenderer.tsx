import React, { memo } from "react";
import { CodeBlock, type CodeBlockProps } from "./CodeBlock";

interface PreRendererProps extends React.ComponentPropsWithoutRef<"pre"> {
  node?: unknown;
  onInsert?: (text: string, language?: string) => void;
}

export const PreRenderer: React.FC<PreRendererProps> = memo(({
  node: _node,
  children,
  ...props
}) => {
  // ReactMarkdown often wraps the <code> in an array, even when it's the only child of <pre>.
  let codeBlockChild: React.ReactElement | null = null;

  if (React.Children.count(children) === 1) {
    const singleChild = React.Children.toArray(children)[0];
    if (
      React.isValidElement(singleChild) &&
      (singleChild.props as { node?: { tagName?: string } })?.node?.tagName === "code"
    ) {
      codeBlockChild = singleChild as React.ReactElement;
    }
  }

  if (codeBlockChild) {
    // Forward the original <code> props and flag this as coming from a <pre>.
    return (
      <CodeBlock
        {...(codeBlockChild.props as CodeBlockProps)}
        _isFromPre={true}
        onInsert={props.onInsert}
      />
    );
  } else {
    return <pre {...props}>{children}</pre>;
  }
});

PreRenderer.displayName = "PreRenderer";
