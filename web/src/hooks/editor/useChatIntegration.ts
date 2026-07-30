import { useCallback, useEffect, useRef } from "react";
import type * as monaco from "monaco-editor";
import { useShallow } from "zustand/react/shallow";
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

  const {
    sendMessageFn,
    status,
    progress,
    statusMessage,
    getCurrentMessagesSync,
    selectedModel,
    setSelectedModel,
    stopGeneration,
    createNewThread
  } = useGlobalChatStore(useShallow((state) => ({
    sendMessageFn: state.sendMessage,
    status: state.status,
    progress: state.progress,
    statusMessage: state.statusMessage,
    getCurrentMessagesSync: state.getCurrentMessagesSync,
    selectedModel: state.selectedModel,
    setSelectedModel: state.setSelectedModel,
    stopGeneration: state.stopGeneration,
    createNewThread: state.createNewThread
  })));

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
The Code node runs JavaScript in a QuickJS sandbox. Only these names exist — there are no libraries and no module loader.

GLOBALS: console.log/warn/error/info, JSON, Math, Date, RegExp, Array, Object, String, Number, Boolean, Map, Set, Promise, Error, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, btoa, atob, structuredClone, TextEncoder, TextDecoder, URL, URLSearchParams

DATA:
- await data.parseCsv(text, options?) → array of records keyed by the header row; pass header false for raw rows. Handles quoted fields. Values stay strings.
- await data.selectHtml(html, selector, options?) → trimmed text of each CSS match, or the named attribute with attr. Options: attr, limit.

FORMATTING (there is no Intl; these are host calls, default locale en-US):
- await format.number(value, options?) — locale, style, currency, minimumFractionDigits, maximumFractionDigits, useGrouping
- await format.date(epochMs, options?) — locale, dateStyle, timeStyle, timeZone
- await format.relativeTime(value, unit, options?) — for example -3 with unit day
- await format.list(items, options?) — locale, type

CRYPTO AND BINARY:
- crypto.randomUUID() → string; crypto.getRandomValues(length) → Uint8Array
- await crypto.digest(algorithm, data) and await crypto.hmac(algorithm, key, data) → Uint8Array; SHA-1/256/384/512
- toBase64, fromBase64, toHex, fromHex, utf8Encode, utf8Decode — synchronous conversions between strings and Uint8Array

ASYNC APIS:
- await fetch(url, options?) → { ok, status, statusText, headers, body, json, text, bytes, arrayBuffer } — 20 calls per run, 15s timeout each, 1MB response cap. Private and loopback addresses are refused.
- await sleep(ms) — the only timer, capped at 5000ms
- await getSecret(name) → string or undefined
- uuid() → string
- progress(percent, message?) — drives the node progress bar; fire-and-forget

WORKSPACE (file I/O, needs a workspace context):
- await workspace.read(path) → string; await workspace.write(path, content)
- await workspace.readBytes(path) → Uint8Array; await workspace.writeBytes(path, bytes)
- await workspace.list(path) → string[]; await workspace.stat(path) → { size, isDirectory, isFile, modifiedMs }
- await workspace.mkdir(path); await workspace.remove(path) — one file or one empty directory
- await assetToSandbox(assetId, path) → workspace path; await sandboxToAsset(path) → asset reference

STREAMING: yield an object to emit multiple results, and use the state object to persist data across invocations.

RETURN FORMAT: Always return an object like { output: value } or { key1: val1, key2: val2 }. Each key becomes a named output port on the node.

BLOCKED: setTimeout, setInterval, eval, Function, require, import, process
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
    stopGeneration,
    createNewThread
  } as const;
}
