/**
 * Storage for the app variables a document declares as persistent.
 *
 * Only `scope: "user"` variables with `persist: true` are written — instance
 * variables and widget-local view state die with the open app, which is what
 * their scope means. The record is keyed by app identity, so two apps that both
 * declare a `theme` variable never read each other's value.
 *
 * Restoring runs before the document's defaults are seeded: `seedVariables`
 * never clobbers, so whichever value lands first wins, and a value the user set
 * last session must beat the declared default.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { VariableDeclaration } from "@nodetool-ai/app-runtime";

const STORAGE_PREFIX = "app-runtime:variables:";

export const variableStorageKey = (appId: string): string =>
  `${STORAGE_PREFIX}${appId}`;

/** Ids of the variables a document is allowed to persist. */
export const persistableVariableIds = (
  variables: ReadonlyArray<VariableDeclaration>
): Set<string> =>
  new Set(
    variables
      .filter((variable) => variable.scope === "user" && variable.persist)
      .map((variable) => variable.id)
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The stored values for this app, filtered to what the document still declares
 * as persistent. A variable that lost its `persist` flag — or vanished from the
 * document — is not restored.
 */
export const loadPersistedVariables = async (
  appId: string,
  variables: ReadonlyArray<VariableDeclaration>
): Promise<Record<string, unknown>> => {
  const ids = persistableVariableIds(variables);
  if (ids.size === 0) {return {};}
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(variableStorageKey(appId));
  } catch {
    // Storage is unavailable on this device; the app still runs on defaults.
    return {};
  }
  if (!raw) {return {};}
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A corrupt record is not worth failing an app over.
    return {};
  }
  if (!isRecord(parsed)) {return {};}
  const restored: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(parsed)) {
    if (ids.has(id) && value !== undefined) {restored[id] = value;}
  }
  return restored;
};

/** Write the persistable subset of the instance's variables. */
export const savePersistedVariables = async (
  appId: string,
  values: Record<string, unknown>
): Promise<void> => {
  try {
    await AsyncStorage.setItem(variableStorageKey(appId), JSON.stringify(values));
  } catch {
    // Same as reading: a device that cannot store still runs the app.
  }
};

/** The subset of instance variables that may be written, in a stable shape. */
export const persistableValues = (
  variables: Record<string, unknown>,
  ids: ReadonlySet<string>
) => {
  const values: Record<string, unknown> = {};
  for (const id of [...ids].sort()) {
    const value = variables[id];
    if (value !== undefined) {values[id] = value;}
  }
  return values;
};
