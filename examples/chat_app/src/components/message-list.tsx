import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Wrench } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type ChatRow =
  | {
      kind: "message";
      id: string;
      role: "user" | "assistant" | "system" | "tool";
      text: string;
    }
  | {
      kind: "tool_call";
      id: string;
      name: string;
    };

interface Props {
  rows: ChatRow[];
  streaming?: boolean;
}

export function MessageList({ rows, streaming }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on every change so streaming chunks stay in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [rows.length, rows[rows.length - 1]]);

  if (rows.length === 0) {
    return <EmptyState />;
  }

  return (
    <ScrollArea className="aurora flex-1 min-h-0">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        {rows.map((row, i) => (
          <MessageRow
            key={row.id}
            row={row}
            isLast={i === rows.length - 1}
            streaming={!!streaming}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

function MessageRow({
  row,
  isLast,
  streaming
}: {
  row: ChatRow;
  isLast: boolean;
  streaming: boolean;
}) {
  if (row.kind === "tool_call") {
    return (
      <div className="flex items-center gap-2 self-start rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
        <Wrench className="size-3.5 text-muted-foreground" />
        Calling tool: <span className="font-mono text-foreground">{row.name}</span>
      </div>
    );
  }

  const isUser = row.role === "user";
  const isAssistant = row.role === "assistant";
  const showCaret = isAssistant && isLast && streaming;

  return (
    <div className={cn("flex", isUser && "justify-end")}>
      <div
        className={cn(
          "max-w-[80%] px-4 py-3",
          isUser
            ? "rounded-xl rounded-tr-sm bg-foreground text-background"
            : "text-foreground"
        )}
      >
        {row.text ? (
          <div className="prose-chat">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: (p) => <a {...p} target="_blank" rel="noreferrer" />
              }}
            >
              {row.text}
            </ReactMarkdown>
            {showCaret && <Caret />}
          </div>
        ) : (
          showCaret && <Caret />
        )}
      </div>
    </div>
  );
}

function Caret() {
  return (
    <span className="inline-block size-2 translate-y-[-1px] rounded-sm bg-current align-baseline animate-caret-blink" />
  );
}

function EmptyState() {
  return (
    <div className="aurora flex flex-1 items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
          <Bot className="size-6" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Start a conversation
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick a model, type a message, hit{" "}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
            Enter
          </kbd>
          .
          <br />
          Run the server with{" "}
          <code className="font-mono text-foreground">
            NODETOOL_ENABLE_FAKE_PROVIDER=1
          </code>{" "}
          to chat without API keys.
        </p>
      </div>
    </div>
  );
}
