/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo } from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import "../../../styles/markdown/nodetool-markdown.css";
import { CodeBlock } from "./markdown_elements/CodeBlock";
import { PreRenderer } from "./markdown_elements/PreRenderer";
import "../../../styles/markdown/github-markdown.css";

interface ChatMarkdownProps {
  content: string;
  onInsertCode?: (text: string, language?: string) => void;
}

const markdownStyles = css({
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
    color: "var(--palette-text-primary)",
    paddingTop: "5px",
    paddingBottom: "5px",
    paddingLeft: "1em",
    paddingRight: "1em",
    borderTopLeftRadius: "8px",
    borderTopRightRadius: "8px"
  },
  pre: {
    borderRadius: "var(--rounded-lg)",
    borderTopLeftRadius: "0px",
    borderTopRightRadius: "0px",
    marginTop: "0px",
    maxHeight: "80vh",
    overflow: "auto"
  }
});

const REMARK_PLUGINS: Options["remarkPlugins"] = [remarkGfm];
const REHYPE_PLUGINS: Options["rehypePlugins"] = [rehypeRaw];

const audioSpanCss = css({ display: "inline-flex", alignItems: "center", gap: "8px", verticalAlign: "middle" });
const audioCss = css({ height: "32px" });

const ChatMarkdown: React.FC<ChatMarkdownProps> = React.memo(({
  content,
  onInsertCode
}) => {
  const components = useMemo(
    () => ({
      code: (props: React.ComponentPropsWithoutRef<"code">) => <CodeBlock {...props} onInsert={onInsertCode} />,
      pre: (props: React.ComponentPropsWithoutRef<"pre">) => <PreRenderer {...props} onInsert={onInsertCode} />,
      a: ({ node: _node, ...props }: { node?: unknown } & React.ComponentPropsWithoutRef<"a">) => {
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
            <span css={audioSpanCss}>
              <audio controls src={href} css={audioCss} />
              <a {...props} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            </span>
          );
        }
        return <a {...props} target="_blank" rel="noopener noreferrer" />;
      }
    }),
    [onInsertCode]
  );

  return (
    <div css={markdownStyles} className="markdown markdown-body">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
      >
        {content || ""}
      </ReactMarkdown>
    </div>
  );
});

ChatMarkdown.displayName = "ChatMarkdown";

export default ChatMarkdown;
