/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

interface ChatMarkdownProps {
  content: string;
}

const styles = (theme: any) =>
  css({
    p: { margin: "0.25em 0" },
    pre: {
      backgroundColor: theme.palette.c_gray0,
      padding: "0.5em",
      borderRadius: "4px",
      overflow: "auto"
    }
  });

const ChatMarkdown: React.FC<ChatMarkdownProps> = ({ content }) => {
  return (
    <div css={styles} className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
        {content || ""}
      </ReactMarkdown>
    </div>
  );
};

export default ChatMarkdown;
