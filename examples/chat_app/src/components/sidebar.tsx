import { useState } from "react";
import { MessageSquarePlus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface SidebarThread {
  id: string;
  title: string | null;
  updated_at?: string;
}

interface Props {
  threads: SidebarThread[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  connectionState: string;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({
  threads,
  activeThreadId,
  onSelect,
  onNewChat,
  onDelete,
  isOpen,
  onClose
}: Props) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  function confirmDelete(id: string) {
    onDelete(id);
    setPendingDeleteId(null);
  }

  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-label="Close sidebar"
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-border bg-card/95 transition-transform md:static md:z-auto md:translate-x-0 md:bg-card/70",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
      <div className="flex h-14 items-center justify-between gap-2 px-4">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-sm font-semibold tracking-tight">
            NodeTool <span className="text-muted-foreground">Chat</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                onClick={onNewChat}
                aria-label="New conversation"
              >
                <MessageSquarePlus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">New conversation</TooltipContent>
          </Tooltip>
          <Button
            size="icon"
            variant="ghost"
            className="md:hidden"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <Separator />

      <div className="px-3 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Conversations
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="flex flex-col gap-1 pb-3">
          {threads.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No conversations yet — start one with the + button.
            </div>
          )}
          {threads.map((t) => {
            const active = t.id === activeThreadId;
            return (
              <div key={t.id} className="group relative">
                <button
                  onClick={() => onSelect(t.id)}
                  className={cn(
                    "w-full truncate rounded-md px-3 py-2 pr-9 text-left text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.title || "Untitled"}
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 size-7 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDeleteId(t.id);
                  }}
                  aria-label={`Delete ${t.title || "Untitled"}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
                {pendingDeleteId === t.id && (
                  <div
                    className="absolute right-1 top-9 z-10 w-48 rounded-md border border-border bg-popover p-2 text-xs shadow-lg"
                    role="dialog"
                    aria-label="Confirm delete conversation"
                  >
                    <p className="mb-2 text-muted-foreground">
                      Delete this conversation?
                    </p>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setPendingDeleteId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        className="h-7 px-2 text-xs"
                        onClick={() => confirmDelete(t.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
      </aside>
    </>
  );
}

function Logo() {
  return (
    <span className="flex size-7 items-center justify-center rounded-md border border-border bg-muted text-foreground">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
        aria-hidden
      >
        <circle cx="6" cy="6" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="12" cy="18" r="2" />
        <path d="M8 7l3 9" />
        <path d="M16 7l-3 9" />
        <path d="M8 6h8" />
      </svg>
    </span>
  );
}
