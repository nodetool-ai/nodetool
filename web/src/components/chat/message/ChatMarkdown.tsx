/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo } from "react";
import ReactMarkdown, { defaultUrlTransform, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { isResourceUri } from "@nodetool-ai/protocol";
import InlineResourcePreview, {
  isInlinePreviewUri
} from "./InlineResourcePreview";
import "../../../styles/markdown/nodetool-markdown.css";
import { SPACING, getSpacingPx } from "../../ui_primitives";
import { CodeBlock } from "./markdown_elements/CodeBlock";
import { PreRenderer } from "./markdown_elements/PreRenderer";
import { BORDER_RADIUS } from "../../ui_primitives";
import { packageAssetHttpPath } from "@nodetool-ai/protocol";
import { BASE_URL } from "../../../stores/BASE_URL";
import { trpc } from "../../../trpc/client";
import ResourceChip from "./ResourceChip";
import "../../../styles/markdown/github-markdown.css";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".mkv", ".m4v", ".ogv"];
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".opus"];

const hrefPath = (href: string): string => href.toLowerCase().split(/[?#]/)[0];

const hasExtension = (href: string, extensions: readonly string[]): boolean => {
  const path = hrefPath(href);
  return extensions.some((ext) => path.endsWith(ext));
};

const isImageHref = (href: string): boolean => hasExtension(href, IMAGE_EXTENSIONS);
const isVideoHref = (href: string): boolean => hasExtension(href, VIDEO_EXTENSIONS);
const isAudioHref = (href: string): boolean => hasExtension(href, AUDIO_EXTENSIONS);

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

/** react-markdown drops unknown schemes; resource URIs (asset://, timeline://, …) are ours. */
const urlTransform: NonNullable<Options["urlTransform"]> = (url) =>
  isResourceUri(url) ? url : defaultUrlTransform(url);

/** Link text as a plain string — `[**Bold**](…)` hands the `a` override nodes. */
const linkText = (node: React.ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(linkText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return linkText(node.props.children);
  }
  return "";
};

const audioSpanCss = css({ display: "inline-flex", alignItems: "center", gap: getSpacingPx(SPACING.md), verticalAlign: "middle" });
const audioCss = css({ height: "32px" });
const imageCss = css({ maxWidth: "100%", height: "auto", borderRadius: BORDER_RADIUS.md });
const videoCss = css({
  display: "block",
  maxWidth: "100%",
  height: "auto",
  borderRadius: BORDER_RADIUS.md,
  backgroundColor: "var(--palette-grey-900)"
});

const extractStorageKey = (uri: string | null | undefined): string | null => {
  if (!uri) return null;
  if (uri.startsWith("asset://")) return uri.slice("asset://".length);
  if (uri.startsWith("/api/storage/")) return uri.slice("/api/storage/".length);
  return null;
};

const useChatAssetSrc = (src: string | undefined): string | undefined => {
  const key = extractStorageKey(src);
  const { data } = trpc.storage.signUrl.useQuery(
    { key: key ?? "" },
    { enabled: Boolean(key), staleTime: 6 * 24 * 60 * 60 * 1000 }
  );
  if (!src) return undefined;
  if (key) {
    // Asset storage reference — resolve through the authenticated signed-URL
    // mechanism so owner-prefixed keys (`<user>/<id>.png`) and cloud
    // backends (S3/Supabase presigned URLs) are handled correctly.
    // While the query is loading, return undefined rather than the obsolete
    // flat `/api/storage/<id>.png` fallback.
    return data?.url;
  }
  const pkgPath = packageAssetHttpPath(src);
  if (pkgPath) return `${BASE_URL}${pkgPath}`;
  if (src.startsWith("/api/")) return `${BASE_URL}${src}`;
  return src;
};

/**
 * A paragraph that carries a block embed (sketch/timeline preview, video,
 * audio) renders as a `<div>`: those elements are invalid inside `<p>`.
 */
interface HastNodeLike {
  type?: string;
  tagName?: string;
  properties?: { src?: unknown };
  children?: HastNodeLike[];
}

const isBlockEmbedSrc = (src: string): boolean =>
  isInlinePreviewUri(src) || isVideoHref(src) || isAudioHref(src);

const containsBlockEmbed = (node: unknown): boolean => {
  const children = (node as HastNodeLike | undefined)?.children;
  return Boolean(
    children?.some(
      (child) =>
        child.type === "element" &&
        child.tagName === "img" &&
        typeof child.properties?.src === "string" &&
        isBlockEmbedSrc(child.properties.src)
    )
  );
};

const ChatMarkdownImg: React.FC<React.ComponentPropsWithoutRef<"img">> = ({
  src,
  alt,
  ...props
}) => {
  const href = typeof src === "string" ? src : "";
  const resolvedSrc = useChatAssetSrc(href || undefined);
  if (href && isVideoHref(href)) {
    return (
      <video
        src={resolvedSrc}
        controls
        playsInline
        preload="metadata"
        css={videoCss}
        aria-label={alt || "Video content"}
      />
    );
  }
  if (href && isAudioHref(href)) {
    return (
      <audio
        src={resolvedSrc}
        controls
        preload="metadata"
        css={audioCss}
        aria-label={alt || "Audio content"}
      />
    );
  }
  return (
    <img
      {...props}
      src={resolvedSrc}
      alt={alt ?? ""}
      css={imageCss}
      loading="lazy"
    />
  );
};

const ChatMarkdownImageLink: React.FC<{ href: string; children: React.ReactNode }> = ({
  href,
  children
}) => {
  const resolvedHref = useChatAssetSrc(href);
  return (
    <a href={resolvedHref} target="_blank" rel="noopener noreferrer">
      <img src={resolvedHref} alt={String(children ?? "")} css={imageCss} loading="lazy" />
    </a>
  );
};

const ChatMarkdown: React.FC<ChatMarkdownProps> = React.memo(({
  content,
  onInsertCode
}) => {
  const components = useMemo(
    () => ({
      code: (props: React.ComponentPropsWithoutRef<"code">) => <CodeBlock {...props} onInsert={onInsertCode} />,
      pre: (props: React.ComponentPropsWithoutRef<"pre">) => <PreRenderer {...props} onInsert={onInsertCode} />,
      img: ({ node: _node, ...props }: { node?: unknown } & React.ComponentPropsWithoutRef<"img">) => {
        const src = typeof props.src === "string" ? props.src : undefined;
        if (src && isInlinePreviewUri(src)) {
          return (
            <InlineResourcePreview uri={src} label={props.alt || src} />
          );
        }
        return <ChatMarkdownImg {...props} />;
      },
      p: ({
        node,
        children,
        ...props
      }: { node?: unknown } & React.ComponentPropsWithoutRef<"p">) =>
        containsBlockEmbed(node) ? (
          <div {...props}>{children}</div>
        ) : (
          <p {...props}>{children}</p>
        ),
      a: ({ node: _node, ...props }: { node?: unknown } & React.ComponentPropsWithoutRef<"a">) => {
        const { href, children } = props;
        if (href && isResourceUri(href)) {
          return <ResourceChip uri={href} label={linkText(children) || href} />;
        }
        if (href && isImageHref(href)) {
          return <ChatMarkdownImageLink href={href}>{children}</ChatMarkdownImageLink>;
        }
        if (href && isAudioHref(href)) {
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
        urlTransform={urlTransform}
        components={components}
      >
        {content || ""}
      </ReactMarkdown>
    </div>
  );
});

ChatMarkdown.displayName = "ChatMarkdown";

export default ChatMarkdown;
