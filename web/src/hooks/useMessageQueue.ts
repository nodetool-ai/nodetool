import { useState, useCallback, useEffect, useRef } from "react";
import { MessageContent } from "../stores/ApiTypes";

interface QueuedMessage {
  content: MessageContent[];
  prompt: string;
  agentMode: boolean;
}

interface UseMessageQueueOptions {
  isLoading: boolean;
  isStreaming: boolean;
  onSendMessage: (
    content: MessageContent[],
    prompt: string,
    agentMode: boolean
  ) => void;
  onStop?: () => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
}

interface UseMessageQueueReturn {
  queuedMessage: QueuedMessage | null;
  sendMessage: (
    content: MessageContent[],
    prompt: string,
    agentMode: boolean
  ) => void;
  cancelQueued: () => void;
  sendQueuedNow: () => void;
}

/**
 * Custom hook for managing message queuing in chat interfaces.
 * 
 * Handles queuing messages when a response is streaming or loading,
 * and automatically sends queued messages when the system becomes ready.
 * 
 * @param options - Configuration options
 * @returns Object containing queued message state and control functions
 * 
 * @example
 * ```typescript
 * const { queuedMessage, sendMessage, cancelQueued, sendQueuedNow } = useMessageQueue({
 *   isLoading,
 *   isStreaming,
 *   onSendMessage,
 *   onStop,
 *   textareaRef
 * });
 * 
 * // Send a message (will be queued if busy, sent immediately if ready)
 * sendMessage(content, prompt, agentMode);
 * 
 * // Cancel a queued message
 * cancelQueued();
 * 
 * // Force send queued message now (interrupts current response)
 * sendQueuedNow();
 * ```
 */
export function useMessageQueue({
  isLoading,
  isStreaming,
  onSendMessage,
  onStop,
  textareaRef
}: UseMessageQueueOptions): UseMessageQueueReturn {
  const [queuedMessage, setQueuedMessage] = useState<QueuedMessage | null>(null);
  const sendMessageRef = useRef(onSendMessage);

  // Keep the onSendMessage ref up to date
  useEffect(() => {
    sendMessageRef.current = onSendMessage;
  }, [onSendMessage]);

  const sendMessageNow = useCallback(
    (
      content: MessageContent[],
      messagePrompt: string,
      messageAgentMode: boolean
    ) => {
      sendMessageRef.current(content, messagePrompt, messageAgentMode);
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
    (
      content: MessageContent[],
      messagePrompt: string,
      messageAgentMode: boolean
    ) => {
      // Don't allow queuing if there's already a queued message
      if (queuedMessage) return;

      if (!isLoading && !isStreaming) {
        // Send immediately
        sendMessageNow(content, messagePrompt, messageAgentMode);
      } else {
        // Queue the message
        setQueuedMessage({
          content,
          prompt: messagePrompt,
          agentMode: messageAgentMode
        });
      }
    },
    [isLoading, isStreaming, queuedMessage, sendMessageNow]
  );

  // Send queued message when streaming/loading stops
  useEffect(() => {
    if (!isLoading && !isStreaming && queuedMessage) {
      const messageToSend = queuedMessage;
      setQueuedMessage(null); // Clear first to prevent re-firing
      sendMessageNow(
        messageToSend.content,
        messageToSend.prompt,
        messageToSend.agentMode
      );
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
      onStop();
      // Small delay to ensure stop is processed before sending
      setTimeout(() => {
        sendMessageNow(
          messageToSend.content,
          messageToSend.prompt,
          messageToSend.agentMode
        );
      }, 100);
    }
  }, [queuedMessage, onStop, sendMessageNow]);

  return {
    queuedMessage,
    sendMessage,
    cancelQueued,
    sendQueuedNow
  };
}
