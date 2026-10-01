// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef, Entity } from "../types.js";

// Load Entity — nodetool.entity.LoadEntity
export type LoadEntityInputs = {
  entity?: Connectable<Entity>;
  name?: Connectable<string>;
  kind?: Connectable<string>;
};

export interface LoadEntityOutputs {
  entity: Entity;
  descriptor: string;
  name: string;
  kind: string;
  reference_image: ImageRef;
  voice_id: string;
}

export function loadEntity(inputs: LoadEntityInputs, options?: NodeOptions): NodeWithOutputs<LoadEntityOutputs> {
  return createNode("nodetool.entity.LoadEntity", inputs, { id: options?.id, outputNames: ["entity", "descriptor", "name", "kind", "reference_image", "voice_id"], outputTypes: {"entity":"entity","descriptor":"str","name":"str","kind":"str","reference_image":"image","voice_id":"str"} });
}

// List Entities — nodetool.entity.ListEntities
export type ListEntitiesInputs = {
  kind?: Connectable<string>;
  tags?: Connectable<string[]>;
  name_contains?: Connectable<string>;
  project?: Connectable<string>;
};

export interface ListEntitiesOutputs {
  entity: Entity;
  entities: Entity[];
}

export function listEntities(inputs: ListEntitiesInputs, options?: NodeOptions): NodeWithOutputs<ListEntitiesOutputs> {
  return createNode("nodetool.entity.ListEntities", inputs, { id: options?.id, outputNames: ["entity", "entities"], outputTypes: {"entity":"entity","entities":"list[entity]"}, streaming: true, inputMode: "buffered", outputCorrelation: {"entity":{"kind":"iteration","source":"__execution__","group":"items"},"entities":{"kind":"single","source":"__execution__"}} });
}

// Create Entity — nodetool.entity.CreateEntity
export type CreateEntityInputs = {
  image?: Connectable<ImageRef>;
  kind?: Connectable<string>;
  name?: Connectable<string>;
  descriptor?: Connectable<string>;
  description?: Connectable<string>;
  tags?: Connectable<string[]>;
  voice_id?: Connectable<string>;
  key?: Connectable<string>;
};

export interface CreateEntityOutputs {
  entity: Entity;
  created: boolean;
}

export function createEntity(inputs: CreateEntityInputs, options?: NodeOptions): NodeWithOutputs<CreateEntityOutputs> {
  return createNode("nodetool.entity.CreateEntity", inputs, { id: options?.id, outputNames: ["entity", "created"], outputTypes: {"entity":"entity","created":"bool"} });
}
