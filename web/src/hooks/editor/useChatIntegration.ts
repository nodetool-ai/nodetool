import { useCallback, useEffect, useRef } from "react";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import type {
  MessageContent,
  LanguageModel,
  Message
} from "../../stores/ApiTypes";

export function useChatIntegration(params: {
  isCodeEditor: boolean;
  monacoRef: React.MutableRefObject<any>;
  getSelectedTextFnRef: React.MutableRefObject<(() => string) | null>;
  replaceSelectionFnRef: React.MutableRefObject<
    ((text: string) => void) | null
  >;
  setAllTextFnRef: React.MutableRefObject<((text: string) => void) | null>;
  setCurrentText: (text: string) => void;
  currentText: string;
}) {
  const {
    isCodeEditor,
    monacoRef,
    getSelectedTextFnRef,
    replaceSelectionFnRef,
    setAllTextFnRef,
    setCurrentText,
    currentText
  } = params;

  const sendMessageFn = useGlobalChatStore((state) => state.sendMessage);
  const status = useGlobalChatStore((state) => state.status);
  const progress = useGlobalChatStore((state) => state.progress);
  const statusMessage = useGlobalChatStore((state) => state.statusMessage);
  const getCurrentMessagesSync = useGlobalChatStore(
    (state) => state.getCurrentMessagesSync
  );
  const _currentThreadId = useGlobalChatStore((state) => state.currentThreadId);
  const selectedModel = useGlobalChatStore((state) => state.selectedModel);
  const setSelectedModel = useGlobalChatStore(
    (state) => state.setSelectedModel
  );
  const selectedTools = useGlobalChatStore((state) => state.selectedTools);
  const selectedCollections = useGlobalChatStore(
    (state) => state.selectedCollections
  );
  const stopGeneration = useGlobalChatStore((state) => state.stopGeneration);
  const createNewThread = useGlobalChatStore((state) => state.createNewThread);

  const sendMessage = useCallback(
    async (message: Message) => {
      if (typeof message.content === "string") {
        message.content =
          "<context>" + currentText + "</context>\n\n" + message.content;
      } else if (Array.isArray(message.content)) {
        message.content = message.content.map((content) => {
          if (content.type === "text") {
            return {
              ...content,
              text: "<context>" + currentText + "</context>\n\n" + content.text
            };
          }
          return content;
        });
      }
      await sendMessageFn(message);
    },
    [sendMessageFn, currentText]
  );

  // Connection is now handled automatically by GlobalWebSocketManager

  const improvePendingRef = useRef<{
    active: boolean;
    baseCount: number;
    hadSelection: boolean;
    isCodeEditor: boolean;
    monacoRange: any | null;
  }>({
    active: false,
    baseCount: 0,
    hadSelection: false,
    isCodeEditor: false,
    monacoRange: null
  });

  const handleAITransform = useCallback(
    async (instruction: string, options?: { shouldReplace?: boolean }) => {
      const shouldReplace = options?.shouldReplace ?? true;

      let selected = "";
      let hadSelection = false;
      let monacoRange: any | null = null;
      if (isCodeEditor && monacoRef.current) {
        try {
          const editor = monacoRef.current;
          const selection = editor.getSelection();
          if (selection) {
            selected = editor.getModel().getValueInRange(selection) || "";
            hadSelection = !!selected && selected.trim().length > 0;
            monacoRange = selection;
          }
        } catch {
          /* empty */
        }
      } else if (getSelectedTextFnRef.current) {
        try {
          selected = getSelectedTextFnRef.current() || "";
          hadSelection = !!selected && selected.trim().length > 0;
        } catch {
          /* empty */
        }
      }

      const textToProcess =
        selected && selected.trim().length > 0 ? selected : currentText;
      if (!textToProcess || textToProcess.trim().length === 0) {
        return;
      }

      const composed = `${instruction}\n\n${textToProcess}`;
      const content: MessageContent[] = [
        { type: "text", text: composed } as MessageContent
      ];

      try {
        const baseCount = getCurrentMessagesSync().length || 0;
        if (shouldReplace) {
          improvePendingRef.current = {
            active: true,
            baseCount,
            hadSelection,
            isCodeEditor,
            monacoRange
          };
        }
        await sendMessage({
          type: "message",
          name: "",
          role: "user",
          provider: (selectedModel as any)?.provider,
          model: (selectedModel as any)?.id,
          content,
          tools: selectedTools.length > 0 ? selectedTools : undefined,
          collections:
            selectedCollections.length > 0 ? selectedCollections : undefined,
          agent_mode: false,
          help_mode: false,
          workflow_assistant: true
        } as any);
      } catch {
        /* empty */
      }
    },
    [
      isCodeEditor,
      monacoRef,
      getSelectedTextFnRef,
      currentText,
      sendMessage,
      selectedModel,
      selectedTools,
      selectedCollections,
      getCurrentMessagesSync
    ]
  );

  // Subscribe to assistant responses to apply replacements
  useEffect(() => {
    const unsubscribe = useGlobalChatStore.subscribe((state) => {
      const pending = improvePendingRef.current;
      if (!pending.active) {
        return;
      }

      const threadId = state.currentThreadId;
      if (!threadId) {
        return;
      }
      const messages = state.messageCache?.[threadId] || [];
      if (messages.length <= pending.baseCount) {
        return;
      }
      if (state.status === "streaming") {
        return;
      }

      const last = messages[messages.length - 1];
      if (!last || last.role !== "assistant") {
        return;
      }

      let responseText = "";
      const content = last.content as any;
      if (typeof content === "string") {
        responseText = content;
      } else if (Array.isArray(content)) {
        const textItem = content.find((c: any) => c?.type === "text");
        responseText = textItem?.text || "";
      }
      if (!responseText) {
        return;
      }

      if (pending.isCodeEditor && monacoRef.current) {
        const editor = monacoRef.current;
        try {
          if (pending.hadSelection && pending.monacoRange) {
            editor.executeEdits("improve-replace", [
              {
                range: pending.monacoRange,
                text: responseText,
                forceMoveMarkers: true
              }
            ]);
          } else {
            editor.setValue(responseText);
          }
          editor.focus();
        } catch {
          /* empty */
        }
      } else {
        if (pending.hadSelection && replaceSelectionFnRef.current) {
          replaceSelectionFnRef.current(responseText);
        } else if (setAllTextFnRef.current) {
          setAllTextFnRef.current(responseText);
        } else {
          setCurrentText(responseText);
        }
      }

      improvePendingRef.current.active = false;
    });
    return () => {
      try {
        unsubscribe?.();
      } catch {
        /* empty */
      }
    };
  }, [monacoRef, replaceSelectionFnRef, setAllTextFnRef, setCurrentText]);

  return {
    handleAITransform,
    status,
    progress,
    statusMessage,
    getCurrentMessagesSync,
    sendMessage,
    selectedModel: (selectedModel as LanguageModel) || null,
    setSelectedModel,
    selectedTools,
    selectedCollections,
    stopGeneration,
    createNewThread
  } as const;
}
