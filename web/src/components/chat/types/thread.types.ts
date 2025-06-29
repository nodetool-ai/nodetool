export interface ThreadInfo {
  id: string;
  title?: string;
  updatedAt: string;
  messages: Array<any>;
}

export interface ThreadListProps {
  threads: Record<string, ThreadInfo> | null;
  currentThreadId: string | null;
  onNewThread: () => void;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  getThreadPreview: (id: string) => string;
}

export interface ThreadItemProps {
  threadId: string;
  thread: ThreadInfo;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  getPreview: () => string;
  /**
   * Controls whether the thread's relative timestamp should be displayed.
   * When omitted, the timestamp is shown by default.
   */
  showDate?: boolean;
}
