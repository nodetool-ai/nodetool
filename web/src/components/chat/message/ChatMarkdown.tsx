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
// import "../../../styles/markdown/github-markdown-light.css";

interface ChatMarkdownProps {
  content: string;
  onInsertCode?: (text: string, language?: string) => void;
}

const styles = (theme: Theme) =>
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

const ChatMarkdown: React.FC<ChatMarkdownProps> = ({
  content,
  onInsertCode
}) => {
  const theme = useTheme();
  return (
    <div css={styles(theme)} className="markdown markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          code: (props) => <CodeBlock {...props} onInsert={onInsertCode} />,
          pre: (props) => <PreRenderer {...props} onInsert={onInsertCode} />
        }}
      >
        {content || ""}
      </ReactMarkdown>
    </div>
  );
};

export default ChatMarkdown;
