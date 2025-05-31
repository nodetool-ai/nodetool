/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
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
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
        {content || ""}
      </ReactMarkdown>
    </div>
  );
};

export default ChatMarkdown;
