import type { Message } from "../../../stores/ApiTypes";

export interface ThreadInfo {
  id: string;
  title?: string;
  updatedAt: string;
  messages: Message[];
}

export interface ThreadListProps {
  threads: Record<string, ThreadInfo> | null;
  currentThreadId: string | null;
  onNewThread: () => void;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  getThreadPreview: (id: string) => string;
  /** True when the list is showing the result of an active search filter. */
  isFiltered?: boolean;
}

export interface ThreadItemProps {
  threadId: string;
  thread: ThreadInfo;
  isSelected: boolean;
  /** True while the row plays its removal animation. */
  isDeleting: boolean;
  onSelect: (id: string) => void;
  /** Asks the list for confirmation; the list owns the single dialog. */
  onRequestDelete: (id: string) => void;
  previewText: string;
}
