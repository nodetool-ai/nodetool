import { useCallback, useEffect, useRef } from "react";
import type * as monaco from "monaco-editor";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import type {
  MessageContent,
  LanguageModel,
  Message
} from "../../stores/ApiTypes";
import { setEditorAdapter } from "../../lib/tools/builtin/editorTools";

export function useChatIntegration(params: {
  isCodeEditor: boolean;
  language?: string;
  nodeType?: string;
  monacoRef: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  getSelectedTextFnRef: React.MutableRefObject<(() => string) | null>;
  replaceSelectionFnRef: React.MutableRefObject<
    ((text: string) => void) | null
  >;
  setAllTextFnRef: React.MutableRefObject<((text: string) => void) | null>;
  insertTextFnRef?: React.MutableRefObject<((text: string) => void) | null>;
  setCurrentText: (text: string) => void;
  currentText: string;
}) {
  const {
    isCodeEditor,
    language = "",
    nodeType = "",
    monacoRef,
    getSelectedTextFnRef,
    replaceSelectionFnRef,
    setAllTextFnRef,
    insertTextFnRef,
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

  // Register editor adapter so frontend tools can read/edit the document
  useEffect(() => {
    const getContent = () => {
      if (isCodeEditor && monacoRef.current) {
        return monacoRef.current.getValue?.() ?? currentText;
      }
      return currentText;
    };

    const getSelection = () => {
      if (isCodeEditor && monacoRef.current) {
        try {
          const editor = monacoRef.current;
          const sel = editor.getSelection?.();
          return sel ? (editor.getModel?.()?.getValueInRange(sel) ?? "") : "";
        } catch {
          return "";
        }
      }
      return getSelectedTextFnRef.current?.() ?? "";
    };

    const replaceAll = (text: string) => {
      if (isCodeEditor && monacoRef.current) {
        monacoRef.current.setValue(text);
        monacoRef.current.focus?.();
      } else {
        setAllTextFnRef.current?.(text);
        setCurrentText(text);
      }
    };

    const replaceSelection = (text: string) => {
      if (isCodeEditor && monacoRef.current) {
        const editor = monacoRef.current;
        const sel = editor.getSelection?.();
        if (sel) {
          editor.executeEdits("ui-tool", [
            { range: sel, text, forceMoveMarkers: true }
          ]);
          editor.focus?.();
        } else {
          replaceAll(text);
        }
      } else {
        if (replaceSelectionFnRef.current) {
          replaceSelectionFnRef.current(text);
        } else if (setAllTextFnRef.current) {
          setAllTextFnRef.current(text);
        } else {
          setCurrentText(text);
        }
      }
    };

    const insert = (text: string) => {
      if (isCodeEditor && monacoRef.current) {
        const editor = monacoRef.current;
        const sel = editor.getSelection?.();
        if (sel) {
          editor.executeEdits("ui-tool", [
            { range: sel, text, forceMoveMarkers: true }
          ]);
          editor.focus?.();
        }
      } else {
        insertTextFnRef?.current?.(text);
      }
    };

    setEditorAdapter({
      getContent,
      getSelection,
      replaceAll,
      replaceSelection,
      insert,
      language: language || "text"
    });

    return () => setEditorAdapter(null);
  }, [
    isCodeEditor,
    language,
    monacoRef,
    currentText,
    getSelectedTextFnRef,
    replaceSelectionFnRef,
    setAllTextFnRef,
    insertTextFnRef,
    setCurrentText
  ]);

  const buildContext = useCallback(() => {
    const lines = currentText.split("\n").length;
    const langLabel = language || "text";
    const nodeLabel = nodeType ? ` (node: ${nodeType})` : "";
    const isCode = language === "javascript" || language === "typescript";
    const sandboxDocs = isCode
      ? `\n<sandbox_api>
The Code node runs JavaScript in a sandboxed VM with these APIs:

GLOBALS: console.log/warn/error/info, JSON, Math, Date, RegExp, Array, Object, String, Number, Boolean, Map, Set, Promise, Error, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, btoa, atob, structuredClone, TextEncoder, TextDecoder, URL, URLSearchParams

LIBRARIES:
- _ (lodash): full lodash-es library. Use _.get, _.groupBy, _.chunk, _.sortBy, _.pick, _.omit, _.mapValues, etc.
- dayjs(date?) — lightweight date library. dayjs().add(7,"day").format("YYYY-MM-DD"), dayjs("2024-01-01").diff(dayjs(),"days"), .startOf("month"), .isBefore(), .isAfter()
- cheerio — jQuery-like HTML parser. const $ = cheerio.load(html); $("a").map((i,el) => $(el).attr("href")).get(); $("table tr").each(...)
- csvParse(text, {columns:true, skip_empty_lines:true}) — robust CSV parser that handles quoted fields, returns array of objects
- validator — string validation: validator.isEmail(s), validator.isURL(s), validator.isIP(s), validator.isUUID(s), validator.isJSON(s), validator.isMobilePhone(s), validator.isPostalCode(s,"US"), etc.

ASYNC APIS:
- fetch(url, options?) → { ok, status, statusText, headers, body, json } — limited to 20 calls, 15s timeout each, 1MB response limit
- sleep(ms) → Promise — capped at 5000ms
- getSecret(name) → Promise<string|undefined> — read secrets by name
- uuid() → string — generate a UUID v4

WORKSPACE (file I/O):
- workspace.read(path) → Promise<string>
- workspace.write(path, content) → Promise<void>
- workspace.list(path) → Promise<string[]>

STREAMING: Use yield({ output: value }) to emit multiple results. Use state.xxx to persist data across stream invocations.

RETURN FORMAT: Always return an object like { output: value } or { key1: val1, key2: val2 }. Each key becomes a named output port on the node.

BLOCKED: setTimeout, setInterval, eval, require, import, process, __dirname, __filename
</sandbox_api>`
      : "";
    return (
      `<editor_context>\n` +
      `language: ${langLabel}${nodeLabel}\n` +
      `lines: ${lines}${sandboxDocs}\n` +
      `<document>\n${currentText}\n</document>\n` +
      `</editor_context>`
    );
  }, [currentText, language, nodeType]);

  const sendMessage = useCallback(
    async (message: Message) => {
      const ctx = buildContext();
      if (typeof message.content === "string") {
        message.content = ctx + "\n\n" + message.content;
      } else if (Array.isArray(message.content)) {
        message.content = message.content.map((content) => {
          if (content.type === "text") {
            return { ...content, text: ctx + "\n\n" + content.text };
          }
          return content;
        });
      }
      await sendMessageFn(message);
    },
    [sendMessageFn, buildContext]
  );

  // Connection is now handled automatically by GlobalWebSocketManager

  const improvePendingRef = useRef<{
    active: boolean;
    baseCount: number;
    hadSelection: boolean;
    isCodeEditor: boolean;
    monacoRange: monaco.Selection | null;
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
      let monacoRange: monaco.Selection | null = null;
      if (isCodeEditor && monacoRef.current) {
        try {
          const editor = monacoRef.current;
          const selection = editor.getSelection();
          const model = editor.getModel();
          if (selection && model) {
            selected = model.getValueInRange(selection) || "";
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
          provider: selectedModel?.provider,
          model: selectedModel?.id,
          content,
          tools: selectedTools.length > 0 ? selectedTools : undefined,
          collections:
            selectedCollections.length > 0 ? selectedCollections : undefined,
          agent_mode: false,
          help_mode: false,
          workflow_assistant: true
        } as Message);
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
      const content = last.content;
      if (typeof content === "string") {
        responseText = content;
      } else if (Array.isArray(content)) {
        const textItem = content.find((c) => (c as { type?: string }).type === "text");
        responseText = (textItem as { text?: string } | undefined)?.text || "";
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
