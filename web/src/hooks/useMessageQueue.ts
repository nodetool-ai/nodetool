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
  sendMessage: (content: MessageContent[], prompt: string) => void;
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
  const pendingSendRef = useRef<QueuedMessage | null>(null);

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
    (content: MessageContent[], messagePrompt: string) => {
      // A queued message is already pending; drop this one.
      if (queuedMessage) {
        return;
      }

      if (!isLoading && !isStreaming) {
        sendMessageNow(content, messagePrompt);
      } else {
        setQueuedMessage({
          content,
          prompt: messagePrompt
        });
      }
    },
    [isLoading, isStreaming, queuedMessage, sendMessageNow]
  );

  // Send queued message when streaming/loading stops
  useEffect(() => {
    if (!isLoading && !isStreaming) {
      // Handle pending message from interrupt (sendQueuedNow)
      if (pendingSendRef.current) {
        const messageToSend = pendingSendRef.current;
        pendingSendRef.current = null;
        sendMessageNow(messageToSend.content, messageToSend.prompt);
      }
      // Handle normal queued message
      else if (queuedMessage) {
        const messageToSend = queuedMessage;
        setQueuedMessage(null); // Clear first to prevent re-firing
        sendMessageNow(messageToSend.content, messageToSend.prompt);
      }
    }
  }, [isLoading, isStreaming, queuedMessage, sendMessageNow]);

  const cancelQueued = useCallback(() => {
    setQueuedMessage(null);
  }, []);

  const sendQueuedNow = useCallback(() => {
    if (queuedMessage && onStop) {
      // Capture message and clear queue BEFORE stopping to prevent useEffect race
      const messageToSend = queuedMessage;
      setQueuedMessage(null);
      // Store in pendingSendRef to be sent when stream stops
      pendingSendRef.current = messageToSend;
      onStop();
    }
  }, [queuedMessage, onStop]);

  return {
    queuedMessage,
    sendMessage,
    cancelQueued,
    sendQueuedNow
  };
}
