import { createContext, useContext } from "react";

/** Where the open document lives, for resolving the relative paths in it. */
export interface DocumentLocation {
  /** The project whose folder holds the document. */
  projectId: string | null;
  /** The document's project-relative path, when it is a file in the folder. */
  path: string | null;
}

const DocumentLocationContext = createContext<DocumentLocation>({
  projectId: null,
  path: null
});

export const DocumentLocationProvider = DocumentLocationContext.Provider;

export const useDocumentLocation = (): DocumentLocation =>
  useContext(DocumentLocationContext);

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * The project-relative path an image `src` names, or null when `src` is a
 * URL or locator rather than a path. A relative path resolves against the
 * document's directory; a path starting with `/` against the project folder.
 * A path that climbs out of the folder resolves to nothing.
 */
export function resolveDocumentPath(
  documentPath: string | null,
  src: string
): string | null {
  if (ABSOLUTE.test(src)) {
    return null;
  }
  let target = src.split(/[?#]/)[0];
  try {
    target = decodeURI(target);
  } catch {
    // A malformed escape: use the path as written.
  }
  const base = target.startsWith("/")
    ? []
    : (documentPath ?? "").split("/").slice(0, -1).filter(Boolean);
  const parts = [...base];
  for (const segment of target.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (parts.length === 0) {
        return null;
      }
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.length > 0 ? parts.join("/") : null;
}
