import { gameEntityPropertyValue, gameEntityProps, type GameEntityProps } from "@nodetool-ai/protocol";

interface ScriptPropResult {
  readonly entityId: string;
  readonly commands: readonly ({ readonly kind: "setProp"; readonly key: string; readonly value: unknown }
    | { readonly kind: "removeProp"; readonly key: string } | { readonly kind: string })[];
}

/**
 * Validates every `setProp` and `removeProp` of a script batch before any command mutates state.
 * Returns the final props of each entity the batch changes. Errors name the entity and tick.
 */
export function planScriptProps(
  results: readonly ScriptPropResult[],
  currentProps: (entityId: string) => GameEntityProps | undefined,
  tick: number,
  supported: boolean
): ReadonlyMap<string, GameEntityProps> {
  const pending = new Map<string, Record<string, unknown>>();
  for (const result of results) {
    for (const command of result.commands) {
      if (!("key" in command) || (command.kind !== "setProp" && command.kind !== "removeProp")) { continue; }
      const label = `Game script ${command.kind} ${JSON.stringify(command.key)} for ${result.entityId} at tick ${tick}`;
      if (!supported) { throw new Error(`${label} requires schema version 4`); }
      const props = pending.get(result.entityId) ?? { ...currentProps(result.entityId) };
      if ("value" in command) {
        const value = gameEntityPropertyValue.safeParse(command.value);
        if (!value.success) { throw new Error(`${label} is invalid: ${value.error.issues[0]?.message ?? "not JSON"}`); }
        // An own property, so a reserved key is rejected below rather than changing the prototype.
        Object.defineProperty(props, command.key, { value: value.data, writable: true, enumerable: true, configurable: true });
      } else {
        delete props[command.key];
      }
      pending.set(result.entityId, props);
    }
  }
  const planned = new Map<string, GameEntityProps>();
  for (const [entityId, props] of pending) {
    const parsed = gameEntityProps.safeParse(props);
    if (!parsed.success) {
      throw new Error(`Game script props for ${entityId} at tick ${tick} are invalid: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    }
    planned.set(entityId, parsed.data);
  }
  return planned;
}
