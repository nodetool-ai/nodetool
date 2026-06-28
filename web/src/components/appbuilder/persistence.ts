/**
 * Loads and saves an AppSpec on a workflow.
 *
 * The spec rides along in `workflow.settings` under a reserved key, serialized
 * as a JSON string. `settings` already round-trips through the workflow
 * create/update API (it accepts arbitrary JSON), so no backend/migration work
 * is needed to ship the app builder.
 */
import { Workflow } from "../../stores/ApiTypes";
import {
  AppSpec,
  APP_SPEC_SETTINGS_KEY,
  parseAppSpec
} from "./appSchema";

type WorkflowSettings = Workflow["settings"];

export const loadAppSpec = (workflow?: Workflow | null): AppSpec | null => {
  const raw = (workflow?.settings as Record<string, unknown> | null | undefined)?.[
    APP_SPEC_SETTINGS_KEY
  ];
  if (typeof raw !== "string") return null;
  try {
    return parseAppSpec(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const hasAppSpec = (workflow?: Workflow | null): boolean => {
  const spec = loadAppSpec(workflow);
  return Boolean(spec && spec.widgets.length > 0);
};

/** Returns a new settings object with the spec embedded (or removed when null). */
export const withAppSpec = (
  settings: WorkflowSettings,
  spec: AppSpec | null
): WorkflowSettings => {
  const next: Record<string, unknown> = { ...(settings ?? {}) };
  if (spec === null) {
    delete next[APP_SPEC_SETTINGS_KEY];
  } else {
    next[APP_SPEC_SETTINGS_KEY] = JSON.stringify(spec);
  }
  return next as WorkflowSettings;
};
