/**
 * Conversation list.
 *
 * The web app keeps this as a permanent rail; a side panel is too narrow for
 * one, so the same list slides over the transcript. Behaviour follows
 * `examples/chat_app/src/components/sidebar.tsx`, including the inline delete
 * confirmation.
 */

import { useState } from "react";

import type { ThreadSummary } from "../../lib/nodetool-client.js";
import { CloseIcon, PlusIcon, TrashIcon } from "./Icons.js";

interface ThreadDrawerProps {
  threads: ThreadSummary[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function ThreadDrawer({
  threads,
  activeThreadId,
  onSelect,
  onNewChat,
  onDelete,
  onClose,
}: ThreadDrawerProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  return (
    <div className="drawer" role="dialog" aria-label="Conversations">
      <div className="drawer__header">
        <h2 className="drawer__title">Conversations</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="New conversation"
          title="New conversation"
          onClick={onNewChat}
        >
          <PlusIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Close conversations"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>

      <div className="drawer__body">
        {threads.length === 0 && (
          <p className="field__hint">
            No conversations yet — start one with the + button.
          </p>
        )}
        {threads.map((thread) => (
          <div className="thread-row" key={thread.id}>
            <button
              type="button"
              className="thread-row__select"
              aria-current={thread.id === activeThreadId}
              onClick={() => onSelect(thread.id)}
            >
              {thread.title || "Untitled"}
            </button>
            {pendingDeleteId === thread.id ? (
              <>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setPendingDeleteId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="text-button text-button--danger"
                  onClick={() => {
                    onDelete(thread.id);
                    setPendingDeleteId(null);
                  }}
                >
                  Delete
                </button>
              </>
            ) : (
              <button
                type="button"
                className="icon-button icon-button--danger"
                aria-label={`Delete ${thread.title || "Untitled"}`}
                onClick={() => setPendingDeleteId(thread.id)}
              >
                <TrashIcon size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
