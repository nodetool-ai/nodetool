/** Convert saved Comfy graphs using the deployment's authoritative node schemas. */
import { isObjectLike, type ComfyApiPrompt, type ComfyObjectInfo, type ComfyObjectInfoEntry } from "@nodetool-ai/protocol";

export function comfyRecord(value: unknown): Record<string, unknown> {
  return isObjectLike(value) && !Array.isArray(value) ? value : {};
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function records(value: unknown): Record<string, unknown>[] { return array(value).map(comfyRecord); }
function identifier(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") {throw new Error("Comfy template contains an invalid node id");}
  return String(value);
}
const WIDGET_TYPES = new Set(["STRING", "INT", "FLOAT", "NUMBER", "BOOLEAN", "COMBO", "COLOR", "BOUNDING_BOXES", "COLORS"]);
const CONTROLS = new Set(["fixed", "randomize", "increment", "decrement"]);
function widget(spec: unknown): boolean {
  const [type, raw] = array(spec);
  const options = comfyRecord(raw);
  return !options.forceInput && !options.defaultInput && (Array.isArray(type) || typeof options.widgetType === "string" ||
    options.socketless === true || typeof type === "string" && (WIDGET_TYPES.has(type) || type.includes("COMBO")));
}

/** Decode positional widgets, including nested v3 combo fields and seed controls. */
function widgets(node: Record<string, unknown>, schema: ComfyObjectInfoEntry): Record<string, unknown> {
  const raw = node.widgets_values;
  if (!Array.isArray(raw)) {return { ...comfyRecord(raw) };}
  const form = array(comfyRecord(node.widgets_values_form).order);
  if (form.length === raw.length && form.every((name) => typeof name === "string")) {
    return Object.fromEntries(form.map((name, index) => [String(name), raw[index]]).filter(([name]) => name !== "control_after_generate"));
  }
  const result: Record<string, unknown> = {};
  let cursor = 0;
  const walk = (input: unknown, order: unknown, prefix = "", depth = 0): void => {
    if (depth > 20) {throw new Error("Comfy widget schema is too deeply nested");}
    const sections = comfyRecord(input);
    const orders = comfyRecord(order);
    for (const section of ["required", "optional"]) {
      const fields = comfyRecord(sections[section]);
      const names = Array.isArray(orders[section]) ? array(orders[section]).map(String) : Object.keys(fields);
      for (const name of names) {
        const spec = fields[name];
        const [type, rawOptions] = array(spec);
        const options = comfyRecord(rawOptions);
        if (!widget(spec)) {continue;}
        const field = `${prefix}${name}`;
        const value = cursor < raw.length ? raw[cursor++] : options.default;
        if (value === undefined) {continue;}
        result[field] = value;
        if (typeof type === "string" && type.startsWith("COMFY_") && type.includes("COMBO")) {
          const variant = records(options.options).find((option) => option.key === value || String(option.key) === String(value));
          if (!variant) {throw new Error(`Comfy template has an unsupported ${field} choice: ${String(value)}`);}
          walk(variant.inputs, variant.input_order, `${field}.`, depth + 1);
        }
        if ((options.control_after_generate || /(^|[._])(?:noise_)?seed$/.test(field)) && CONTROLS.has(String(raw[cursor]))) {cursor++;}
      }
    }
  };
  walk(schema.input, schema.input_order);
  // Upload buttons and preview widgets serialize trailing UI state, not API inputs.
  const remaining = raw.slice(cursor);
  if (remaining.length > 0 && !/^(Load|Save|Preview|VHS_)/.test(String(node.type)) && !remaining.every((value) => CONTROLS.has(String(value)))) {
    throw new Error(`Comfy template widget layout does not match the Cloud schema for ${String(node.type)}`);
  }
  return result;
}

interface Link { origin: string; slot: number; target: string; input: number }
class Connection {
  constructor(readonly node: string, readonly slot: number) {}
}
function linksOf(scope: Record<string, unknown>): Map<string, Link> {
  const result = new Map<string, Link>();
  for (const raw of array(scope.links)) {
    const row = Array.isArray(raw) ? raw : undefined;
    const object = comfyRecord(raw);
    const key = row ? row[0] : object.id;
    const origin = row ? row[1] : object.origin_id;
    const slot = row ? row[2] : object.origin_slot;
    const target = row ? row[3] : object.target_id;
    const input = row ? row[4] : object.target_slot;
    if (!Number.isInteger(slot) || !Number.isInteger(input) || typeof slot !== "number" || typeof input !== "number") {throw new Error("Comfy template contains an invalid link");}
    result.set(identifier(key), { origin: identifier(origin), slot, target: identifier(target), input });
  }
  return result;
}

/** Flatten subgraphs and frontend passthrough nodes. Unknown server nodes fail before submission. */
export function comfyUiToPrompt(value: unknown, info: ComfyObjectInfo): ComfyApiPrompt {
  const workflow = comfyRecord(value);
  if (!Array.isArray(workflow.nodes)) {throw new Error("Comfy template has no nodes");}
  const definitions = new Map(records(comfyRecord(workflow.definitions).subgraphs).map((definition) => [identifier(definition.id), definition]));
  const prompt: ComfyApiPrompt = {};
  const visiting = new Set<string>();
  let expanded = 0;
  function scopeOf(scope: Record<string, unknown>, prefix: string, external = new Map<number, unknown>(), overrides = new Map<string, unknown>(), depth = 0) {
    if (depth > 30 || (expanded += records(scope.nodes).length) > 20000) {throw new Error("Comfy template subgraph expansion exceeded its limit");}
    const nodes = new Map(records(scope.nodes).map((node) => [identifier(node.id), node]));
    const links = linksOf(scope);
    const children = new Map<string, ReturnType<typeof scopeOf>>();
    const inputValue = (node: Record<string, unknown>, index: number): unknown => {
      const input = records(node.inputs)[index];
      const link = input?.link == null ? undefined : links.get(identifier(input.link));
      return link ? resolve(link.origin, link.slot) : undefined;
    };
    function child(id: string, node: Record<string, unknown>, definition: Record<string, unknown>) {
      const known = children.get(id);
      if (known) {return known;}
      const host = array(node.widgets_values);
      let position = 0;
      const supplied = new Map<number, unknown>();
      const boundary = records(definition.inputs);
      const inputs = records(node.inputs);
      boundary.forEach((port, index) => {
        const named = inputs.findIndex((input) => input.name === port.name);
        // Hidden widget ports have no host input slot. Positional fallback
        // would connect a different exposed port (for example width).
        const wired = named >= 0 ? inputValue(node, named) : undefined;
        const isWidget = WIDGET_TYPES.has(String(port.type)) || /COMBO/.test(String(port.type));
        const held = isWidget ? host[position++] : undefined;
        if (wired !== undefined) {supplied.set(index, wired);}
        else if (held !== undefined) {supplied.set(index, held);}
      });
      const promoted = new Map<string, unknown>();
      array(comfyRecord(node.properties).proxyWidgets).forEach((raw, index) => {
        const proxy = array(raw);
        if (proxy.length >= 2 && host[index] !== undefined && String(proxy[0]) !== "-1") {promoted.set(`${String(proxy[0])}.${String(proxy[1])}`, host[index]);}
      });
      const result = scopeOf(definition, `${prefix}${id}:`, supplied, promoted, depth + 1);
      children.set(id, result);
      return result;
    }
    function resolve(id: string, slot: number): unknown {
      if (id === "-10") {return external.get(slot);}
      const node = nodes.get(id);
      if (!node || node.mode === 2) {return undefined;}
      const type = String(node.type);
      const definition = definitions.get(type);
      if (definition) {return child(id, node, definition).output(slot);}
      if (type === "PrimitiveNode") {return array(node.widgets_values)[0];}
      if (type === "Reroute" || type === "SetNode") {return inputValue(node, 0);}
      if (type === "GetNode") {
        const variable = array(node.widgets_values)[0];
        const setter = [...nodes.values()].find((candidate) => candidate.type === "SetNode" && array(candidate.widgets_values)[0] === variable);
        if (!setter) {throw new Error(`Comfy variable ${String(variable)} has no setter`);}
        return inputValue(setter, 0);
      }
      if (node.mode === 4) {
        const outputs = records(node.outputs);
        const inputs = records(node.inputs);
        const matching = inputs.findIndex((input) => input.type === outputs[slot]?.type);
        return inputValue(node, matching >= 0 ? matching : slot);
      }
      build(id, node);
      return new Connection(`${prefix}${id}`, slot);
    }
    function build(id: string, node: Record<string, unknown>): void {
      const apiId = `${prefix}${id}`;
      if (prompt[apiId]) {return;}
      if (visiting.has(apiId)) {throw new Error("Comfy template contains a dependency cycle");}
      visiting.add(apiId);
      const type = String(node.type);
      const schema = info[type];
      if (!schema) {throw new Error(`Comfy Cloud does not expose node ${type}`);}
      if (schema.api_node) {throw new Error(`GPU template contains partner API node ${type}`);}
      const inputs = widgets(node, schema);
      for (const [key, held] of overrides) {
        const marker = `${id}.`;
        if (key.startsWith(marker)) {inputs[key.slice(marker.length)] = held;}
      }
      records(node.inputs).forEach((input, index) => {
        const source = inputValue(node, index);
        if (source !== undefined) {inputs[String(input.name)] = source instanceof Connection ? [source.node, source.slot] : source;}
      });
      const title = typeof node.title === "string" ? node.title : schema.display_name;
      prompt[apiId] = { class_type: type, inputs };
      if (title) {
        prompt[apiId]._meta = { title };
      }
      visiting.delete(apiId);
    }
    return {
      output(slot: number): unknown {
        const port = records(scope.outputs)[slot];
        const link = array(port?.linkIds).map((key) => links.get(identifier(key))).find((entry) => entry !== undefined) ??
          [...links.values()].find((entry) => entry.target === "-20" && entry.input === slot);
        return link ? resolve(link.origin, link.slot) : undefined;
      },
      emit(): void {
        for (const [id, node] of nodes) {
          if (node.mode === 2 || node.mode === 4) {continue;}
          const definition = definitions.get(String(node.type));
          if (definition) {child(id, node, definition).emit();}
          else if (info[String(node.type)]?.output_node) {build(id, node);}
        }
      }
    };
  }
  scopeOf(workflow, "").emit();
  if (Object.keys(prompt).length === 0) {throw new Error("Comfy template has no Cloud output nodes");}
  return prompt;
}
