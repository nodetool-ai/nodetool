import type React from "react";

export function applyAnchoredChatScroll(
  root: HTMLElement | null,
  focusIds: readonly string[],
  positions: React.MutableRefObject<Map<string, number>>
): void {
  if (!root) return;
  const scroller = root.querySelector<HTMLElement>(".scrollable-message-wrapper");
  if (!scroller) return;
  const key = focusIds.join("\u0000");
  const saved = positions.current.get(key);
  if (saved !== undefined) {
    scroller.scrollTop = saved;
    return;
  }
  const target = focusIds
    .map((focusId) =>
      root.querySelector<HTMLElement>(
        `[data-focus-id="${CSS.escape(focusId)}"]`
      )
    )
    .find((element) => element !== null && scroller.contains(element));
  if (!target) {
    scroller.scrollTop = 0;
    return;
  }
  const scrollerRect = scroller.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const targetCenterInScroll =
    scroller.scrollTop + targetRect.top - scrollerRect.top + targetRect.height / 2;
  const desired = Math.max(
    0,
    Math.min(
      scroller.scrollHeight - scroller.clientHeight,
      targetCenterInScroll - scroller.clientHeight / 2
    )
  );
  positions.current.set(key, desired);
  scroller.scrollTop = desired;
}
