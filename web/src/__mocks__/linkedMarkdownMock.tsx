import React from "react";

/**
 * react-markdown is ESM-only. This stand-in renders markdown images
 * `![alt](src)` and links `[label](href)` through `components.img` and
 * `components.a`, passing each URL through `urlTransform` first.
 */
const SAFE_SCHEME = /^(https?|mailto|irc|ircs|xmpp):/i;

export const defaultUrlTransform = (url: string): string => {
  const colon = url.indexOf(":");
  if (colon === -1 || SAFE_SCHEME.test(url)) {
    return url;
  }
  const questionMark = url.indexOf("?");
  const hash = url.indexOf("#");
  const slash = url.indexOf("/");
  const beforePath =
    (slash === -1 || colon < slash) &&
    (questionMark === -1 || colon < questionMark) &&
    (hash === -1 || colon < hash);
  return beforePath ? "" : url;
};

const TOKEN = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]*)\]\(([^)]+)\)/g;

export default function MockMarkdown({
  children,
  components,
  urlTransform
}: {
  children?: string;
  components?: {
    img?: React.ComponentType<{ src?: string; alt?: string }>;
    a?: React.ComponentType<React.ComponentPropsWithoutRef<"a">>;
  };
  urlTransform?: (url: string) => string | null | undefined;
}) {
  const content = children ?? "";
  const transform = urlTransform ?? defaultUrlTransform;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(content)) !== null) {
    parts.push(content.slice(cursor, match.index));
    if (match[1] !== undefined && match[2] !== undefined) {
      const alt = match[1];
      const src = transform(match[2]) ?? "";
      if (src && components?.img) {
        parts.push(
          React.createElement(components.img, { key: match.index, src, alt })
        );
      } else if (src) {
        parts.push(React.createElement("img", { key: match.index, src, alt }));
      }
    } else if (match[3] !== undefined && match[4] !== undefined) {
      const label = match[3];
      const href = transform(match[4]) ?? "";
      if (href && components?.a) {
        parts.push(
          React.createElement(components.a, { key: match.index, href }, label)
        );
      } else {
        parts.push(label);
      }
    }
    cursor = match.index + match[0].length;
  }
  parts.push(content.slice(cursor));
  return React.createElement(React.Fragment, null, ...parts);
}
