/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo } from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import "../../../styles/markdown/nodetool-markdown.css";
import { SPACING, getSpacingPx } from "../../ui_primitives/spacing";
import { CodeBlock } from "./markdown_elements/CodeBlock";
import { PreRenderer } from "./markdown_elements/PreRenderer";
import { BORDER_RADIUS } from "../../ui_primitives";
import { resolveUri } from "../../../utils/imageUtils";
import "../../../styles/markdown/github-markdown.css";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"];

const isImageHref = (href: string): boolean => {
  const lower = href.toLowerCase().split(/[?#]/)[0];
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

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
    paddingTop: getSpacingPx(1.5),
    paddingBottom: getSpacingPx(1.5),
    paddingLeft: "1em",
    paddingRight: "1em",
    borderTopLeftRadius: "8px",
    borderTopRightRadius: "8px"
  },
  pre: {
    borderRadius: BORDER_RADIUS.lg,
    borderTopLeftRadius: "0px",
    borderTopRightRadius: "0px",
    marginTop: "0px",
    maxHeight: "80vh",
    overflow: "auto"
  }
});

const REMARK_PLUGINS: Options["remarkPlugins"] = [remarkGfm];
const REHYPE_PLUGINS: Options["rehypePlugins"] = [rehypeRaw];

const audioSpanCss = css({ display: "inline-flex", alignItems: "center", gap: getSpacingPx(SPACING.md), verticalAlign: "middle" });
const audioCss = css({ height: "32px" });
const imageCss = css({ maxWidth: "100%", height: "auto", borderRadius: BORDER_RADIUS.md });

const ChatMarkdown: React.FC<ChatMarkdownProps> = React.memo(({
  content,
  onInsertCode
}) => {
  const components = useMemo(
    () => ({
      code: (props: React.ComponentPropsWithoutRef<"code">) => <CodeBlock {...props} onInsert={onInsertCode} />,
      pre: (props: React.ComponentPropsWithoutRef<"pre">) => <PreRenderer {...props} onInsert={onInsertCode} />,
      img: ({ node: _node, src, alt, ...props }: { node?: unknown } & React.ComponentPropsWithoutRef<"img">) => (
        <img
          {...props}
          src={typeof src === "string" ? resolveUri(src) : src}
          alt={alt ?? ""}
          css={imageCss}
          loading="lazy"
        />
      ),
      a: ({ node: _node, ...props }: { node?: unknown } & React.ComponentPropsWithoutRef<"a">) => {
        const { href, children } = props;
        if (href && isImageHref(href)) {
          return (
            <a href={resolveUri(href)} target="_blank" rel="noopener noreferrer">
              <img src={resolveUri(href)} alt={String(children ?? "")} css={imageCss} loading="lazy" />
            </a>
          );
        }
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
              <audio controls src={href} css={audioCss} aria-label="Audio content" />
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
