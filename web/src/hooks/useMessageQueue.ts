import { useState, useCallback, useEffect, useRef } from "react";
import { MessageContent } from "../stores/ApiTypes";

interface QueuedMessage {
  content: MessageContent[];
  prompt: string;
}

interface UseMessageQueueOptions {
  isLoading: boolean;
  isStreaming: boolean;
  onSendMessage: (content: MessageContent[], prompt: string) => void;
  onStop?: () => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

interface UseMessageQueueReturn {
  queuedMessage: QueuedMessage | null;
  /**
   * Send or queue a message. Returns `true` when the message was sent or
   * queued, `false` when it was dropped because one is already queued (so the
   * caller can keep the prompt/attachments instead of clearing them).
   */
  sendMessage: (content: MessageContent[], prompt: string) => boolean;
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
  const [queuedMessage, setQueuedMessage] = useState<QueuedMessage | null>(null);
  const sendMessageRef = useRef(onSendMessage);

  useEffect(() => {
    sendMessageRef.current = onSendMessage;
  }, [onSendMessage]);

  const sendMessageNow = useCallback(
    (content: MessageContent[], messagePrompt: string) => {
      sendMessageRef.current(content, messagePrompt);
      // Keep focus in the textarea after sending
      if (textareaRef?.current) {
        requestAnimationFrame(() => {
          textareaRef.current?.focus();
        });
      }
    },
    [textareaRef]
  );

  const sendMessage = useCallback(
    (content: MessageContent[], messagePrompt: string): boolean => {
      // A queued message is already pending; drop this one and report it so
      // the caller does not clear the prompt/attachments it still holds.
      if (queuedMessage) {
        return false;
      }

      if (!isLoading && !isStreaming) {
        sendMessageNow(content, messagePrompt);
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

  // Send queued message when streaming/loading stops
  useEffect(() => {
    if (!isLoading && !isStreaming && queuedMessage) {
      const messageToSend = queuedMessage;
      setQueuedMessage(null);
      sendMessageNow(messageToSend.content, messageToSend.prompt);
    }
  }, [isLoading, isStreaming, queuedMessage, sendMessageNow]);

  const cancelQueued = useCallback(() => {
    setQueuedMessage(null);
  }, []);

  const sendQueuedNow = useCallback(() => {
    if (queuedMessage && onStop) {
      const messageToSend = queuedMessage;
      setQueuedMessage(null);
      onStop();
      sendMessageNow(messageToSend.content, messageToSend.prompt);
    }
  }, [queuedMessage, onStop, sendMessageNow]);

  return {
    queuedMessage,
    sendMessage,
    cancelQueued,
    sendQueuedNow
  };
}
