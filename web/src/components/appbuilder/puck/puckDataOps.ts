/**
 * Pure operations on a Puck {@link Data} document used by the agent tools.
 *
 * Puck 0.22 stores nested content inside slot props (e.g. a Container's
 * `props.content` is an array of components), so the document is a tree: the
 * top-level `content` plus any slot-valued props. These helpers walk that tree
 * immutably so the agent can add/update/move/remove components anywhere.
 */
import type { Config, Data } from "@puckeditor/core";

export interface ComponentNode {
  type: string;
  props: Record<string, unknown> & { id: string };
}

export interface ComponentSummary {
  id: string;
  type: string;
  props: Record<string, unknown>;
  parentId: string | null;
  slot: string | null;
}

/** Map of component type → its slot field names (from the Puck config). */
export type SlotFieldsByType = Record<string, string[]>;

export const getSlotFields = (config: Config): SlotFieldsByType => {
  const result: SlotFieldsByType = {};
  for (const [type, component] of Object.entries(config.components ?? {})) {
    const fields = (component as { fields?: Record<string, { type?: string }> })
      .fields;
    if (!fields) continue;
    result[type] = Object.entries(fields)
      .filter(([, f]) => f?.type === "slot")
      .map(([name]) => name);
  }
  return result;
};

const slotArrays = (
  node: ComponentNode,
  slotFields: SlotFieldsByType
): { slot: string; items: ComponentNode[] }[] => {
  const slots = slotFields[node.type] ?? [];
  const result: { slot: string; items: ComponentNode[] }[] = [];
  for (const slot of slots) {
    const value = node.props[slot];
    if (Array.isArray(value)) {
      result.push({ slot, items: value as ComponentNode[] });
    }
  }
  return result;
};

export const flattenComponents = (
  data: Data,
  slotFields: SlotFieldsByType
): ComponentSummary[] => {
  const out: ComponentSummary[] = [];
  const walk = (
    items: ComponentNode[],
    parentId: string | null,
    slot: string | null
  ) => {
    for (const node of items) {
      out.push({
        id: node.props.id,
        type: node.type,
        props: node.props,
        parentId,
        slot
      });
      for (const { slot: s, items: children } of slotArrays(node, slotFields)) {
        walk(children, node.props.id, s);
      }
    }
  };
  walk(data.content as ComponentNode[], null, null);
  return out;
};

export const findComponent = (
  data: Data,
  slotFields: SlotFieldsByType,
  id: string
): ComponentSummary | null =>
  flattenComponents(data, slotFields).find((c) => c.id === id) ?? null;

/** Recursively map over every component node, returning a new tree. */
const mapTree = (
  items: ComponentNode[],
  slotFields: SlotFieldsByType,
  fn: (node: ComponentNode) => ComponentNode | null
): ComponentNode[] => {
  const result: ComponentNode[] = [];
  for (const node of items) {
    const mapped = fn(node);
    if (mapped === null) continue;
    let next = mapped;
    for (const { slot, items: children } of slotArrays(next, slotFields)) {
      next = {
        ...next,
        props: {
          ...next.props,
          [slot]: mapTree(children, slotFields, fn)
        }
      };
    }
    result.push(next);
  }
  return result;
};

const withContent = (data: Data, content: ComponentNode[]): Data =>
  ({ ...data, content } as Data);

export const makeComponentId = (
  type: string,
  rand: () => string
): string => `${type}-${rand()}`;

export interface AddComponentInput {
  type: string;
  id: string;
  props?: Record<string, unknown>;
  parentId?: string | null;
  slot?: string | null;
  index?: number;
}

export const addComponent = (
  data: Data,
  slotFields: SlotFieldsByType,
  input: AddComponentInput
): { data: Data; node: ComponentNode } => {
  const node: ComponentNode = {
    type: input.type,
    props: { ...(input.props ?? {}), id: input.id }
  };

  const insertInto = (items: ComponentNode[]): ComponentNode[] => {
    const at = input.index ?? items.length;
    const next = [...items];
    next.splice(Math.max(0, Math.min(at, items.length)), 0, node);
    return next;
  };

  if (!input.parentId) {
    return {
      data: withContent(data, insertInto(data.content as ComponentNode[])),
      node
    };
  }

  const slotName = input.slot;
  const content = mapTree(
    data.content as ComponentNode[],
    slotFields,
    (n) => {
      if (n.props.id !== input.parentId) return n;
      const slots = slotFields[n.type] ?? [];
      const targetSlot = slotName && slots.includes(slotName) ? slotName : slots[0];
      if (!targetSlot) return n;
      const current = Array.isArray(n.props[targetSlot])
        ? (n.props[targetSlot] as ComponentNode[])
        : [];
      return {
        ...n,
        props: { ...n.props, [targetSlot]: insertInto(current) }
      };
    }
  );
  return { data: withContent(data, content), node };
};

export const updateComponentProps = (
  data: Data,
  slotFields: SlotFieldsByType,
  id: string,
  props: Record<string, unknown>
): { data: Data; node: ComponentNode | null } => {
  let found: ComponentNode | null = null;
  const content = mapTree(data.content as ComponentNode[], slotFields, (n) => {
    if (n.props.id !== id) return n;
    // Never let a caller overwrite the id.
    const { id: _ignored, ...rest } = props;
    found = { ...n, props: { ...n.props, ...rest, id: n.props.id } };
    return found;
  });
  return { data: withContent(data, content), node: found };
};

export const removeComponent = (
  data: Data,
  slotFields: SlotFieldsByType,
  id: string
): { data: Data; removed: boolean } => {
  let removed = false;
  const content = mapTree(data.content as ComponentNode[], slotFields, (n) => {
    if (n.props.id === id) {
      removed = true;
      return null;
    }
    return n;
  });
  return { data: withContent(data, content), removed };
};
