/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import "../../../styles/markdown/nodetool-markdown.css";
import { CodeBlock } from "./markdown_elements/CodeBlock";
import { PreRenderer } from "./markdown_elements/PreRenderer";
import "../../../styles/markdown/github-markdown-dark.css";

interface ChatMarkdownProps {
  content: string;
  onInsertCode?: (text: string, language?: string) => void;
}

const styles = (_theme: Theme) =>
  css({
    backgroundColor: "transparent !important",
    width: "100%",
    minWidth: 0,
    overflow: "hidden",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    ".code-block-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: "var(--palette-grey-800)",
      color: "var(--palette-grey-200)",
      paddingTop: "5px",
      paddingBottom: "5px",
      paddingLeft: "1em",
      paddingRight: "1em",
      borderTopLeftRadius: "8px",
      borderTopRightRadius: "8px"
    },
    pre: {
      borderRadius: "8px",
      borderTopLeftRadius: "0px",
      borderTopRightRadius: "0px",
      marginTop: "0px",
      maxHeight: "80vh",
      overflow: "auto"
    }
  });

const ChatMarkdown: React.FC<ChatMarkdownProps> = React.memo(({
  content,
  onInsertCode
}) => {
  const _theme = useTheme();
  return (
    <div css={styles(_theme)} className="markdown markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          code: (props) => <CodeBlock {...props} onInsert={onInsertCode} />,
          pre: (props) => <PreRenderer {...props} onInsert={onInsertCode} />,
          a: ({ node, ...props }) => {
            const { href, children } = props;
            const isAudio =
              href &&
              (href.toLowerCase().endsWith(".mp3") ||
                href.toLowerCase().endsWith(".wav") ||
                href.toLowerCase().endsWith(".ogg") ||
                href.toLowerCase().endsWith(".m4a") ||
                href.toLowerCase().endsWith(".webm"));

            if (isAudio && href) {
              return (
                <span css={{ display: "inline-flex", alignItems: "center", gap: "8px", verticalAlign: "middle" }}>
                  <audio controls src={href} css={{ height: "32px" }} />
                  <a {...props} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                </span>
              );
            }
            return <a {...props} target="_blank" rel="noopener noreferrer" />;
          }
        }}
      >
        {content || ""}
      </ReactMarkdown>
    </div>
  );
});

ChatMarkdown.displayName = "ChatMarkdown";

export default ChatMarkdown;
