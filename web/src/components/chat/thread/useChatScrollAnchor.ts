import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { SPACING_PX } from "../../ui_primitives";
import type { Message } from "../../../stores/ApiTypes";
import type { ChatStatus } from "../types/chat.types";
import { isFunction } from "../../../utils/typePredicates";

/**
 * Scroll ownership for a chat thread. The view is always in exactly one of
 * three modes, recorded on the scroll host as `data-scroll-mode`:
 *
 * - `following-end` — the bottom of the conversation stays pinned to the
 *   bottom of the viewport. The mode a thread starts in and returns to.
 * - `anchoring-new-turn` — a just-sent prompt is held near the top of the
 *   viewport while the reply grows into a reserved tail below it.
 * - `free-scrolling` — the user owns the scroll position; nothing moves it,
 *   and content that reflows above the viewport is compensated for.
 *
 * Transitions: a new user message → `anchoring-new-turn`; a wheel, touchmove,
 * or pointerdown on the host → `free-scrolling`; scrolling back within
 * `SCROLL_THRESHOLD` of the bottom, or pressing scroll-to-bottom, or switching
 * threads → `following-end`.
 */
const SCROLL_THRESHOLD = 50;
const ESTIMATED_MESSAGE_HEIGHT = 200;
const CHAT_ANCHOR_OFFSET = SPACING_PX.xl;
const SCROLL_POSITION_EPSILON = 1;

export type ChatScrollMode =
  | "following-end"
  | "anchoring-new-turn"
  | "free-scrolling";

export interface ActiveChatAnchor {
  messageId: string;
  messageIndex: number;
}

/** Jump an element to its bottom. Guards `scrollTo` (absent in jsdom). */
function scrollElementToBottom(el: HTMLElement | null): void {
  if (!el) return;
  if (isFunction(el.scrollTo)) {
    el.scrollTo({ top: el.scrollHeight });
  } else {
    el.scrollTop = el.scrollHeight;
  }
}

function getElementBottomInScrollContent(
  scrollHost: HTMLElement,
  element: HTMLElement
): number {
  const hostRect = scrollHost.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  return scrollHost.scrollTop + elementRect.bottom - hostRect.top;
}

export interface UseChatScrollAnchorOptions {
  /** Conversation currently rendered. A change resets the machine. */
  visibleThreadId?: string | null;
  /** Every message in the thread, including the ones the view filters out. */
  messages: Message[];
  /** The rows the virtualizer renders. */
  filteredMessages: Message[];
  /** Index of the newest user message in `filteredMessages`, or -1. */
  lastUserMessageIndex: number;
  status: ChatStatus;
  overscan: number;
  loadOlderMessages?: () => Promise<unknown>;
}

export interface ChatScrollAnchor {
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  /** Ref callback for the scrolling element. */
  handleScrollRef: (node: HTMLDivElement | null) => void;
  /** Ref for the wrapper holding the real (non-tail) content. */
  realContentRef: React.RefObject<HTMLDivElement | null>;
  scrollToBottom: () => void;
  showScrollToBottomButton: boolean;
  activeAnchor: ActiveChatAnchor | null;
  anchorTailHeight: number;
  /**
   * Hold the viewport still across a layout change the user triggered (a
   * thought section folding open). Only acts in `free-scrolling` mode.
   */
  preserveViewportAfterToggle: (
    anchorElement: HTMLElement,
    anchorBottomBeforeToggle: number
  ) => void;
}

export function useChatScrollAnchor({
  visibleThreadId,
  messages,
  filteredMessages,
  lastUserMessageIndex,
  status,
  overscan,
  loadOlderMessages
}: UseChatScrollAnchorOptions): ChatScrollAnchor {
  const scrollRef = useRef<HTMLDivElement>(null);
  const realContentRef = useRef<HTMLDivElement>(null);
  const [scrollHost, setScrollHost] = useState<HTMLDivElement | null>(null);
  const [showScrollToBottomButton, setShowScrollToBottomButton] =
    useState(false);
  const [activeAnchor, setActiveAnchor] = useState<ActiveChatAnchor | null>(
    null
  );
  const [anchorTailHeight, setAnchorTailHeight] = useState(0);
  const scrollModeRef = useRef<ChatScrollMode>("following-end");
  const positionedAnchorIdRef = useRef<string | null>(null);
  const anchorSawBusyRef = useRef(false);
  const previousMessageCountRef = useRef(messages.length);
  const previousLastMessageRef = useRef(messages.at(-1)?.id);
  const previousRowsRef = useRef({
    threadId: visibleThreadId,
    firstId: filteredMessages[0]?.id
  });
  const loadingOlderThreadsRef = useRef(new Set<string | null | undefined>());
  const scrollRafRef = useRef<number | null>(null);
  const layoutRafRef = useRef<number | null>(null);
  const viewportAnchorRef = useRef<{
    element: HTMLElement;
    top: number;
  } | null>(null);

  const handleScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    if (node) {
      node.dataset.scrollMode = scrollModeRef.current;
    }
    setScrollHost(node);
  }, []);

  const setScrollMode = useCallback((mode: ChatScrollMode) => {
    scrollModeRef.current = mode;
    if (scrollRef.current) {
      scrollRef.current.dataset.scrollMode = mode;
    }
  }, []);

  const virtualizer = useVirtualizer({
    count: filteredMessages.length,
    getScrollElement: () => scrollHost,
    estimateSize: () => ESTIMATED_MESSAGE_HEIGHT,
    anchorTo: "end",
    followOnAppend: false,
    overscan,
    getItemKey: (index) => filteredMessages[index].id ?? `msg-${index}`,
    initialRect: { width: 0, height: 800 }
  });

  // Keep the virtualizer from shifting the viewport when the trailing message
  // grows. The layout effect below owns bottom-pinning while streaming.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (
    item,
    _delta,
    instance
  ) => {
    if (item.index === filteredMessages.length - 1) return false;
    return item.start < (instance.scrollOffset ?? 0);
  };

  const totalSize = virtualizer.getTotalSize();

  // The virtualizer preserves its keyed anchor across prepends. Discard the
  // old DOM anchor so our reflow policy does not apply the same shift twice.
  useLayoutEffect(() => {
    const previous = previousRowsRef.current;
    previousRowsRef.current = {
      threadId: visibleThreadId,
      firstId: filteredMessages[0]?.id
    };
    if (previous.threadId !== visibleThreadId || !previous.firstId) return;
    const index = filteredMessages.findIndex((m) => m.id === previous.firstId);
    if (index <= 0 || !scrollRef.current) return;
    viewportAnchorRef.current = null;
  }, [filteredMessages, visibleThreadId]);

  const getRealContentBottom = useCallback((): number | null => {
    const el = scrollRef.current;
    const realContent = realContentRef.current;
    if (!el || !realContent) return null;
    return getElementBottomInScrollContent(el, realContent);
  }, []);

  const captureViewportAnchor = useCallback(() => {
    const el = scrollRef.current;
    const realContent = realContentRef.current;
    if (!el || !realContent) {
      viewportAnchorRef.current = null;
      return;
    }

    const hostTop = el.getBoundingClientRect().top;
    const rows = realContent.querySelectorAll<HTMLElement>("[data-index]");
    const anchor = Array.from(rows).find(
      (row) => row.getBoundingClientRect().bottom > hostTop + CHAT_ANCHOR_OFFSET
    );
    viewportAnchorRef.current = anchor
      ? { element: anchor, top: anchor.getBoundingClientRect().top }
      : null;
  }, []);

  const applyScrollPolicy = useCallback(() => {
    const el = scrollRef.current;
    const realContentBottom = getRealContentBottom();
    if (!el || realContentBottom == null) return;

    if (scrollModeRef.current === "free-scrolling") {
      const viewportAnchor = viewportAnchorRef.current;
      if (viewportAnchor?.element.isConnected) {
        const nextTop = viewportAnchor.element.getBoundingClientRect().top;
        const delta = nextTop - viewportAnchor.top;
        if (Math.abs(delta) > SCROLL_POSITION_EPSILON) {
          el.scrollTop += delta;
        }
      }
      captureViewportAnchor();
      return;
    }

    if (scrollModeRef.current === "anchoring-new-turn") {
      const visibleBottom = el.scrollTop + el.clientHeight - CHAT_ANCHOR_OFFSET;
      const overflow = realContentBottom - visibleBottom;
      if (overflow > SCROLL_POSITION_EPSILON) {
        el.scrollTop += overflow;
      }
      return;
    }

    const target = Math.max(0, realContentBottom - el.clientHeight);
    if (Math.abs(target - el.scrollTop) > SCROLL_POSITION_EPSILON) {
      el.scrollTop = target;
    }
  }, [captureViewportAnchor, getRealContentBottom]);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const realContentBottom = getRealContentBottom();
    if (realContentBottom == null) return;
    const nearBottom =
      realContentBottom - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;

    if (scrollModeRef.current === "free-scrolling" && nearBottom) {
      setScrollMode("following-end");
    }
    setShowScrollToBottomButton(
      scrollModeRef.current === "free-scrolling" && !nearBottom
    );
    captureViewportAnchor();
  }, [captureViewportAnchor, getRealContentBottom, setScrollMode]);

  useEffect(() => {
    const el = scrollHost;
    if (!el) return;
    // Coalesce scroll events to at most one measurement per frame — each call
    // reads scrollTop/scrollHeight/clientHeight (a forced reflow) and setStates.
    const onScroll = () => {
      if (scrollRafRef.current != null) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        updateScrollState();
        if (
          el.scrollTop < ESTIMATED_MESSAGE_HEIGHT &&
          scrollModeRef.current === "free-scrolling" &&
          loadOlderMessages &&
          !loadingOlderThreadsRef.current.has(visibleThreadId)
        ) {
          loadingOlderThreadsRef.current.add(visibleThreadId);
          void loadOlderMessages().finally(() => {
            loadingOlderThreadsRef.current.delete(visibleThreadId);
          });
        }
      });
    };
    const onManualNavigation = () => {
      if (scrollModeRef.current === "free-scrolling") return;
      setScrollMode("free-scrolling");
      positionedAnchorIdRef.current = null;
      anchorSawBusyRef.current = false;
      setActiveAnchor(null);
      setAnchorTailHeight(0);
      captureViewportAnchor();
    };
    const onKeyboardNavigation = (event: KeyboardEvent) => {
      if (
        event.target === el &&
        ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)
      ) {
        onManualNavigation();
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onManualNavigation, { passive: true });
    el.addEventListener("touchmove", onManualNavigation, { passive: true });
    el.addEventListener("pointerdown", onManualNavigation, { passive: true });
    el.addEventListener("keydown", onKeyboardNavigation);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onManualNavigation);
      el.removeEventListener("touchmove", onManualNavigation);
      el.removeEventListener("pointerdown", onManualNavigation);
      el.removeEventListener("keydown", onKeyboardNavigation);
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [
    captureViewportAnchor,
    scrollHost,
    setScrollMode,
    updateScrollState,
    loadOlderMessages,
    visibleThreadId
  ]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollMode("following-end");
    positionedAnchorIdRef.current = null;
    anchorSawBusyRef.current = false;
    setActiveAnchor(null);
    setAnchorTailHeight(0);
    const realContentBottom = getRealContentBottom();
    if (realContentBottom != null) {
      el.scrollTop = Math.max(0, realContentBottom - el.clientHeight);
    }
    setShowScrollToBottomButton(false);
  }, [getRealContentBottom, setScrollMode]);

  // Reset follow state whenever the visible thread changes, so a previously
  // "scrolled up" thread doesn't carry that state onto the next one.
  useEffect(() => {
    setScrollMode("following-end");
    positionedAnchorIdRef.current = null;
    anchorSawBusyRef.current = false;
    setActiveAnchor(null);
    setAnchorTailHeight(0);
    viewportAnchorRef.current = null;
    setShowScrollToBottomButton(false);
  }, [visibleThreadId, setScrollMode]);

  // Land on the latest message when a thread first becomes visible — on mount,
  // thread switch, or once its messages finish loading. Without this the
  // virtualizer starts at the top, forcing a manual scroll to the end of an
  // existing conversation. Runs before the incremental new-message effect (and
  // syncs the count it reads) so the two don't fight over the scroll position.
  const landedThreadRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!scrollHost || filteredMessages.length === 0) return;
    if (landedThreadRef.current === visibleThreadId) return;
    landedThreadRef.current = visibleThreadId;
    previousMessageCountRef.current = messages.length;
    setScrollMode("following-end");

    const land = () => {
      if (scrollModeRef.current !== "following-end") return;
      virtualizer.scrollToIndex(filteredMessages.length - 1, { align: "end" });
      const el = scrollRef.current;
      if (el) {
        scrollElementToBottom(el);
      }
      setShowScrollToBottomButton(false);
    };
    // Two frames: the first lands on the estimated bottom, the second settles
    // on the true bottom after the virtualizer measures real item heights.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      land();
      raf2 = requestAnimationFrame(land);
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [
    scrollHost,
    visibleThreadId,
    filteredMessages.length,
    messages.length,
    setScrollMode,
    virtualizer
  ]);

  // On new user message → scroll that message to top.
  // On other new messages → follow to bottom if user hasn't scrolled up.
  useEffect(() => {
    const prevCount = previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;
    const previousLast = previousLastMessageRef.current;
    previousLastMessageRef.current = messages.at(-1)?.id;
    if (messages.length <= prevCount) return;
    if (previousLast && previousLast === messages.at(-1)?.id) return;

    const last = messages[messages.length - 1];
    if (last?.role === "user" && lastUserMessageIndex >= 0) {
      const el = scrollRef.current;
      const messageId = last.id ?? `msg-${lastUserMessageIndex}`;
      setScrollMode("anchoring-new-turn");
      positionedAnchorIdRef.current = null;
      anchorSawBusyRef.current = false;
      setActiveAnchor({ messageId, messageIndex: lastUserMessageIndex });
      setAnchorTailHeight(el?.clientHeight ?? 0);
      setShowScrollToBottomButton(false);
      return;
    }

    if (
      scrollModeRef.current === "anchoring-new-turn" &&
      status !== "loading" &&
      status !== "streaming"
    ) {
      anchorSawBusyRef.current = true;
    } else if (scrollModeRef.current === "following-end") {
      applyScrollPolicy();
    }
  }, [
    applyScrollPolicy,
    lastUserMessageIndex,
    messages,
    setScrollMode,
    status
  ]);

  // Position a newly sent prompt once the reserved tail makes it scrollable.
  // The active turn then grows into that tail without moving the prompt until
  // the real response content reaches the usable viewport bottom.
  useEffect(() => {
    if (!activeAnchor || !scrollHost) return;
    if (positionedAnchorIdRef.current === activeAnchor.messageId) return;
    positionedAnchorIdRef.current = activeAnchor.messageId;

    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(activeAnchor.messageIndex, { align: "start" });
      secondFrame = requestAnimationFrame(() => {
        const el = scrollRef.current;
        const row = realContentRef.current?.querySelector<HTMLElement>(
          `[data-index="${activeAnchor.messageIndex}"]`
        );
        if (!el || !row) return;
        const hostTop = el.getBoundingClientRect().top;
        const rowTop = row.getBoundingClientRect().top;
        el.scrollTop = Math.max(
          0,
          el.scrollTop + rowTop - hostTop - CHAT_ANCHOR_OFFSET
        );
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [activeAnchor, scrollHost, virtualizer]);

  // Apply the active policy before paint when the virtualizer reports a real
  // size change. Token updates that do not change layout perform no scroll.
  useLayoutEffect(() => {
    applyScrollPolicy();
  }, [applyScrollPolicy, status, totalSize]);

  // Images, approvals, status rows, and responsive reflow can change height
  // without changing the virtualizer's total. Coalesce those measurements to
  // one policy application per animation frame.
  useEffect(() => {
    const el = scrollHost;
    const realContent = realContentRef.current;
    if (!el || !realContent || typeof ResizeObserver === "undefined") return;

    const schedulePolicy = () => {
      if (layoutRafRef.current != null) return;
      layoutRafRef.current = requestAnimationFrame(() => {
        layoutRafRef.current = null;
        applyScrollPolicy();
      });
    };
    const observer = new ResizeObserver(schedulePolicy);
    observer.observe(el);
    observer.observe(realContent);
    return () => {
      observer.disconnect();
      if (layoutRafRef.current != null) {
        cancelAnimationFrame(layoutRafRef.current);
        layoutRafRef.current = null;
      }
    };
  }, [applyScrollPolicy, scrollHost]);

  // Once the turn settles, keep the just-sent prompt anchored where it landed
  // instead of snapping the view to the conversation bottom (which for a short
  // response would pull earlier messages down and push the prompt off the top).
  // Trim the reserved tail to the minimum that holds the current scroll offset
  // so no large empty gap lingers below the response. A long response that
  // already followed to the bottom keeps ~zero tail and stays put. The anchor is
  // released only when the user scrolls (→ free-scrolling) or sends the next
  // turn. Free-scrolling mode is never overridden by a status change.
  useEffect(() => {
    if (status === "loading" || status === "streaming") {
      if (scrollModeRef.current === "anchoring-new-turn") {
        anchorSawBusyRef.current = true;
      }
      return;
    }
    if (scrollModeRef.current !== "anchoring-new-turn") return;
    if (!anchorSawBusyRef.current) return;
    anchorSawBusyRef.current = false;
    const el = scrollRef.current;
    const realContentBottom = getRealContentBottom();
    if (!el || realContentBottom == null) {
      setAnchorTailHeight(0);
      return;
    }
    const requiredTail = Math.max(
      0,
      el.scrollTop + el.clientHeight - realContentBottom
    );
    setAnchorTailHeight(requiredTail);
  }, [getRealContentBottom, status]);

  const preserveViewportAfterToggle = useCallback(
    (anchorElement: HTMLElement, anchorBottomBeforeToggle: number) => {
      requestAnimationFrame(() => {
        if (
          scrollModeRef.current !== "free-scrolling" ||
          !anchorElement.isConnected
        ) {
          return;
        }
        const el = scrollRef.current;
        if (!el) return;
        const delta =
          anchorElement.getBoundingClientRect().bottom -
          anchorBottomBeforeToggle;
        if (Math.abs(delta) > SCROLL_POSITION_EPSILON) {
          el.scrollTop += delta;
          captureViewportAnchor();
        }
      });
    },
    [captureViewportAnchor]
  );

  return {
    virtualizer,
    handleScrollRef,
    realContentRef,
    scrollToBottom,
    showScrollToBottomButton,
    activeAnchor,
    anchorTailHeight,
    preserveViewportAfterToggle
  };
}
