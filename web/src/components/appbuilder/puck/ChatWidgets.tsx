/** @jsxImportSource @emotion/react */
/**
 * Chat widgets for mini apps: a thread that renders a conversation and a
 * composer that writes the next message and runs the workflow.
 *
 * The pair shares one value — the conversation, held in an app variable. The
 * composer appends the user's message to it before the run; the thread reads
 * it, shows the reply streaming in from the operation's output, and folds that
 * reply into the conversation once the run settles. That fold is what makes a
 * second turn keep the first one: an output slot is cleared at the start of
 * every run, so a reply that stayed there alone would vanish on send.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  composeUserMessage,
  messagesFrom,
  stateKey,
  type ChatMessage
} from "@nodetool-ai/app-runtime";

import {
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  ScrollArea,
  TextInput,
  BORDER_RADIUS,
  SPACING
} from "../../ui_primitives";
import { AppEvent } from "../types";
import {
  useAppRuntimeContext,
  useBindingRef,
  useBindingValue,
  useRuntimeSelector
} from "../runtime/AppRuntimeContext";
import { useWidgetRuntime } from "./useWidgetRuntime";
import { MarkdownBlock, renderOutputItem, resolveImageSrc } from "./widgets";
import { isString } from "../../../utils/typePredicates";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const str = (value: unknown): string =>
  isString(value) ? value : value == null ? "" : String(value);

const ROLE_LABELS: Record<string, string> = {
  user: "You",
  assistant: "Assistant",
  system: "System",
  tool: "Tool"
};

const MessageParts: React.FC<{ content: unknown }> = ({ content }) => {
  if (isString(content)) return <MarkdownBlock text={content} />;
  const parts = Array.isArray(content) ? content : [content];
  return (
    <FlexColumn gap={SPACING.sm} fullWidth>
      {parts.map((part, index) => {
        if (isRecord(part) && part.type === "text") {
          return <MarkdownBlock key={index} text={str(part.text)} />;
        }
        // The message content types wrap their ref one level down
        // (`image_url` → `image`, `audio` → `audio`); unwrap so the shared
        // output renderer sees a media ref it knows.
        if (isRecord(part)) {
          const inner = part.image ?? part.video ?? part.audio ?? part.document;
          if (inner !== undefined) return renderOutputItem(inner, index);
        }
        return renderOutputItem(part, index);
      })}
    </FlexColumn>
  );
};

// A thread re-renders once per streamed chunk. The history messages keep their
// identity across those renders, so memoizing here leaves only the reply in
// flight re-rendering.
const Bubble: React.FC<{ message: ChatMessage }> = React.memo(({ message }) => {
  const isUser = message.role === "user";
  return (
    <FlexRow
      fullWidth
      justify={isUser ? "flex-end" : "flex-start"}
      sx={{ minWidth: 0 }}
    >
      <FlexColumn
        gap={SPACING.micro}
        sx={{
          maxWidth: "85%",
          minWidth: 0,
          px: SPACING.md,
          py: SPACING.sm,
          borderRadius: BORDER_RADIUS.md,
          backgroundColor: isUser ? "action.selected" : "action.hover"
        }}
      >
        <Caption color="secondary">
          {ROLE_LABELS[message.role] ?? message.role}
        </Caption>
        <MessageParts content={message.content} />
      </FlexColumn>
    </FlexRow>
  );
});
Bubble.displayName = "Bubble";

interface ChatThreadWidgetProps {
  id: string;
  /** The conversation: an app variable, or an output that emits messages. */
  binding?: string;
  /** The reply streaming in from the current run. */
  streamBinding?: string;
  label?: string;
  maxHeight?: number;
  placeholder?: string;
}

export const ChatThreadWidget: React.FC<ChatThreadWidgetProps> = ({
  id,
  binding,
  streamBinding,
  label,
  maxHeight,
  placeholder
}) => {
  const { write, designMode } = useAppRuntimeContext();
  const historyRef = useBindingRef(binding, "read");
  const historyValue = useBindingValue(historyRef);
  const streamRef = useBindingRef(streamBinding, "read");
  const streamValue = useBindingValue(streamRef);

  // The invocation that produced the streamed reply, and whether it settled —
  // the two facts the fold needs, and the only reason the thread looks at the
  // output slot rather than just its value.
  const streamKey = streamRef?.kind === "output" ? stateKey(streamRef) : null;
  const streamInvocationId = useRuntimeSelector((s) =>
    streamKey ? s.outputs[streamKey]?.invocationId : undefined
  );
  const streamSettled = useRuntimeSelector((s) =>
    streamInvocationId
      ? s.invocations[streamInvocationId]?.status === "completed"
      : false
  );

  const messages = useMemo(() => messagesFrom(historyValue), [historyValue]);
  const [foldedInvocation, setFoldedInvocation] = useState<string | null>(null);

  useEffect(() => {
    if (!streamInvocationId || !streamSettled) return;
    if (foldedInvocation === streamInvocationId) return;
    if (historyRef?.kind !== "variable") return;
    if (streamValue == null || streamValue === "") return;
    setFoldedInvocation(streamInvocationId);
    write(historyRef, [
      ...messages,
      { type: "message", role: "assistant", content: streamValue }
    ]);
  }, [
    foldedInvocation,
    historyRef,
    messages,
    streamInvocationId,
    streamSettled,
    streamValue,
    write
  ]);

  // `messagesFrom` walks every accumulated chunk and rejoins the reply, so keep
  // it on the stream value instead of re-running it for a runner-state render.
  const live = useMemo(
    () =>
      streamValue != null &&
      streamValue !== "" &&
      foldedInvocation !== streamInvocationId
        ? messagesFrom(streamValue).map((m) => ({ ...m, role: "assistant" }))
        : [],
    [foldedInvocation, streamInvocationId, streamValue]
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, live.length, streamValue]);

  const all = useMemo(() => [...messages, ...live], [messages, live]);

  return (
    <FlexColumn gap={SPACING.xs} fullWidth>
      {label ? <Label>{label}</Label> : null}
      <ScrollArea
        ref={scrollRef}
        thin
        maxHeight={maxHeight && maxHeight > 0 ? maxHeight : 360}
        aria-label={label || "Conversation"}
        sx={{
          width: "100%",
          minHeight: 96,
          p: SPACING.md,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: BORDER_RADIUS.md
        }}
      >
        {all.length === 0 ? (
          <Caption color="secondary">
            {placeholder ??
              (designMode
                ? "Messages appear here once the app runs."
                : "No messages yet")}
          </Caption>
        ) : (
          <FlexColumn gap={SPACING.md} fullWidth>
            {all.map((message, index) => (
              <Bubble key={`${id}-${index}`} message={message} />
            ))}
          </FlexColumn>
        )}
      </ScrollArea>
    </FlexColumn>
  );
};

interface ChatComposerWidgetProps {
  id: string;
  /** The workflow input the composed message is written to. */
  binding?: string;
  /** The conversation variable the user's message is appended to. */
  historyBinding?: string;
  valueFormat?: string;
  label?: string;
  placeholder?: string;
  sendLabel?: string;
  attachments?: boolean;
  events?: AppEvent[];
  disabled?: boolean;
}

interface Attachment {
  name: string;
  dataUrl: string;
}

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(str(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });

export const ChatComposerWidget: React.FC<ChatComposerWidgetProps> = ({
  id,
  binding,
  historyBinding,
  valueFormat,
  label,
  placeholder,
  sendLabel,
  attachments,
  events,
  disabled
}) => {
  const { write } = useAppRuntimeContext();
  const { setValue, emit, designMode, runnerState } = useWidgetRuntime({
    id,
    bindingMode: "write",
    binding,
    events
  });
  const historyRef = useBindingRef(historyBinding, "read");
  const historyValue = useBindingValue(historyRef);

  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isRunning = runnerState === "running" && !designMode;
  const canSend = (draft.trim().length > 0 || files.length > 0) && !isRunning;

  const send = useCallback(() => {
    const text = draft.trim();
    if (text.length === 0 && files.length === 0) return;

    const message = composeUserMessage(
      text,
      files.map((file) => file.dataUrl)
    );
    const history = [...messagesFrom(historyValue), message];
    if (historyRef) write(historyRef, history);

    setValue(
      valueFormat === "history"
        ? history
        : valueFormat === "message"
          ? message
          : text
    );
    setDraft("");
    setFiles([]);
    emit("click");
  }, [
    draft,
    emit,
    files,
    historyRef,
    historyValue,
    setValue,
    valueFormat,
    write
  ]);

  const attach = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const read = await Promise.all(
      Array.from(list).map(async (file) => ({
        name: file.name,
        dataUrl: await readAsDataUrl(file)
      }))
    );
    setFiles((previous) => [...previous, ...read]);
  };

  return (
    <FlexColumn gap={SPACING.xs} fullWidth>
      {label ? <Label>{label}</Label> : null}
      {files.length > 0 ? (
        <FlexRow gap={SPACING.sm} sx={{ flexWrap: "wrap" }}>
          {files.map((file, index) => {
            const src = resolveImageSrc(file.dataUrl);
            return (
              <FlexRow
                key={`${file.name}-${index}`}
                gap={SPACING.xs}
                align="center"
                sx={{
                  px: SPACING.sm,
                  py: SPACING.micro,
                  borderRadius: BORDER_RADIUS.md,
                  backgroundColor: "action.hover"
                }}
              >
                {src ? (
                  <Box
                    component="img"
                    src={src}
                    alt=""
                    sx={{
                      width: 28,
                      height: 28,
                      objectFit: "cover",
                      borderRadius: BORDER_RADIUS.sm
                    }}
                  />
                ) : null}
                <Caption>{file.name}</Caption>
                <EditorButton
                  size="small"
                  variant="text"
                  aria-label={`Remove ${file.name}`}
                  onClick={() =>
                    setFiles((previous) =>
                      previous.filter((_, at) => at !== index)
                    )
                  }
                >
                  ×
                </EditorButton>
              </FlexRow>
            );
          })}
        </FlexRow>
      ) : null}
      <FlexRow gap={SPACING.sm} align="flex-end" fullWidth>
        <TextInput
          value={draft}
          placeholder={placeholder ?? "Write a message…"}
          multiline
          minRows={2}
          maxRows={8}
          size="small"
          fullWidth
          disabled={disabled}
          inputProps={{ "aria-label": label || "Message" }}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setDraft(e.target.value)
          }
          onKeyDown={(e: React.KeyboardEvent) => {
            // Enter sends, Shift+Enter breaks the line — what every chat box does.
            if (e.key !== "Enter" || e.shiftKey) return;
            e.preventDefault();
            if (canSend) send();
          }}
        />
        {attachments ? (
          <>
            <Box
              component="input"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              sx={{ display: "none" }}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                void attach(e.target.files);
                e.target.value = "";
              }}
            />
            <EditorButton
              variant="outlined"
              size="small"
              disabled={disabled}
              aria-label="Attach image"
              onClick={() => fileInputRef.current?.click()}
            >
              Attach
            </EditorButton>
          </>
        ) : null}
        <EditorButton
          variant="contained"
          size="small"
          disabled={disabled || !canSend}
          onClick={send}
        >
          {isRunning ? "Sending…" : sendLabel || "Send"}
        </EditorButton>
      </FlexRow>
    </FlexColumn>
  );
};
