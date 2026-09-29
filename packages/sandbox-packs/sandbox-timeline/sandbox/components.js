/**
 * `component()` — a reusable timeline piece with typed props — and the
 * marker-diff machinery `saveAsComposition` (in `index.js`, which owns
 * `video()`) uses to map a prop onto the composition schema's JSON-pointer
 * parameters (see `packages/timeline/src/composition.ts`).
 *
 * Kept as its own internal module so it can be edited without touching
 * `index.js`'s `video()`/`scene()` core. Nothing here depends on a `video()`
 * instance — `use()` and the probe builds that call `component()`'s `build`
 * function live in `index.js`, which is the only place `video()` is in scope.
 */

/** The value kinds a component prop carries — the same set a composition parameter allows. */
export const COMPONENT_PROP_TYPES = new Set(["string", "number", "color", "boolean"]);

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Whether `value` matches a declared prop type. Mirrors
 * `compositionValueMatchesType` in `packages/timeline/src/composition.ts` —
 * the two must agree, or a prop that validates here fails validation once
 * `saveAsComposition` turns it into a composition parameter.
 */
export function componentValueMatchesType(type, value) {
  switch (type) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "color": return typeof value === "string" && HEX_COLOR.test(value);
    default: return false;
  }
}

/**
 * `component(name, {props, duration}, (s, props) => {...})` — a reusable
 * scene piece. `props` maps a name to `{type, default, description?}`;
 * `duration` (seconds) is the piece's own natural length, used by `use()`
 * when the caller gives no `dur`. `build(s, props)` receives a scene
 * authoring object exactly like a `scene()` builder, and adds its clips the
 * same way — `use()` (in `index.js`) folds them into one group afterward.
 */
export function component(name, spec = {}, build) {
  if (typeof build !== "function") {
    throw new Error(`component("${name}"): the third argument must be the build function (s, props) => {...}.`);
  }
  const props = spec.props ?? {};
  for (const [propName, propSpec] of Object.entries(props)) {
    if (!COMPONENT_PROP_TYPES.has(propSpec.type)) {
      throw new Error(`component("${name}"): prop "${propName}" has type ${JSON.stringify(propSpec.type)}; expected one of ${[...COMPONENT_PROP_TYPES].join(", ")}.`);
    }
    if (!componentValueMatchesType(propSpec.type, propSpec.default)) {
      throw new Error(`component("${name}"): prop "${propName}" is declared ${propSpec.type} but its default is ${JSON.stringify(propSpec.default)}.`);
    }
  }
  return { __component: true, name, props, duration: spec.duration, build };
}

/** Fill `propsIn` against `Comp.props`: defaults, then a type check naming the offending prop. */
export function resolveComponentProps(Comp, propsIn = {}) {
  const out = {};
  for (const [name, spec] of Object.entries(Comp.props)) {
    const has = Object.prototype.hasOwnProperty.call(propsIn, name);
    const value = has ? propsIn[name] : spec.default;
    if (!componentValueMatchesType(spec.type, value)) {
      throw new Error(`${Comp.name}: prop "${name}" is declared ${spec.type} but got ${JSON.stringify(value)}.`);
    }
    out[name] = value;
  }
  for (const name of Object.keys(propsIn)) {
    if (!Object.prototype.hasOwnProperty.call(Comp.props, name)) {
      const known = Object.keys(Comp.props);
      throw new Error(`${Comp.name} has no prop "${name}". ${known.length > 0 ? `Its props: ${known.join(", ")}.` : "It declares none."}`);
    }
  }
  return out;
}

/** `{name: spec.default}` for every declared prop. */
export function defaultComponentProps(Comp) {
  const out = {};
  for (const [name, spec] of Object.entries(Comp.props)) out[name] = spec.default;
  return out;
}

/**
 * A value distinct from `current`, of the same declared type — used to probe
 * which field a prop reaches by rebuilding the component with it and diffing
 * the result against a baseline build. Assumes the prop passes through to its
 * field largely intact; a build that heavily transforms it (rounds, clamps,
 * hashes) may not register a diff, which `pointerForProp` then reports as
 * unmapped rather than guessing.
 */
export function markerPropValue(spec, current) {
  switch (spec.type) {
    case "boolean": return !current;
    case "number": return Number.isFinite(current) ? current + 97 : 97;
    case "string": return `${current}\u0000probe`;
    case "color": return current === "#5a3cf4" ? "#f4c35a" : "#5a3cf4";
    default: return current;
  }
}

function escapePointer(key) {
  return String(key).replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Collect every leaf JSON-pointer path where `a` and `b` differ, stopping once more than one is found. */
function collectDiffs(a, b, prefix, out) {
  if (out.length > 1) return;
  if (a === b) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) { out.push(prefix); return; }
    for (let i = 0; i < a.length; i++) collectDiffs(a[i], b[i], `${prefix}/${i}`, out);
    return;
  }
  const aObj = a !== null && typeof a === "object" && !Array.isArray(a);
  const bObj = b !== null && typeof b === "object" && !Array.isArray(b);
  if (aObj && bObj) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) collectDiffs(a[key], b[key], `${prefix}/${escapePointer(key)}`, out);
    return;
  }
  out.push(prefix);
}

function unescapePointer(segment) {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** A deep clone of `children` with `path`'s target replaced by `value` — `instantiateComposition`'s own write, done locally to verify a candidate pointer. */
function withPointerValue(children, path, value) {
  const clone = JSON.parse(JSON.stringify(children));
  const segments = path.slice(1).split("/").map(unescapePointer);
  const index = Number(segments[0]);
  if (segments.length === 1) {
    clone[index] = value;
    return clone;
  }
  let cursor = clone[index];
  for (let i = 1; i < segments.length - 1; i++) cursor = cursor[segments[i]];
  cursor[segments[segments.length - 1]] = value;
  return clone;
}

/**
 * The one JSON pointer where `markedChildren` differs from `baseChildren` —
 * two children arrays built with identical ids (same build call order, so
 * only the probed prop's value moved) — or `undefined` when the prop reached
 * no field, more than one field, or changed the children's shape, none of
 * which a single composition-parameter pointer can express.
 *
 * The candidate is verified, not just located: writing `markerValue` to
 * `baseChildren` at that pointer must reproduce `markedChildren` exactly. This
 * catches a prop whose only visible effect is adding or removing a whole
 * field (an `if (prop) el.enter(...)`, say) — the diff walk finds one path
 * (the field's parent), but `instantiateComposition` would write the prop's
 * scalar value there, not toggle the field's presence, so the pointer is
 * rejected rather than shipped wrong.
 */
export function pointerForProp(baseChildren, markedChildren, markerValue) {
  if (baseChildren.length !== markedChildren.length) return undefined;
  const diffs = [];
  for (let i = 0; i < baseChildren.length; i++) {
    collectDiffs(baseChildren[i], markedChildren[i], `/${i}`, diffs);
    if (diffs.length > 1) return undefined;
  }
  const path = diffs.length === 1 ? diffs[0] : undefined;
  if (path === undefined || markerValue === undefined) return path;
  const patched = withPointerValue(baseChildren, path, markerValue);
  return JSON.stringify(patched) === JSON.stringify(markedChildren) ? path : undefined;
}
