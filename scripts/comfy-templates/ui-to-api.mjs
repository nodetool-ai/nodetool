// Compile a ComfyUI UI-format workflow to the API (prompt) format, as the
// ComfyUI frontend does on submit: flatten subgraphs, follow reroutes, honor
// bypass and mute, and map widget values to names through the node catalog.
// Flattened node ids join the path with ":", as the frontend does.
const VIRTUAL = new Set(["MarkdownNote", "Note", "Reroute", "PrimitiveNode"]);
const WIDGET_KINDS = new Set(["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"]);
const CONTROL = /^(fixed|increment|decrement|randomize)$/;
const MODE_MUTE = 2;
const MODE_BYPASS = 4;
const SUBGRAPH_INPUT = -10;

/** Fill a widget the template omits with its catalog default, as the frontend does. */
function applyDefaults(inputs, entry, prefix = "") {
  for (const [name, spec] of orderedInputs(entry)) {
    if (!isWidgetSpec(spec)) continue;
    const key = `${prefix}${name}`;
    if (inputs[key] === undefined) {
      const options = Array.isArray(spec[0]) ? spec[0] : spec[1]?.options;
      const first = Array.isArray(options) ? (options[0]?.key ?? options[0]) : undefined;
      const value = spec[1]?.default ?? (spec[0] === "COMBO" || Array.isArray(spec[0]) || spec[0] === "COMFY_DYNAMICCOMBO_V3" ? first : undefined);
      if (value !== undefined) inputs[key] = value;
    }
    if (spec[0] === "COMFY_DYNAMICCOMBO_V3") {
      const option = spec[1]?.options?.find((o) => o.key === inputs[key]);
      if (option?.inputs) applyDefaults(inputs, { input: option.inputs }, `${key}.`);
    }
  }
}

const isWidgetSpec = (spec) =>
  Array.isArray(spec) &&
  (Array.isArray(spec[0]) ||
    WIDGET_KINDS.has(spec[0]) ||
    spec[0] === "COMFY_DYNAMICCOMBO_V3" ||
    // A multi-type widget has a type such as "FLOAT,INT" and names its widget.
    typeof spec[1]?.widgetType === "string");

function orderedInputs(entry) {
  const out = [];
  for (const section of ["required", "optional"]) {
    const group = entry.input?.[section] ?? {};
    const order = entry.input_order?.[section] ?? Object.keys(group);
    for (const name of order) if (group[name]) out.push([name, group[name]]);
  }
  return out;
}

const hasControl = (name, spec) =>
  spec[1]?.control_after_generate === true ||
  ((name === "seed" || name === "noise_seed") && spec[0] === "INT");

/** Widget values of one node by name. Throws when the values do not line up. */
function widgetValues(node, entry, type) {
  const raw = node.widgets_values;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const { videopreview: _videopreview, ...named } = raw;
    return named;
  }
  const values = {};
  if (!Array.isArray(raw)) return values;
  // An input converted to a socket still holds its place in widgets_values.
  let index = 0;
  for (const [name, spec] of orderedInputs(entry)) {
    if (!isWidgetSpec(spec)) continue;
    if (index >= raw.length) break;
    values[name] = raw[index++];
    if (hasControl(name, spec) && CONTROL.test(String(raw[index]))) index += 1;
    if (spec[0] === "COMFY_DYNAMICCOMBO_V3") {
      const option = spec[1]?.options?.find((o) => o.key === values[name]);
      for (const section of ["required", "optional"]) {
        for (const child of Object.keys(option?.inputs?.[section] ?? {})) {
          if (index < raw.length) values[`${name}.${child}`] = raw[index++];
        }
      }
    }
  }
  // A display node stores preview state in its values, which is not an input.
  if (index === 0 && raw.length > 0 && orderedInputs(entry).some(([, spec]) => isWidgetSpec(spec))) {
    throw new Error(`${type}: widget values have no matching input`);
  }
  return values;
}

export function uiToApi(ui, info) {
  const definitions = new Map((ui.definitions?.subgraphs ?? []).map((s) => [s.id, s]));
  const prompt = {};
  const makeScope = (graph, prefix, parent, instance) => {
    const links = new Map();
    for (const link of graph.links ?? []) {
      if (Array.isArray(link)) links.set(link[0], { origin_id: link[1], origin_slot: link[2], target_id: link[3], target_slot: link[4] });
      else links.set(link.id, link);
    }
    return { graph, prefix, parent, instance, links, nodes: new Map((graph.nodes ?? []).map((n) => [n.id, n])) };
  };

  /** The value on the far end of `linkId`: `[id, slot]`, a literal `{literal}`, or null. */
  const resolve = (scope, linkId) => {
    const link = scope.links.get(linkId);
    if (!link) return null;
    if (link.origin_id === SUBGRAPH_INPUT) {
      if (!scope.instance) return null;
      const name = scope.graph.inputs?.[link.origin_slot]?.name;
      const slot = scope.instance.inputs?.find((input) => input.name === name);
      if (slot?.link != null) return resolve(scope.parent, slot.link);
      return promoted(scope, name);
    }
    const node = scope.nodes.get(link.origin_id);
    if (!node || node.mode === MODE_MUTE) return null;
    if (node.type === "Reroute") return resolve(scope, node.inputs?.[0]?.link);
    if (node.type === "PrimitiveNode") return { literal: node.widgets_values?.[0] };
    const def = definitions.get(node.type);
    if (def) {
      const inner = makeScope(def, `${scope.prefix}${node.id}:`, scope, node);
      const innerLink = def.outputs?.[link.origin_slot]?.linkIds?.[0];
      return innerLink == null ? null : resolve(inner, innerLink);
    }
    if (node.mode === MODE_BYPASS) {
      const type = node.outputs?.[link.origin_slot]?.type;
      const through = node.inputs?.find((input) => input.type === type && input.link != null);
      return through ? resolve(scope, through.link) : null;
    }
    return [`${scope.prefix}${node.id}`, link.origin_slot];
  };

  /**
   * A subgraph input with no link takes the value shown on its instance. The
   * instance's values follow the subgraph's widget inputs in order, including
   * inputs the instance does not list and a control token after a seed.
   */
  const promoted = (scope, name) => {
    const values = scope.instance.widgets_values;
    if (!Array.isArray(values)) return null;
    let index = 0;
    for (const input of scope.graph.inputs ?? []) {
      if (!WIDGET_KINDS.has(input.type)) continue;
      if (index >= values.length) return null;
      if (input.name === name) return { literal: values[index] };
      index += 1;
      if (/seed$/.test(input.name) && CONTROL.test(String(values[index]))) index += 1;
    }
    return null;
  };

  const walk = (scope) => {
    for (const node of scope.graph.nodes ?? []) {
      if (node.mode === MODE_MUTE || node.mode === MODE_BYPASS || VIRTUAL.has(node.type)) continue;
      const def = definitions.get(node.type);
      if (def) {
        walk(makeScope(def, `${scope.prefix}${node.id}:`, scope, node));
        continue;
      }
      const entry = info[node.type];
      if (!entry) throw new Error(`missing class ${node.type}`);
      const inputs = widgetValues(node, entry, node.type);
      for (const [key, value] of Object.entries(proxyValues(scope, node))) inputs[key] = value;
      for (const input of node.inputs ?? []) {
        if (input.link == null) continue;
        const value = resolve(scope, input.link);
        if (Array.isArray(value)) inputs[input.name] = value;
        else if (value) inputs[input.name] = value.literal;
        else if (!input.widget) delete inputs[input.name];
      }
      applyDefaults(inputs, entry);
      prompt[`${scope.prefix}${node.id}`] = {
        class_type: node.type,
        inputs,
        _meta: { title: node.title ?? entry.display_name ?? node.type }
      };
    }
  };

  /** Values the enclosing instance promotes through `properties.proxyWidgets`. */
  const proxyValues = (scope, node) => {
    const proxies = scope.instance?.properties?.proxyWidgets;
    const values = scope.instance?.widgets_values;
    if (!Array.isArray(proxies) || !Array.isArray(values)) return {};
    const out = {};
    proxies.forEach(([id, name], index) => {
      if (String(id) === String(node.id) && index < values.length) out[name] = values[index];
    });
    return out;
  };

  walk(makeScope(ui, "", null, null));
  // A link to a removed node is dropped by the frontend's final pass as well.
  for (const entry of Object.values(prompt)) {
    for (const [key, value] of Object.entries(entry.inputs)) {
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && !prompt[value[0]]) delete entry.inputs[key];
    }
  }
  return prompt;
}
