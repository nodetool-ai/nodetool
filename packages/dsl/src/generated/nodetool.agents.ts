// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, AudioRef } from "../types.js";

// Summarizer — nodetool.agents.Summarizer
export type SummarizerInputs = {
  system_prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  text?: Connectable<string>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  max_sentences?: Connectable<number>;
};

export interface SummarizerOutputs {
  text: string;
  chunk: unknown;
}

export function summarizer(inputs: SummarizerInputs): DslNode<SummarizerOutputs> {
  return createNode("nodetool.agents.Summarizer", inputs, { outputNames: ["text", "chunk"], streaming: true });
}

// Enhance Prompt — nodetool.agents.EnhancePrompt
export type EnhancePromptInputs = {
  system_prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  target?: Connectable<"general" | "text" | "image" | "video" | "audio" | "code">;
};

export interface EnhancePromptOutputs {
  text: string;
  chunk: unknown;
}

export function enhancePrompt(inputs: EnhancePromptInputs): DslNode<EnhancePromptOutputs> {
  return createNode("nodetool.agents.EnhancePrompt", inputs, { outputNames: ["text", "chunk"], streaming: true });
}

// Create Thread — nodetool.agents.CreateThread
export type CreateThreadInputs = {
  title?: Connectable<string>;
  thread_id?: Connectable<string>;
};

export interface CreateThreadOutputs {
  thread_id: string;
}

export function createThread(inputs: CreateThreadInputs): DslNode<CreateThreadOutputs, "thread_id"> {
  return createNode("nodetool.agents.CreateThread", inputs, { outputNames: ["thread_id"], defaultOutput: "thread_id" });
}

// Extractor — nodetool.agents.Extractor
export type ExtractorInputs = {
  system_prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  text?: Connectable<string>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  max_tokens?: Connectable<number>;
};

export interface ExtractorOutputs {
}

export function extractor(inputs: ExtractorInputs): DslNode<ExtractorOutputs> {
  return createNode("nodetool.agents.Extractor", inputs, { outputNames: [] });
}

// Classifier — nodetool.agents.Classifier
export type ClassifierInputs = {
  system_prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  text?: Connectable<string>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  categories?: Connectable<string[]>;
  max_tokens?: Connectable<number>;
};

export interface ClassifierOutputs {
  output: string;
}

export function classifier(inputs: ClassifierInputs): DslNode<ClassifierOutputs, "output"> {
  return createNode("nodetool.agents.Classifier", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Agent — nodetool.agents.Agent
export type AgentInputs = {
  model?: Connectable<unknown>;
  system?: Connectable<string>;
  prompt?: Connectable<string>;
  tools?: Connectable<unknown[]>;
  image?: Connectable<ImageRef[]>;
  audio?: Connectable<AudioRef[]>;
  history?: Connectable<unknown[]>;
  thread_id?: Connectable<string>;
  max_tokens?: Connectable<number>;
  max_turns?: Connectable<number>;
  cost_cap_usd?: Connectable<number>;
  timeout_s?: Connectable<number>;
};

export interface AgentOutputs {
  text: string;
  chunk: unknown;
  thinking: unknown;
  audio: AudioRef;
}

export function agent(inputs: AgentInputs): DslNode<AgentOutputs> {
  return createNode("nodetool.agents.Agent", inputs, { outputNames: ["text", "chunk", "thinking", "audio"], streaming: true });
}
