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
import { Caption, FlexColumn, SPACING, getSpacingPx } from "../../ui_primitives";
import { CodeBlock } from "./markdown_elements/CodeBlock";
import { PreRenderer } from "./markdown_elements/PreRenderer";
import { BORDER_RADIUS } from "../../ui_primitives";
import { packageAssetHttpPath } from "@nodetool-ai/protocol";
import { BASE_URL } from "../../../stores/BASE_URL";
import { trpc } from "../../../trpc/client";
import { useResolvedMedia } from "../../../hooks/useResolvedMediaUri";
import ResourceChip from "./ResourceChip";
import { EntityMentionChip } from "../../node_types/editing/promptComposer/EntityMentionChip";
import { remarkEntityMentions } from "./remarkEntityMentions";
import { isNumber, isString } from "../../../utils/typePredicates";
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

type MediaKind = "video" | "audio" | "image";

const mimeKind = (mime: string | undefined): MediaKind | null => {
  if (!mime) return null;
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  return null;
};

/** Kind from the markdown href, the resolved fetch URL, or the asset MIME. */
const mediaKind = (
  href: string,
  resolvedSrc?: string,
  mime?: string
): MediaKind | null => {
  if (isVideoHref(href) || (resolvedSrc && isVideoHref(resolvedSrc))) {
    return "video";
  }
  if (isAudioHref(href) || (resolvedSrc && isAudioHref(resolvedSrc))) {
    return "audio";
  }
  if (isImageHref(href) || (resolvedSrc && isImageHref(resolvedSrc))) {
    return "image";
  }
  return mimeKind(mime);
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
  pre: {
    borderRadius: BORDER_RADIUS.lg,
    borderTopLeftRadius: "0px",
    borderTopRightRadius: "0px",
    marginTop: "0px",
    maxHeight: "80vh",
    overflow: "auto"
  }
});

const REMARK_PLUGINS: Options["remarkPlugins"] = [
  remarkGfm,
  remarkEntityMentions
];
const REHYPE_PLUGINS: Options["rehypePlugins"] = [rehypeRaw];

/** An `entity://<id>` mention — its own scheme, not one of the resource kinds. */
const isEntityUri = (url: string): boolean => url.startsWith("entity://");

/** react-markdown drops unknown schemes; resource URIs (asset://, timeline://, …) are ours. */
const urlTransform: NonNullable<Options["urlTransform"]> = (url) =>
  isResourceUri(url) || isEntityUri(url) ? url : defaultUrlTransform(url);

/** Link text as a plain string — `[**Bold**](…)` hands the `a` override nodes. */
const linkText = (node: React.ReactNode): string => {
  if (isString(node) || isNumber(node)) return String(node);
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
  if (uri.startsWith("/api/storage/")) return uri.slice("/api/storage/".length);
  return null;
};

const useChatAsset = (
  src: string | undefined
): {
  resolvedSrc: string | undefined;
  contentType: string | undefined;
  pending: boolean;
} => {
  // `asset://<id>` is an id, not a storage key (`<user>/<id>.<ext>`).
  const isAssetUri = Boolean(src?.startsWith("asset://"));
  const fromAsset = useResolvedMedia(isAssetUri ? src : undefined);
  const key = isAssetUri ? null : extractStorageKey(src);
  const { data, isPending, isError } = trpc.storage.signUrl.useQuery(
    { key: key ?? "" },
    { enabled: Boolean(key), staleTime: 6 * 24 * 60 * 60 * 1000 }
  );
  if (!src) {
    return { resolvedSrc: undefined, contentType: undefined, pending: false };
  }
  if (isAssetUri) {
    return {
      resolvedSrc: fromAsset.url,
      contentType: fromAsset.contentType,
      pending: fromAsset.pending
    };
  }
  if (key) {
    // Legacy `/api/storage/<key>` markdown — resolve through the signed-URL
    // path so owner-prefixed keys and cloud backends work.
    return {
      resolvedSrc: data?.url,
      contentType: undefined,
      pending: isPending && !isError
    };
  }
  const pkgPath = packageAssetHttpPath(src);
  if (pkgPath) {
    return {
      resolvedSrc: `${BASE_URL}${pkgPath}`,
      contentType: undefined,
      pending: false
    };
  }
  if (src.startsWith("/api/")) {
    return {
      resolvedSrc: `${BASE_URL}${src}`,
      contentType: undefined,
      pending: false
    };
  }
  return { resolvedSrc: src, contentType: undefined, pending: false };
};

/**
 * A paragraph that carries a block embed (sketch/timeline preview, video,
 * audio) renders as a `<div>`: those elements are invalid inside `<p>`.
 */
interface HastNodeLike {
  type?: string;
  tagName?: string;
  properties?: { src?: unknown; href?: unknown };
  children?: HastNodeLike[];
}

/**
 * An `asset://<id>` with no extension could be anything — its type comes from
 * the asset row, which is fetched too late for this decision. Treated as a
 * possible block embed so a video that resolves to one is not nested in a
 * `<p>`.
 */
const isUntypedAssetSrc = (src: string): boolean =>
  src.startsWith("asset://") && !/\.[A-Za-z0-9]{1,8}$/.test(hrefPath(src));

const isBlockEmbedSrc = (src: string): boolean =>
  isInlinePreviewUri(src) ||
  isVideoHref(src) ||
  isAudioHref(src) ||
  isUntypedAssetSrc(src);

/** Asset links may resolve to video/audio even without a file extension. */
const isBlockEmbedHref = (href: string): boolean =>
  isBlockEmbedSrc(href) ||
  (href.startsWith("asset://") && !isImageHref(href));

const containsBlockEmbed = (node: unknown): boolean => {
  const children = (node as HastNodeLike | undefined)?.children;
  return Boolean(
    children?.some((child) => {
      if (child.type !== "element") return false;
      if (child.tagName === "img" && isString(child.properties?.src)) {
        return isBlockEmbedSrc(child.properties.src);
      }
      if (child.tagName === "a" && isString(child.properties?.href)) {
        return isBlockEmbedHref(child.properties.href);
      }
      return false;
    })
  );
};

const ChatMarkdownMedia: React.FC<{
  resolvedSrc: string;
  kind: MediaKind;
  label: string;
  imgProps?: React.ComponentPropsWithoutRef<"img">;
}> = ({ resolvedSrc, kind, label, imgProps }) => {
  if (kind === "video") {
    return (
      <video
        src={resolvedSrc}
        controls
        playsInline
        preload="metadata"
        css={videoCss}
        aria-label={label || "Video content"}
      />
    );
  }
  if (kind === "audio") {
    return (
      <audio
        src={resolvedSrc}
        controls
        preload="metadata"
        css={audioCss}
        aria-label={label || "Audio content"}
      />
    );
  }
  return (
    <img
      {...imgProps}
      src={resolvedSrc}
      alt={label}
      css={imageCss}
      loading="lazy"
    />
  );
};

/**
 * An embed whose media never resolved.
 *
 * Rendering nothing was the old behavior, and it is indistinguishable from the
 * agent never having answered: a generated clip whose asset row is gone, or
 * whose object cannot be signed, left an empty gap in the reply. Show the
 * resource instead, so the reader knows something was there and can open it.
 */
const UnresolvedMedia: React.FC<{ href: string; label: string }> = ({
  href,
  label
}) => (
  <FlexColumn
    gap={SPACING.xs}
    align="flex-start"
    data-testid="unresolved-media"
  >
    {isResourceUri(href) ? (
      <ResourceChip uri={href} label={label || href} />
    ) : null}
    <Caption color="secondary">This media could not be loaded.</Caption>
  </FlexColumn>
);

const ChatMarkdownImg: React.FC<React.ComponentPropsWithoutRef<"img">> = ({
  src,
  alt,
  ...props
}) => {
  const href = src != null ? src : "";
  const { resolvedSrc, contentType, pending } = useChatAsset(href || undefined);
  if (!resolvedSrc) {
    // Still resolving: render nothing rather than flashing a failure.
    return pending || !href ? null : (
      <UnresolvedMedia href={href} label={alt ?? ""} />
    );
  }
  const kind = mediaKind(href, resolvedSrc, contentType) ?? "image";
  return (
    <ChatMarkdownMedia
      resolvedSrc={resolvedSrc}
      kind={kind}
      label={alt ?? ""}
      imgProps={props}
    />
  );
};

const ChatMarkdownImageLink: React.FC<{ href: string; children: React.ReactNode }> = ({
  href,
  children
}) => {
  const { resolvedSrc } = useChatAsset(href);
  return (
    <a href={resolvedSrc} target="_blank" rel="noopener noreferrer">
      <img src={resolvedSrc} alt={String(children ?? "")} css={imageCss} loading="lazy" />
    </a>
  );
};

const ChatMarkdownAssetLink: React.FC<{ href: string; label: string }> = ({
  href,
  label
}) => {
  const { resolvedSrc, contentType } = useChatAsset(href);
  const kind = mediaKind(href, resolvedSrc, contentType);
  if (kind && resolvedSrc) {
    return (
      <ChatMarkdownMedia
        resolvedSrc={resolvedSrc}
        kind={kind}
        label={label}
      />
    );
  }
  return <ResourceChip uri={href} label={label} />;
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
        const src = props.src;
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
        if (href && isEntityUri(href)) {
          return (
            <EntityMentionChip uri={href} label={linkText(children) || href} />
          );
        }
        if (href?.startsWith("asset://")) {
          return (
            <ChatMarkdownAssetLink
              href={href}
              label={linkText(children) || href}
            />
          );
        }
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
