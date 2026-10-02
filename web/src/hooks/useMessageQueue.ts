import { useState, useCallback, useEffect, useRef } from "react";
import { MessageContent } from "../stores/ApiTypes";
import { useAutoFocusEnabled } from "./useAutoFocusEnabled";

interface QueuedMessage {
  content: MessageContent[];
  prompt: string;
}

interface UseMessageQueueOptions {
  isLoading: boolean;
  isStreaming: boolean;
  onSendMessage: (
    content: MessageContent[],
    prompt: string
  ) => void | boolean | Promise<void | boolean>;
  onStop?: () => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

interface UseMessageQueueReturn {
  queuedMessage: QueuedMessage | null;
  /**
   * Send or queue a message. Returns `true` when the message was sent or
   * queued, `false` when a send failed or another turn is already pending.
   * The caller keeps its prompt and attachments until this resolves.
   */
  sendMessage: (content: MessageContent[], prompt: string) => Promise<boolean>;
  cancelQueued: () => void;
  sendQueuedNow: () => void;
}

/** Manage message queuing in chat interfaces. */
export function useMessageQueue({
  isLoading,
  isStreaming,
  onSendMessage,
  onStop,
  textareaRef
}: UseMessageQueueOptions): UseMessageQueueReturn {
  const [queuedMessage, setQueuedMessage] = useState<QueuedMessage | null>(
    null
  );
  const sendMessageRef = useRef(onSendMessage);
  const sending = useRef(false);
  const attemptedQueuedMessage = useRef<QueuedMessage | null>(null);
  const keepFocusAfterSend = useAutoFocusEnabled();

  useEffect(() => {
    sendMessageRef.current = onSendMessage;
  }, [onSendMessage]);

  const sendMessageNow = useCallback(
    async (
      content: MessageContent[],
      messagePrompt: string
    ): Promise<boolean> => {
      if (sending.current) {
        return false;
      }
      sending.current = true;
      try {
        const accepted = sendMessageRef.current(content, messagePrompt);
        if (textareaRef?.current && keepFocusAfterSend) {
          // Keep focus in the textarea after sending
          requestAnimationFrame(() => {
            textareaRef.current?.focus();
          });
        } else if (textareaRef?.current) {
          // On touch the focus holds the virtual keyboard open over the reply that
          // just started streaming. Drop it synchronously so the dismissal still
          // rides the send gesture (iOS Safari ignores a deferred blur).
          textareaRef.current.blur();
        }
        return (await accepted) !== false;
      } catch {
        // The sending surface reports the error. Keep the draft for retry.
        return false;
      } finally {
        sending.current = false;
      }
    },
    [textareaRef, keepFocusAfterSend]
  );

  const sendMessage = useCallback(
    async (
      content: MessageContent[],
      messagePrompt: string
    ): Promise<boolean> => {
      // A queued message is already pending; drop this one and report it so
      // the caller does not clear the prompt/attachments it still holds.
      if (queuedMessage || sending.current) {
        return false;
      }

      if (!isLoading && !isStreaming) {
        return sendMessageNow(content, messagePrompt);
      } else {
        setQueuedMessage({
          content,
          prompt: messagePrompt
        });
      }
      return true;
    },
    [isLoading, isStreaming, queuedMessage, sendMessageNow]
  );

  const sendQueued = useCallback(
    async (message: QueuedMessage) => {
      attemptedQueuedMessage.current = message;
      if (await sendMessageNow(message.content, message.prompt)) {
        setQueuedMessage((current) => (current === message ? null : current));
      }
    },
    [sendMessageNow]
  );

  // Attempt each queued turn once automatically. A failed turn stays available
  // for an explicit retry instead of repeatedly reconnecting on every render.
  useEffect(() => {
    if (
      !isLoading &&
      !isStreaming &&
      queuedMessage &&
      attemptedQueuedMessage.current !== queuedMessage
    ) {
      void sendQueued(queuedMessage);
    }
  }, [isLoading, isStreaming, queuedMessage, sendQueued]);

  const cancelQueued = useCallback(() => {
    setQueuedMessage(null);
  }, []);

  const sendQueuedNow = useCallback(() => {
    if (queuedMessage && ((!isLoading && !isStreaming) || onStop)) {
      if (isLoading || isStreaming) {
        onStop?.();
      }
      void sendQueued(queuedMessage);
    }
  }, [queuedMessage, onStop, isLoading, isStreaming, sendQueued]);

  return {
    queuedMessage,
    sendMessage,
    cancelQueued,
    sendQueuedNow
  };
}
