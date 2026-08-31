// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";
import type { ImageRef, AudioRef } from "../../types.js";

// Summarizer — nodetool.agents.Summarizer
export type SummarizerInputs = {
  system_prompt?: string;
  model?: unknown;
  text?: string;
  image?: ImageRef;
  audio?: AudioRef;
  max_sentences?: number;
};

export interface SummarizerOutputs {
  text: string;
  chunk: unknown;
}

export function summarizer(inputs: SummarizerInputs): Promise<SummarizerOutputs> {
  return callNode<SummarizerOutputs>("nodetool.agents.Summarizer", inputs);
}

summarizer.stream = function (inputs: SummarizerInputs): AsyncIterable<Partial<SummarizerOutputs>> {
  return streamNode<Partial<SummarizerOutputs>>("nodetool.agents.Summarizer", inputs);
};

// Enhance Prompt — nodetool.agents.EnhancePrompt
export type EnhancePromptInputs = {
  system_prompt?: string;
  model?: unknown;
  prompt?: string;
  target?: "general" | "text" | "image" | "video" | "audio" | "code";
};

export interface EnhancePromptOutputs {
  text: string;
  chunk: unknown;
}

export function enhancePrompt(inputs: EnhancePromptInputs): Promise<EnhancePromptOutputs> {
  return callNode<EnhancePromptOutputs>("nodetool.agents.EnhancePrompt", inputs);
}

enhancePrompt.stream = function (inputs: EnhancePromptInputs): AsyncIterable<Partial<EnhancePromptOutputs>> {
  return streamNode<Partial<EnhancePromptOutputs>>("nodetool.agents.EnhancePrompt", inputs);
};

// Create Thread — nodetool.agents.CreateThread
export type CreateThreadInputs = {
  title?: string;
  thread_id?: string;
};

export interface CreateThreadOutputs {
  thread_id: string;
}

export function createThread(inputs: CreateThreadInputs): Promise<CreateThreadOutputs> {
  return callNode<CreateThreadOutputs>("nodetool.agents.CreateThread", inputs);
}

// Extractor — nodetool.agents.Extractor
export type ExtractorInputs = {
  system_prompt?: string;
  model?: unknown;
  text?: string;
  image?: ImageRef;
  audio?: AudioRef;
  max_tokens?: number;
};

export interface ExtractorOutputs {
}

export function extractor(inputs: ExtractorInputs): Promise<ExtractorOutputs> {
  return callNode<ExtractorOutputs>("nodetool.agents.Extractor", inputs);
}

// Classifier — nodetool.agents.Classifier
export type ClassifierInputs = {
  system_prompt?: string;
  model?: unknown;
  text?: string;
  image?: ImageRef;
  audio?: AudioRef;
  categories?: string[];
  max_tokens?: number;
};

export interface ClassifierOutputs {
  output: string;
}

export function classifier(inputs: ClassifierInputs): Promise<ClassifierOutputs> {
  return callNode<ClassifierOutputs>("nodetool.agents.Classifier", inputs);
}

// Agent — nodetool.agents.Agent
export type AgentInputs = {
  model?: unknown;
  system?: string;
  prompt?: string;
  tools?: unknown[];
  image?: ImageRef[];
  audio?: AudioRef[];
  history?: unknown[];
  thread_id?: string;
  max_tokens?: number;
  max_turns?: number;
};

export interface AgentOutputs {
  text: string;
  chunk: unknown;
  thinking: unknown;
  audio: AudioRef;
}

export function agent(inputs: AgentInputs): Promise<AgentOutputs> {
  return callNode<AgentOutputs>("nodetool.agents.Agent", inputs);
}

agent.stream = function (inputs: AgentInputs): AsyncIterable<Partial<AgentOutputs>> {
  return streamNode<Partial<AgentOutputs>>("nodetool.agents.Agent", inputs);
};
