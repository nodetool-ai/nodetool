import { useEffect, useRef, useState } from "react";
import { Square, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  disabled?: boolean;
  streaming?: boolean;
}

export function Composer({ onSend, onStop, disabled, streaming }: Props) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize textarea up to a sane cap so the composer doesn't take over
  // the viewport when the user pastes a long block.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  function submit() {
    const v = text.trim();
    if (!v || streaming) return;
    onSend(v);
    setText("");
  }

  return (
    <div className="border-t border-border bg-background/95 px-6 py-4">
      <div
        className={cn(
          "relative flex items-end gap-2 rounded-xl border border-input bg-card p-2 transition focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20",
          disabled && "opacity-60"
        )}
      >
        <Textarea
          ref={ref}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={
            disabled
              ? "Connecting…"
              : "Message…  (Enter to send, Shift+Enter for newline)"
          }
          className="border-0 bg-transparent shadow-none focus-visible:ring-0 px-2 py-1.5 max-h-[220px]"
        />

        {streaming ? (
          <Button
            type="button"
            size="icon"
            variant="destructive"
            onClick={onStop}
            aria-label="Stop generation"
          >
            <Square className="size-4 fill-current" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            disabled={disabled || !text.trim()}
            onClick={submit}
            aria-label="Send"
          >
            <Send className="size-4" />
          </Button>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Powered by{" "}
        <code className="rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[10px]">
          @nodetool-ai/sdk
        </code>{" "}
        — same WS protocol as the main NodeTool app
      </p>
    </div>
  );
}
