// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";
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
  text: OutputHandle<string>;
  chunk: OutputHandle<unknown>;
}

export function summarizer(inputs: SummarizerInputs): DslNode<SummarizerOutputs> {
  return createNode("nodetool.agents.Summarizer", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Create Thread — nodetool.agents.CreateThread
export interface CreateThreadInputs {
  title?: Connectable<string>;
  thread_id?: Connectable<string>;
}

export interface CreateThreadOutputs {
  thread_id: OutputHandle<string>;
}

export function createThread(inputs: CreateThreadInputs): DslNode<CreateThreadOutputs> {
  return createNode("nodetool.agents.CreateThread", inputs as Record<string, unknown>, { multiOutput: true });
}

// Extractor — nodetool.agents.Extractor
export interface ExtractorInputs {
  system_prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  text?: Connectable<string>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
}

export function extractor(inputs: ExtractorInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.agents.Extractor", inputs as Record<string, unknown>);
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

export function classifier(inputs: ClassifierInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.agents.Classifier", inputs as Record<string, unknown>);
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
  text: OutputHandle<string>;
  chunk: OutputHandle<unknown>;
  thinking: OutputHandle<unknown>;
  audio: OutputHandle<AudioRef>;
}

export function agent(inputs: AgentInputs): DslNode<AgentOutputs> {
  return createNode("nodetool.agents.Agent", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Control Agent — nodetool.agents.ControlAgent
export interface ControlAgentInputs {
  model?: Connectable<unknown>;
  system?: Connectable<string>;
  context?: Connectable<string>;
  schema_description?: Connectable<string>;
  max_tokens?: Connectable<number>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
}

export interface ControlAgentOutputs {
  __control_output__: OutputHandle<Record<string, unknown>>;
}

export function controlAgent(inputs: ControlAgentInputs): DslNode<ControlAgentOutputs> {
  return createNode("nodetool.agents.ControlAgent", inputs as Record<string, unknown>, { multiOutput: true });
}

// Research Agent — nodetool.agents.ResearchAgent
export interface ResearchAgentInputs {
  objective?: Connectable<string>;
  model?: Connectable<unknown>;
  system_prompt?: Connectable<string>;
  tools?: Connectable<unknown[]>;
  max_tokens?: Connectable<number>;
}

export function researchAgent(inputs: ResearchAgentInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.agents.ResearchAgent", inputs as Record<string, unknown>);
}
