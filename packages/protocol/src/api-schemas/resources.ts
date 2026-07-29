import { z } from "zod";
import { resourceKind } from "./applications.js";

/**
 * The common envelope every resource provider speaks. `revision` is the
 * document's write counter: a widget echoes back the revision it read, and the
 * server rejects the write if the document has moved on.
 */
export const resourceRef = z.object({
  kind: resourceKind,
  id: z.string(),
  revision: z.number().optional()
});
export type ResourceRefSchema = z.infer<typeof resourceRef>;

/** A resource as a picker or gallery lists it — enough to render a row. */
export const resourceSummary = z.object({
  ref: resourceRef,
  name: z.string(),
  projectId: z.string().nullable(),
  /** Content type for assets; absent for document kinds. */
  contentType: z.string().nullable(),
  updatedAt: z.string()
});
export type ResourceSummary = z.infer<typeof resourceSummary>;

export const resourceDetail = resourceSummary.extend({
  /** The provider's payload: the document body, or an asset's metadata. */
  document: z.unknown()
});
export type ResourceDetail = z.infer<typeof resourceDetail>;

export const listResourcesInput = z.object({
  kind: resourceKind,
  projectId: z.string().optional(),
  limit: z.number().min(1).max(200).default(50)
});

export const readResourceInput = z.object({ ref: resourceRef });

export const createResourceInput = z.object({
  kind: resourceKind,
  name: z.string().min(1),
  projectId: z.string().default("default")
});

export const updateResourceInput = z.object({
  /** Must carry the revision the caller read, or the write is rejected. */
  ref: resourceRef,
  name: z.string().min(1).optional(),
  document: z.unknown().optional()
});

export const deleteResourceInput = z.object({ ref: resourceRef });
