/**
 * Normalizes a Comfy Router model's OpenAPI document into the constraints
 * NodeTool validates and announces. Limits often sit only in a field's
 * description, so a closed list is taken from prose only when the wording
 * states one. Anything else stays open and is listed in `unparsed`.
 */

const ROLE_FIELDS = {
  resolution: ["resolution", "quality_resolution", "output_resolution"],
  aspectRatio: ["aspect_ratio", "aspectRatio", "ratio"],
  size: ["size", "image_size"],
  duration: ["duration", "duration_seconds", "durationSeconds", "seconds"]
};

const TOKENS = {
  resolution: /(?<![\w.:*])(?:\d+(?:\.\d+)?[kK]|\d{3,4}[pP]|\d{3,4}sq)(?![\w*])/g,
  aspectRatio: /(?<![\w.:])(?:\d+:\d+|auto|adaptive)(?![\w:])/g
};

/** Wording that says a description's values are examples or depend on something else. */
const OPEN_WORDING = /e\.g\.|for example|such as|between|var(?:y|ies)|depends?\b|format\b/i;

export function resolveRef(node, doc) {
  if (!node || typeof node !== "object") return {};
  if (typeof node.$ref === "string") {
    let current = doc;
    for (const key of node.$ref.replace(/^#\//, "").split("/")) current = current?.[key];
    return resolveRef(current, doc);
  }
  return node;
}

/** Every declared property, by name, a few levels into the request body. */
function collectFields(schema, doc, out = new Map(), depth = 0) {
  const node = resolveRef(schema, doc);
  if (depth > 4) return out;
  for (const part of node.allOf ?? []) collectFields(part, doc, out, depth + 1);
  for (const [name, value] of Object.entries(node.properties ?? {})) {
    const prop = resolveRef(value, doc);
    if (!out.has(name)) out.set(name, prop);
    collectFields(prop, doc, out, depth + 1);
  }
  return out;
}

const enumOf = (prop) => {
  if (Array.isArray(prop.enum)) return prop.enum;
  const branches = prop.oneOf ?? prop.anyOf;
  if (!Array.isArray(branches)) return null;
  const constants = branches.filter((branch) => "const" in branch).map((branch) => branch.const);
  return constants.length === branches.length && constants.length > 0 ? constants : null;
};

const unique = (values) => [...new Set(values)];

function parseListField(role, prop) {
  const values = enumOf(prop);
  if (values) return { values: values.map(String), source: "enum" };
  const description = prop.description ?? "";
  if (OPEN_WORDING.test(description)) return null;
  const tokens = unique(description.match(TOKENS[role]) ?? []);
  return tokens.length >= 2 ? { values: tokens, source: "description" } : null;
}

function parseSizeField(prop) {
  const values = enumOf(prop);
  if (values) return { values: values.map(String), source: "enum" };
  const description = prop.description ?? "";
  const spec = {};
  if (/width\s*\*\s*height|\d\s*\*\s*\d/i.test(description)) spec.separator = "*";
  else if (/width\s*x\s*height|\d\s*x\s*\d/i.test(description)) spec.separator = "x";
  const area = description.match(/pixel area between (\d+)[^.]*? and (\d+)/i);
  if (area) spec.pixelArea = [Number(area[1]), Number(area[2])];
  return Object.keys(spec).length > 0 ? { ...spec, source: "description" } : null;
}

function parseDurationField(prop) {
  const values = enumOf(prop);
  if (values) return { values: values.map(String), source: "enum" };
  if (typeof prop.minimum === "number" || typeof prop.maximum === "number") {
    return {
      ...(typeof prop.minimum === "number" && { min: prop.minimum }),
      ...(typeof prop.maximum === "number" && { max: prop.maximum }),
      source: "schema"
    };
  }
  const range = (prop.description ?? "").match(/(\d+)\s*(?:-|–|to)\s*(\d+)/);
  return range
    ? { min: Number(range[1]), max: Number(range[2]), source: "description" }
    : null;
}

export function bodySchema(doc) {
  for (const ops of Object.values(doc.paths ?? {})) {
    const schema = ops?.post?.requestBody?.content?.["application/json"]?.schema;
    if (schema) return resolveRef(schema, doc);
  }
  return {};
}

/** One model's constraints. An empty `unparsed` means every known field was read. */
export function buildManifestEntry(doc) {
  const fields = collectFields(bodySchema(doc), doc);
  const entry = { params: {}, unparsed: [] };
  for (const [role, names] of Object.entries(ROLE_FIELDS)) {
    const name = names.find((candidate) => fields.has(candidate));
    if (!name) continue;
    const prop = fields.get(name);
    const spec =
      role === "size"
        ? parseSizeField(prop)
        : role === "duration"
          ? parseDurationField(prop)
          : parseListField(role, prop);
    if (spec) entry.params[role] = { field: name, ...spec };
    else entry.unparsed.push(name);
  }
  return entry;
}
