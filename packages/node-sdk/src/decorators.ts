export interface PropOptions {
  type: string;
  default?: unknown;
  title?: string;
  description?: string;
  min?: number;
  max?: number;
  required?: boolean;
  values?: Array<string | number>;
  json_schema_extra?: Record<string, unknown>;
}

export interface DeclaredPropertyMetadata {
  name: string;
  options: PropOptions;
}

const declaredPropsByClass = new WeakMap<Function, Map<string, DeclaredPropertyMetadata>>();

function getOrCreatePropMap(ctor: Function): Map<string, DeclaredPropertyMetadata> {
  const existing = declaredPropsByClass.get(ctor);
  if (existing) return existing;
  const created = new Map<string, DeclaredPropertyMetadata>();
  declaredPropsByClass.set(ctor, created);
  return created;
}

function collectDeclaredProps(ctor: Function): DeclaredPropertyMetadata[] {
  const chain: Function[] = [];
  let current: unknown = ctor;
  while (typeof current === "function" && current !== Function.prototype) {
    chain.push(current);
    current = Object.getPrototypeOf(current);
  }
  chain.reverse();

  const merged = new Map<string, DeclaredPropertyMetadata>();
  for (const cls of chain) {
    const entries = declaredPropsByClass.get(cls);
    if (!entries) continue;
    for (const [name, metadata] of entries.entries()) {
      merged.set(name, metadata);
    }
  }
  return [...merged.values()];
}

export function registerDeclaredProperty(ctor: Function, name: string, options: PropOptions): void {
  const map = getOrCreatePropMap(ctor);
  map.set(name, { name, options: { ...options } });
}

export function getDeclaredPropertiesForClass(ctor: Function): DeclaredPropertyMetadata[] {
  return collectDeclaredProps(ctor);
}

export function prop(options: PropOptions): PropertyDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    const ctor = (target as { constructor: Function }).constructor;
    registerDeclaredProperty(ctor, String(propertyKey), options);
  };
}
