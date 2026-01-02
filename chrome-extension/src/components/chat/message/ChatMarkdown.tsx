/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

interface ChatMarkdownProps {
  content: string;
}

const styles = (theme: Theme) =>
  css({
    backgroundColor: "transparent !important",
    width: "100%",
    minWidth: 0,
    overflow: "hidden",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    fontFamily: theme.fontFamily1,
    fontSize: theme.fontSizeNormal,
    lineHeight: 1.6,
    
    "h1, h2, h3, h4, h5, h6": {
      marginTop: "1em",
      marginBottom: "0.5em",
      fontWeight: 600
    },
    
    "p": {
      marginTop: "0.5em",
      marginBottom: "0.5em"
    },
    
    "ul, ol": {
      paddingLeft: "1.5em",
      marginTop: "0.5em",
      marginBottom: "0.5em"
    },
    
    "li": {
      marginTop: "0.25em",
      marginBottom: "0.25em"
    },
    
    "code": {
      backgroundColor: "var(--palette-grey-800)",
      padding: "0.2em 0.4em",
      borderRadius: "4px",
      fontSize: "0.85em",
      fontFamily: theme.fontFamily2
    },
    
    "pre": {
      backgroundColor: "var(--palette-grey-800)",
      padding: "1em",
      borderRadius: "8px",
      overflow: "auto",
      maxHeight: "400px",
      marginTop: "0.5em",
      marginBottom: "0.5em"
    },
    
    "pre code": {
      backgroundColor: "transparent",
      padding: 0
    },
    
    "blockquote": {
      borderLeft: "4px solid var(--palette-grey-600)",
      paddingLeft: "1em",
      marginLeft: 0,
      color: "var(--palette-text-secondary)"
    },
    
    "a": {
      color: "var(--palette-primary-main)",
      textDecoration: "none",
      "&:hover": {
        textDecoration: "underline"
      }
    },
    
    "table": {
      borderCollapse: "collapse",
      width: "100%",
      marginTop: "0.5em",
      marginBottom: "0.5em"
    },
    
    "th, td": {
      border: "1px solid var(--palette-grey-600)",
      padding: "0.5em"
    },
    
    "th": {
      backgroundColor: "var(--palette-grey-800)"
    },
    
    "hr": {
      border: "none",
      borderTop: "1px solid var(--palette-grey-600)",
      marginTop: "1em",
      marginBottom: "1em"
    },
    
    "img": {
      maxWidth: "100%",
      height: "auto",
      borderRadius: "8px"
    }
  });

const ChatMarkdown: React.FC<ChatMarkdownProps> = ({ content }) => {
  const theme = useTheme();
  return (
    <div css={styles(theme)} className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          a: ({ ...props }) => {
            const { href, children } = props;
            const lowerHref = href?.toLowerCase();
            const isAudio =
              lowerHref &&
              (lowerHref.endsWith(".mp3") ||
                lowerHref.endsWith(".wav") ||
                lowerHref.endsWith(".ogg") ||
                lowerHref.endsWith(".m4a") ||
                lowerHref.endsWith(".webm"));

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
};

export default ChatMarkdown;
