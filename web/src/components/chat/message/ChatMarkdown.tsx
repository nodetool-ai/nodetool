/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";
import { okaidia } from "react-syntax-highlighter/dist/esm/styles/prism";
import "../../../styles/markdown/github-markdown-dark.css";
// import "../../../styles/markdown/github-markdown-light.css";

interface ChatMarkdownProps {
  content: string;
}

const styles = (theme: any) =>
  css({
    backgroundColor: "transparent !important",
    pre: {
      borderRadius: "8px",
      maxHeight: "80vh",
      overflow: "auto"
    }
  });

const ChatMarkdown: React.FC<ChatMarkdownProps> = ({ content }) => {
  return (
    <div css={styles} className="markdown markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");
            return !inline && match ? (
              <SyntaxHighlighter
                style={okaidia}
                language={match[1]}
                PreTag="div"
                {...props}
              >
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          }
        }}
      >
        {content || ""}
      </ReactMarkdown>
    </div>
  );
};

export default ChatMarkdown;
