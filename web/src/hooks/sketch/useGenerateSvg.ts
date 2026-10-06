/**
 * Ask a language model to write the SVG for a vector layer.
 *
 * One `generate_text` call with the session's chat model, the same request
 * shape `useRefineBrief` sends. The model answers with markup; the caller
 * passes it through `prepareVectorSvg`, which strips anything an image layer
 * may not hold, so the prompt's rules only spare the model wasted output.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { rpcRequest } from "../../lib/websocket/rpcRequest";
import useGlobalChatStore from "../../stores/GlobalChatStore";

/** The answer's ceiling. Detailed illustrations need room for path data. */
export const GENERATE_SVG_MAX_TOKENS = 8192;

export const GENERATE_SVG_SYSTEM_PROMPT = [
  "You write standalone SVG documents for a vector layer in an image editor.",
  "Answer with one complete <svg> element and nothing else: no prose and no Markdown fences.",
  'Set xmlns="http://www.w3.org/2000/svg" and set width, height and viewBox to the requested size.',
  "Use shapes, paths, text, gradients, patterns, clip paths, masks and filters with presentation attributes such as fill and stroke.",
  "Do not use <style>, style attributes, <image>, <foreignObject>, scripts, animation, or external references. A url() may only point at an #id in the same document.",
  "Keep the markup compact: round coordinates and reuse definitions."
].join("\n");

export interface GenerateSvgTarget {
  width: number;
  height: number;
  /** The layer's current SVG, when the request revises an existing layer. */
  currentSvg?: string;
}

export function buildGenerateSvgPrompt(
  request: string,
  target: GenerateSvgTarget
): string {
  const lines = [
    `Size: ${target.width} × ${target.height} px.`,
    "",
    `Request: ${request.trim()}`
  ];
  if (target.currentSvg) {
    lines.push(
      "",
      "The layer currently holds the SVG below. Change it as the request asks and keep what the request does not mention. If the request describes a different image, replace it.",
      "",
      target.currentSvg
    );
  }
  return lines.join("\n");
}

/** The `<svg>…</svg>` element in a model answer, or null when there is none. */
export function extractSvgMarkup(text: string): string | null {
  const start = text.search(/<svg[\s>]/i);
  const end = text.toLowerCase().lastIndexOf("</svg>");
  if (start < 0 || end < start) {
    return null;
  }
  return text.slice(start, end + "</svg>".length);
}

/** One generation, with no React around it. Throws when no SVG comes back. */
export async function requestGeneratedSvg(
  request: string,
  target: GenerateSvgTarget,
  signal?: AbortSignal
): Promise<string> {
  if (request.trim().length === 0) {
    throw new Error("Describe the SVG to generate.");
  }
  const payload: Record<string, unknown> = {
    system: GENERATE_SVG_SYSTEM_PROMPT,
    prompt: buildGenerateSvgPrompt(request, target),
    max_tokens: GENERATE_SVG_MAX_TOKENS
  };
  // Without a chat model the keys stay off the request and the server
  // picks its default, as `useRefineBrief` does.
  const model = useGlobalChatStore.getState().selectedModel;
  if (model?.id) {
    payload.provider = model.provider;
    payload.model = model.id;
  }
  const answer = await rpcRequest("generate_text", payload, undefined, signal);
  const svg = extractSvgMarkup(typeof answer.text === "string" ? answer.text : "");
  if (!svg) {
    throw new Error("The model did not return an SVG. Try again.");
  }
  return svg;
}

export interface GenerateSvgResult {
  /** Resolves the generated markup, or null when cancelled or failed. */
  generate: (request: string, target: GenerateSvgTarget) => Promise<string | null>;
  cancel: () => void;
  generating: boolean;
  error: string | null;
  clearError: () => void;
}

export function useGenerateSvg(): GenerateSvgResult {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const cancel = useCallback(() => controllerRef.current?.abort(), []);
  useEffect(() => cancel, [cancel]);
  const clearError = useCallback(() => setError(null), []);

  const generate = useCallback(
    async (request: string, target: GenerateSvgTarget): Promise<string | null> => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setError(null);
      setGenerating(true);
      try {
        const svg = await requestGeneratedSvg(request, target, controller.signal);
        return controller.signal.aborted ? null : svg;
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
        return null;
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setGenerating(false);
        }
      }
    },
    []
  );

  return { generate, cancel, generating, error, clearError };
}

export default useGenerateSvg;
