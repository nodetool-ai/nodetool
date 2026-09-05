import React, { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { useChatScrollAnchor } from "../../src/components/chat/thread/useChatScrollAnchor";
import type { Message } from "../../src/stores/ApiTypes";

function rows(start: number, end: number): Message[] {
  return Array.from({ length: end - start }, (_, index) => ({
    type: "message",
    id: String(start + index),
    role: "assistant",
    content: `Message ${start + index}`
  }));
}

function Conversation() {
  const [messages, setMessages] = useState(rows(100, 200));
  const loadOlderMessages = useCallback(async () => {
    if (messages[0].id === "0") return;
    document.body.dataset.requests = String(Number(document.body.dataset.requests ?? 0) + 1);
    await new Promise<void>((resolve) => {
      window.addEventListener("history-page", () => resolve(), { once: true });
    });
    setMessages((previous) => [...rows(0, 100), ...previous]);
  }, [messages]);
  const scroll = useChatScrollAnchor({
    visibleThreadId: "history",
    messages,
    filteredMessages: messages,
    lastUserMessageIndex: -1,
    status: "connected",
    overscan: 5,
    loadOlderMessages
  });

  return (
    <div id="host" data-count={messages.length} ref={scroll.handleScrollRef} style={{ height: 500, overflow: "auto" }}>
      <div ref={scroll.realContentRef}>
        <div style={{ position: "relative", height: scroll.virtualizer.getTotalSize() }}>
          {scroll.virtualizer.getVirtualItems().map((row) => (
            <div
              key={row.key}
              data-index={row.index}
              data-id={messages[row.index].id}
              ref={scroll.virtualizer.measureElement}
              style={{ position: "absolute", top: row.start, height: 120 + (Number(messages[row.index].id) % 3) * 25, width: "100%" }}
            >
              {String(messages[row.index].content)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Conversation />);
