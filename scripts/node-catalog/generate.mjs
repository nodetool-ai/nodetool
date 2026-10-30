/** JSON-normalize metadata without dropping unsupported property values. */
export function canonicalJson(value, path = "$", omitUndefinedFields = false, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "object" || ancestors.has(value)) {
    throw new Error(`Value at ${path} cannot be represented as JSON`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new Error(`Value at ${path} cannot be represented as JSON`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`Symbol keys at ${path} cannot be represented as JSON`);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return Array.from(value, (entry, i) => canonicalJson(entry, `${path}[${i}]`, omitUndefinedFields, ancestors));
    }
    return Object.fromEntries(Object.keys(value).sort().flatMap((key) => {
      if (value[key] === undefined && omitUndefinedFields) {
        return [];
      }
      return [[key, canonicalJson(value[key], `${path}.${key}`, omitUndefinedFields, ancestors)]];
    }));
  } finally {
    ancestors.delete(value);
  }
}

/** Registrars establish exact ownership. Package manifests establish requirements. */
export async function generateCatalog(definitions, { coreVersion, loadPack, readManifest, createRegistry }) {
  const owners = new Map();
  const nodes = [];
  const packs = [];
  const packageOwners = new Map();
  for (const definition of definitions) {
    if (definition.id === "cli-full" || definition.npmName === "@nodetool-ai/cli-full" || definition.provides.includes("@nodetool-ai/cli-full")) {
      throw new Error("The removed cli-full aggregate cannot appear in a release catalog");
    }
    for (const name of [definition.npmName, ...definition.provides]) {
      if (packageOwners.has(name)) {
        throw new Error(`Duplicate catalog package ownership: ${name}`);
      }
      packageOwners.set(name, definition.id);
    }
  }
  for (const definition of [...definitions].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    const manifest = await readManifest(definition.npmName);
    if (manifest.version !== coreVersion) {
      throw new Error(`Catalog package ${definition.npmName} version ${manifest.version} differs from core ${coreVersion}`);
    }
    const registry = createRegistry();
    if (definition.kind !== "cli-feature") {
      const module = await loadPack(definition.npmName);
      const registrar = module[definition.registrar];
      if (typeof registrar !== "function") {
        throw new Error(`Missing registrar ${definition.registrar} in ${definition.npmName}`);
      }
      registrar(registry);
    }
    const nodeTypes = registry.list();
    if (nodeTypes.length === 0 && definition.kind !== "cli-feature") {
      throw new Error(`Registrar ${definition.registrar} registered zero node types`);
    }
    for (const nodeType of nodeTypes) {
      const previous = owners.get(nodeType);
      if (previous) {
        throw new Error(`Duplicate node ownership for ${nodeType}: ${previous} and ${definition.id}`);
      }
      owners.set(nodeType, definition.id);
      const metadata = registry.getMetadata(nodeType);
      const nodeClass = registry.getClass(nodeType);
      if (!metadata || !nodeClass) {
        throw new Error(`Registrar ${definition.registrar} did not provide a class and metadata for ${nodeType}`);
      }
      const declared = nodeClass.getDeclaredProperties();
      for (const property of metadata.properties) {
        if (Object.hasOwn(property, "default")) {
          canonicalJson(property.default, `${nodeType}.${property.name}.metadata.default`);
        }
      }
      for (const property of declared) {
        if (Object.hasOwn(property.options, "default")) {
          canonicalJson(property.options.default, `${nodeType}.${property.name}.default`);
        }
        if (Object.hasOwn(property.options, "values")) {
          canonicalJson(property.options.values, `${nodeType}.${property.name}.values`);
        }
        if (Object.hasOwn(property.options, "json_schema_extra")) {
          canonicalJson(property.options.json_schema_extra, `${nodeType}.${property.name}.json_schema_extra`);
        }
      }
      nodes.push(canonicalJson({ node_type: nodeType, pack: definition.id, metadata, declared }, "$", true));
    }
    const requires = new Set(definition.kind === "cli-feature" ? definition.requires ?? [] : Object.keys(manifest.dependencies ?? {}).flatMap((name) => {
      const owner = packageOwners.get(name);
      return owner && owner !== definition.id ? [owner] : [];
    }));
    packs.push({
      id: definition.id,
      kind: definition.kind,
      npm: { name: definition.npmName, version: manifest.version, integrity: "" },
      registrar: definition.registrar,
      provides: [...definition.provides].sort(),
      requires: [...requires].sort(),
      runtimeLibraries: [...definition.runtimeLibraries].sort(),
      secrets: [...definition.secrets].sort(),
      scriptAllowlist: [],
      installBytes: 0,
      nodeCount: nodeTypes.length
    });
  }
  nodes.sort((a, b) => a.node_type < b.node_type ? -1 : a.node_type > b.node_type ? 1 : 0);
  if (nodes.length === 0) {
    throw new Error("Catalog generation registered zero node types");
  }
  const index = canonicalJson({
    schemaVersion: 1,
    coreVersion,
    installPins: [],
    packs,
    owners: Object.fromEntries([...owners].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
  });
  return {
    index: JSON.stringify(index, null, 2) + "\n",
    nodes: nodes.map((node) => JSON.stringify(node)).join("\n") + "\n",
    nodeCount: nodes.length
  };
}

export function assertCatalogMatches(actual, expected) {
  if (!(actual.nodeCount > 0) || !actual.nodes.trim()) {
    throw new Error("Catalog drift comparison inspected zero node types");
  }
  for (const key of ["index", "nodes"]) {
    if (actual[key] !== expected[key]) {
      throw new Error(`Node catalog drift in ${key === "index" ? "index.json" : "nodes.ndjson"}. Run npm run generate:node-catalog.`);
    }
  }
}
