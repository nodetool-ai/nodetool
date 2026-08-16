import { useCallback, useEffect, useRef } from "react";
import type * as monaco from "monaco-editor";
import { useShallow } from "zustand/react/shallow";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { useChatViewThread } from "../chat/useChatViewThread";
import type {
  MessageContent,
  Message
} from "../../stores/ApiTypes";
import { setEditorAdapter } from "../../lib/tools/builtin/editorTools";
import { isString } from "../../utils/typePredicates";

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

  const { selectedModel, setSelectedModel, createThread } = useGlobalChatStore(
    useShallow((state) => ({
      selectedModel: state.selectedModel,
      setSelectedModel: state.setSelectedModel,
      createThread: state.createNewThread
    }))
  );
  const {
    threadId,
    messages,
    runtime,
    selectThread,
    sendMessage: sendThreadMessage,
    stopGeneration
  } = useChatViewThread();

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
The Code node runs JavaScript in a QuickJS sandbox. Only these names exist, plus the sandbox packages the node declares in its packages property — nothing else can be imported.

GLOBALS: console.log/warn/error/info, JSON, Math, Date, RegExp, Array, Object, String, Number, Boolean, Map, Set, Promise, Error, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, btoa, atob, structuredClone, TextEncoder, TextDecoder, URL, URLSearchParams

LIBRARIES ARE IMPORTS, NOT GLOBALS:
CSV, HTML, XML, XLSX, YAML, zip, dates and diffs each live in a sandbox package — @nodetool-ai/sandbox-csv, -html, -xml, -xlsx, -yaml, -zip, -dates, -diff. Declare the package in the node's packages property and import it at the top of the body; a package the node does not declare never resolves. Every export of a host-backed package is async, so await it.

FORMATTING (there is no Intl; these are host calls, default locale en-US):
- await format.number(value, options?) — locale, style, currency, minimumFractionDigits, maximumFractionDigits, useGrouping
- await format.date(epochMs, options?) — locale, dateStyle, timeStyle, timeZone
- await format.relativeTime(value, unit, options?) — for example -3 with unit day
- await format.list(items, options?) — locale, type

CRYPTO AND BINARY:
- crypto.randomUUID() → string; crypto.getRandomValues(length) → Uint8Array
- await crypto.digest(algorithm, data) and await crypto.hmac(algorithm, key, data) → Uint8Array; SHA-1/256/384/512
- toBase64, fromBase64, toHex, fromHex — synchronous conversions between strings/bytes; TextEncoder and TextDecoder are native for UTF-8

ASYNC APIS:
- await fetch(url, options?) → { ok, status, statusText, headers, body, json, text, bytes, arrayBuffer } — 20 calls per run, 15s timeout each, 1MB response cap. Private and loopback addresses are refused.
- Bridge calls run in parallel: Promise.all over several fetch calls takes one round trip, not one per call.
- await parallelMap(items, fn, concurrency?) → results in input order — bounded fan-out, concurrency default 5. The way to fetch many URLs.
- await sleep(ms) — the only timer, capped at 5000ms
- await getSecret(name) → string or undefined
- progress(percent, message?) — drives the node progress bar; fire-and-forget

IMAGES (encoded bytes in, encoded bytes out, so calls chain; png, jpeg, webp, avif):
- await image.info(bytes) → { width, height, format, byteLength }
- await image.resize(bytes, options) — width, height, fit (cover, contain, fill); one dimension keeps the aspect ratio
- await image.crop(bytes, options) — x, y, width, height
- await image.rotate(bytes, degrees, options?) — grows the canvas to the rotated bounding box
- await image.flip(bytes, options?) — horizontal (default true), vertical
- await image.adjust(bytes, options) — brightness, contrast, saturate, grayscale, sepia, invert, blur, hueRotate, opacity
- await image.composite(bytes, layers, options?) — layer: image, x, y, width, height, opacity, blendMode
- await image.convert(image, options) — format, quality; await image.blank(w, h, {color}) for a backdrop, await image.grid([...]) to combine, await image.stats(image) to inspect, await image.decode(image) for raw RGBA

CANVAS (drawing):
- createCanvas(width, height) → a surface; getContext with "2d" gives a Canvas 2D context
- The context takes the usual calls synchronously: fillRect, strokeRect, arc, ellipse, roundRect, fillText, drawImage, createLinearGradient, save, translate, rotate, and the usual properties
- drawImage takes image bytes, not an image object
- awaiting toBytes on the surface renders and returns the encoded image — options: format, quality, background
- await canvas.measureText(text, font?) → text metrics, for laying text out before drawing it

WORKSPACE (file I/O, needs a workspace context):
- await workspace.read(path) → string; await workspace.write(path, content)
- await workspace.readBytes(path) → Uint8Array; await workspace.writeBytes(path, bytes)
- await workspace.list(path) → string[]; await workspace.stat(path) → { size, isDirectory, isFile, modifiedMs }
- await workspace.mkdir(path); await workspace.remove(path) — one file or one empty directory
- await assetToSandbox(assetId, path) → workspace path; await sandboxToAsset(path) → asset reference

STREAMING: yield an object to emit multiple results, and use the state object to persist data across invocations.

RETURN FORMAT: Always return an object like { output: value } or { key1: val1, key2: val2 }. Each key becomes a named output port on the node.

BLOCKED: setTimeout, setInterval, setImmediate, eval, Function, require, import, process
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
      if (isString(message.content)) {
        message.content = ctx + "\n\n" + message.content;
      } else if (Array.isArray(message.content)) {
        message.content = message.content.map((content) => {
          if (content.type === "text") {
            return { ...content, text: ctx + "\n\n" + content.text };
          }
          return content;
        });
      }
      await sendThreadMessage(message);
    },
    [sendThreadMessage, buildContext]
  );

  const createNewThread = useCallback(async () => {
    const id = await createThread();
    selectThread(id);
    return id;
  }, [createThread, selectThread]);

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
        const baseCount = messages.length;
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
      messages.length
    ]
  );

  // Subscribe to assistant responses to apply replacements
  useEffect(() => {
    const unsubscribe = useGlobalChatStore.subscribe((state) => {
      const pending = improvePendingRef.current;
      if (!pending.active) {
        return;
      }

      if (!threadId) {
        return;
      }
      const messages = state.messageCache?.[threadId] || [];
      if (messages.length <= pending.baseCount) {
        return;
      }
      if (state.threadRuntime[threadId]?.status === "streaming") {
        return;
      }

      const last = messages[messages.length - 1];
      if (!last || last.role !== "assistant") {
        return;
      }

      let responseText = "";
      const content = last.content;
      if (isString(content)) {
        responseText = content;
      } else if (Array.isArray(content)) {
        const textItem = content.find(
          (c) => (c as { type?: string }).type === "text"
        );
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
  }, [
    threadId,
    monacoRef,
    replaceSelectionFnRef,
    setAllTextFnRef,
    setCurrentText
  ]);

  return {
    handleAITransform,
    threadId,
    messages,
    runtime,
    sendMessage,
    selectedModel: selectedModel || null,
    setSelectedModel,
    stopGeneration,
    createNewThread
  } as const;
}
