// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";
import type { ImageRef, Entity } from "../../types.js";

// Load Entity — nodetool.entity.LoadEntity
export type LoadEntityInputs = {
  entity?: Entity;
  name?: string;
  kind?: string;
};

export interface LoadEntityOutputs {
  entity: Entity;
  descriptor: string;
  name: string;
  kind: string;
  reference_image: ImageRef;
  voice_id: string;
}

export function loadEntity(inputs: LoadEntityInputs): Promise<LoadEntityOutputs> {
  return callNode<LoadEntityOutputs>("nodetool.entity.LoadEntity", inputs);
}

// List Entities — nodetool.entity.ListEntities
export type ListEntitiesInputs = {
  kind?: string;
  tags?: string[];
  name_contains?: string;
  project?: string;
};

export interface ListEntitiesOutputs {
  entity: Entity;
  entities: Entity[];
}

export function listEntities(inputs: ListEntitiesInputs): Promise<ListEntitiesOutputs> {
  return callNode<ListEntitiesOutputs>("nodetool.entity.ListEntities", inputs);
}

listEntities.stream = function (inputs: ListEntitiesInputs): AsyncIterable<Partial<ListEntitiesOutputs>> {
  return streamNode<Partial<ListEntitiesOutputs>>("nodetool.entity.ListEntities", inputs);
};

// Create Entity — nodetool.entity.CreateEntity
export type CreateEntityInputs = {
  image?: ImageRef;
  kind?: string;
  name?: string;
  descriptor?: string;
  description?: string;
  tags?: string[];
  voice_id?: string;
  key?: string;
};

export interface CreateEntityOutputs {
  entity: Entity;
  created: boolean;
}

export function createEntity(inputs: CreateEntityInputs): Promise<CreateEntityOutputs> {
  return callNode<CreateEntityOutputs>("nodetool.entity.CreateEntity", inputs);
}
