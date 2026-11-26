/**
 * Reads the heading outline of the Lexical editor it is mounted in and reports
 * it to its host, with the heading the reader is in and a jump function. Used
 * by the live editor and by the read-only snapshot viewer, so each version
 * has its own tree.
 */
import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isHeadingNode } from "@lexical/rich-text";
import { $getRoot, type LexicalEditor } from "lexical";

export interface DocumentOutlineItem {
  /** Lexical node key of the heading. */
  key: string;
  /** Heading level, 1 for `#` through 6 for `######`. */
  level: number;
  text: string;
}

export interface DocumentOutline {
  items: DocumentOutlineItem[];
  /** The heading whose section is at the top of the page. */
  activeKey: string | null;
  /** Scrolls the heading to the top of the page, without animation. */
  reveal: (key: string) => void;
}

/** A heading counts as current once its top is this close to the viewport top. */
const ACTIVE_OFFSET_PX = 24;

export function readOutline(editor: LexicalEditor): DocumentOutlineItem[] {
  return editor.getEditorState().read(() =>
    $getRoot()
      .getChildren()
      .flatMap((node) => {
        if (!$isHeadingNode(node)) {
          return [];
        }
        const text = node.getTextContent().trim();
        if (!text) {
          return [];
        }
        return [
          { key: node.getKey(), level: Number(node.getTag().slice(1)), text }
        ];
      })
  );
}

function sameOutline(
  a: DocumentOutlineItem[],
  b: DocumentOutlineItem[]
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (item, index) =>
        item.key === b[index].key &&
        item.level === b[index].level &&
        item.text === b[index].text
    )
  );
}

export function revealHeading(editor: LexicalEditor, key: string): void {
  const element = editor.getElementByKey(key);
  // "instant" overrides any CSS smooth scrolling on the page container.
  element?.scrollIntoView({ block: "start", behavior: "instant" });
}

function findActiveKey(
  editor: LexicalEditor,
  items: DocumentOutlineItem[],
  container: HTMLElement
): string | null {
  if (container.clientHeight === 0) {
    return null;
  }
  const top = container.getBoundingClientRect().top + ACTIVE_OFFSET_PX;
  let active: string | null = null;
  for (const item of items) {
    const element = editor.getElementByKey(item.key);
    if (!element) {
      continue;
    }
    if (element.getBoundingClientRect().top > top) {
      break;
    }
    active = item.key;
  }
  return active ?? items[0]?.key ?? null;
}

interface DocumentOutlinePluginProps {
  onChange: (outline: DocumentOutline | null) => void;
}

export function DocumentOutlinePlugin({
  onChange
}: DocumentOutlinePluginProps): null {
  const [editor] = useLexicalComposerContext();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let items: DocumentOutlineItem[] = [];
    let activeKey: string | null = null;
    let container: HTMLElement | null = null;
    let frame = 0;
    const reveal = (key: string): void => revealHeading(editor, key);

    const emit = (): void => {
      onChangeRef.current({ items, activeKey, reveal });
    };
    const updateActive = (): void => {
      frame = 0;
      const next = container ? findActiveKey(editor, items, container) : null;
      if (next !== activeKey) {
        activeKey = next;
        emit();
      }
    };
    const scheduleActive = (): void => {
      if (frame === 0) {
        frame = requestAnimationFrame(updateActive);
      }
    };
    const attach = (root: HTMLElement | null): void => {
      container?.removeEventListener("scroll", scheduleActive);
      container = root?.closest<HTMLElement>(".doc-scroll") ?? null;
      container?.addEventListener("scroll", scheduleActive, { passive: true });
      scheduleActive();
    };
    const refresh = (): void => {
      const next = readOutline(editor);
      if (!sameOutline(next, items)) {
        items = next;
        emit();
        scheduleActive();
      }
    };

    items = readOutline(editor);
    emit();
    // Called at once with the current root, then on every root change.
    const unregisterRoot = editor.registerRootListener((root) => attach(root));
    const unregisterUpdate = editor.registerUpdateListener(refresh);
    return () => {
      unregisterRoot();
      unregisterUpdate();
      container?.removeEventListener("scroll", scheduleActive);
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
      onChangeRef.current(null);
    };
  }, [editor]);

  return null;
}
