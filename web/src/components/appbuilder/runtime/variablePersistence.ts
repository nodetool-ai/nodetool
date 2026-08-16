/**
 * Persistence for user-scoped app variables.
 *
 * A `VariableDeclaration` carries `scope` and `persist`, and the document
 * parser enforces that only user-scoped variables may persist. This is the
 * layer that honours it: those variables survive a reload, everything else —
 * instance variables, widget-local `view` state, outputs — starts empty.
 *
 * Values are keyed by app identity (the application record when the app has
 * one, otherwise the host workflow), so two apps never read each other's
 * values.
 */
import type { VariableDeclaration } from "@nodetool-ai/app-runtime";

const STORAGE_PREFIX = "nodetool.app.variables.";

/** The storage key for one app's persisted variables. */
export const variableStorageKey = (appIdentity: string): string =>
  `${STORAGE_PREFIX}${appIdentity}`;

/**
 * Identity a persisted value is stored under: the application record when the
 * app has one, otherwise the workflow that hosts the document.
 */
export const appVariableIdentity = (
  applicationId: string | undefined,
  workflowId: string | undefined
): string | null => {
  if (applicationId) return `application:${applicationId}`;
  if (workflowId) return `workflow:${workflowId}`;
  return null;
};

const persistable = (
  variables: ReadonlyArray<VariableDeclaration>
): VariableDeclaration[] =>
  variables.filter((variable) => variable.scope === "user" && variable.persist);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Restore the persisted values of an app's user-scoped variables. Feed the
 * result to `seedVariables` **before** the declared defaults: seeding never
 * clobbers, so a restored value wins over the document's default.
 *
 * A value stored for a variable the document no longer declares (or no longer
 * persists) is ignored rather than resurrected.
 */
export const loadPersistedVariables = (
  appIdentity: string | null,
  variables: ReadonlyArray<VariableDeclaration>
) => {
  const declared = persistable(variables);
  if (!appIdentity || declared.length === 0) return {};
  let stored: unknown;
  try {
    const raw = window.localStorage.getItem(variableStorageKey(appIdentity));
    if (!raw) return {};
    stored = JSON.parse(raw);
  } catch {
    // Unreadable storage (disabled, quota-evicted, corrupt) is not an error the
    // app can act on — it just starts from its declared defaults.
    return {};
  }
  if (!isRecord(stored)) return {};
  const values: Record<string, unknown> = {};
  for (const variable of declared) {
    const value = stored[variable.id];
    if (value !== undefined) values[variable.id] = value;
  }
  return values;
};

/** Write back the current value of every persisting user-scoped variable. */
export const savePersistedVariables = (
  appIdentity: string | null,
  variables: ReadonlyArray<VariableDeclaration>,
  values: Record<string, unknown>
): void => {
  const declared = persistable(variables);
  if (!appIdentity || declared.length === 0) return;
  const payload: Record<string, unknown> = {};
  for (const variable of declared) {
    const value = values[variable.id];
    if (value !== undefined) payload[variable.id] = value;
  }
  try {
    window.localStorage.setItem(
      variableStorageKey(appIdentity),
      JSON.stringify(payload)
    );
  } catch {
    // Storage full or unavailable: the app keeps working, the value just does
    // not survive the reload.
  }
};
