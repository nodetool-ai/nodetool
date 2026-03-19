// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, AudioRef } from "../types.js";

// Summarizer — nodetool.agents.Summarizer
export interface SummarizerInputs {
  system_prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  text?: Connectable<string>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
}

export interface SummarizerOutputs {
  text: string;
  chunk: unknown;
}

export function summarizer(inputs: SummarizerInputs): DslNode<SummarizerOutputs> {
  return createNode("nodetool.agents.Summarizer", inputs as Record<string, unknown>, { outputNames: ["text", "chunk"], streaming: true });
}

// Create Thread — nodetool.agents.CreateThread
export interface CreateThreadInputs {
  title?: Connectable<string>;
  thread_id?: Connectable<string>;
}

export interface CreateThreadOutputs {
  thread_id: string;
}

export function createThread(inputs: CreateThreadInputs): DslNode<CreateThreadOutputs, "thread_id"> {
  return createNode("nodetool.agents.CreateThread", inputs as Record<string, unknown>, { outputNames: ["thread_id"], defaultOutput: "thread_id" });
}

// Extractor — nodetool.agents.Extractor
export interface ExtractorInputs {
  system_prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  text?: Connectable<string>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
}

export interface ExtractorOutputs {
}

export function extractor(inputs: ExtractorInputs): DslNode<ExtractorOutputs> {
  return createNode("nodetool.agents.Extractor", inputs as Record<string, unknown>, { outputNames: [] });
}

// Classifier — nodetool.agents.Classifier
export interface ClassifierInputs {
  system_prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  text?: Connectable<string>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  categories?: Connectable<string[]>;
}

export interface ClassifierOutputs {
  output: string;
}

export function classifier(inputs: ClassifierInputs): DslNode<ClassifierOutputs, "output"> {
  return createNode("nodetool.agents.Classifier", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Agent — nodetool.agents.Agent
export interface AgentInputs {
  model?: Connectable<unknown>;
  system?: Connectable<string>;
  prompt?: Connectable<string>;
  tools?: Connectable<unknown[]>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  history?: Connectable<unknown[]>;
  thread_id?: Connectable<string>;
  max_tokens?: Connectable<number>;
}

export interface AgentOutputs {
  text: string;
  chunk: unknown;
  thinking: unknown;
  audio: AudioRef;
}

export function agent(inputs: AgentInputs): DslNode<AgentOutputs> {
  return createNode("nodetool.agents.Agent", inputs as Record<string, unknown>, { outputNames: ["text", "chunk", "thinking", "audio"], streaming: true });
}

// Research Agent — nodetool.agents.ResearchAgent
export interface ResearchAgentInputs {
  objective?: Connectable<string>;
  model?: Connectable<unknown>;
  system_prompt?: Connectable<string>;
  tools?: Connectable<unknown[]>;
  max_tokens?: Connectable<number>;
}

export interface ResearchAgentOutputs {
}

export function researchAgent(inputs: ResearchAgentInputs): DslNode<ResearchAgentOutputs> {
  return createNode("nodetool.agents.ResearchAgent", inputs as Record<string, unknown>, { outputNames: [] });
}
