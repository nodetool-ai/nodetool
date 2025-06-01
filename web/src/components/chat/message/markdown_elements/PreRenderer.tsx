import React from "react";
import { CodeBlock } from "./CodeBlock";

// Define a more specific type for the props coming from ReactMarkdown's 'pre' renderer
interface PreRendererProps {
  node?: any;
  children?: React.ReactNode;
  [key: string]: any;
}

export const PreRenderer: React.FC<PreRendererProps> = ({
  node,
  children,
  ...props
}) => {
  // Check if the <pre> tag directly contains a single <code> element
  // ReactMarkdown often wraps the <code> in an array, even if it's the only child of <pre>
  let codeBlockChild: React.ReactElement | null = null;

  if (React.Children.count(children) === 1) {
    const singleChild = React.Children.toArray(children)[0];
    if (
      React.isValidElement(singleChild) &&
      singleChild.props?.node?.tagName === "code"
    ) {
      codeBlockChild = singleChild as React.ReactElement;
    }
  }

  if (codeBlockChild) {
    // If it's a <pre><code> structure, render our CodeBlock with the _isFromPre flag
    // We pass along the original props intended for the <code> element (which are in codeBlockChild.props)
    // and add our special flag.
    return <CodeBlock {...codeBlockChild.props} _isFromPre={true} />;
  } else {
    // Otherwise, render a standard <pre> tag with its children
    // This handles cases like <pre>Some plain text</pre> or <pre><span>Text</span><code>code</code></pre>
    // The inner <code>, if any, will be handled by the CodeBlock component without the _isFromPre flag.
    return <pre {...props}>{children}</pre>;
  }
};
