// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
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

export function loadEntity(inputs: LoadEntityInputs): DslNode<LoadEntityOutputs> {
  return createNode("nodetool.entity.LoadEntity", inputs, { outputNames: ["entity", "descriptor", "name", "kind", "reference_image", "voice_id"] });
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

export function listEntities(inputs: ListEntitiesInputs): DslNode<ListEntitiesOutputs> {
  return createNode("nodetool.entity.ListEntities", inputs, { outputNames: ["entity", "entities"], streaming: true });
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

export function createEntity(inputs: CreateEntityInputs): DslNode<CreateEntityOutputs> {
  return createNode("nodetool.entity.CreateEntity", inputs, { outputNames: ["entity", "created"] });
}
