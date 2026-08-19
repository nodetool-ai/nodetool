/**
 * The `settings` module's specs — data only, no implementation.
 *
 * Split out for the reason every `.specs.ts` is: the registry's eager spec
 * table imports this file synchronously, so nothing the implementation pulls
 * in (`@nodetool-ai/models`, the database) reaches the entry graph.
 *
 * Five wire names, and the shape of the set is the design. Four of them read
 * or write ordinary configuration. The fifth, `request_secret`, is the only
 * way sandboxed code can cause a credential to be stored — and it takes no
 * value. There is deliberately no `set_secret`.
 */

import { z } from "zod";
import { zodToJsonSchema } from "@nodetool-ai/runtime";
import type { CapabilitySpec } from "./types.js";
import { isNonEmptyString } from "../utils/type-guards.js";

export const LIST_SETTINGS_TOOL_NAME = "list_settings";
export const GET_SETTING_TOOL_NAME = "get_setting";
export const SET_SETTING_TOOL_NAME = "set_setting";
export const LIST_SECRETS_TOOL_NAME = "list_secrets";
export const REQUEST_SECRET_TOOL_NAME = "request_secret";

export const listSettingsSchema = z.object({
  group: z
    .string()
    .optional()
    .describe(
      'Omit to list every setting. Pass one group name to list only that group, e.g. "Folders".'
    )
});

export const getSettingSchema = z.object({
  key: z
    .string()
    .describe(
      'The setting\'s environment-variable name, e.g. "AUTOSAVE_INTERVAL_MINUTES".'
    )
});

export const setSettingSchema = z.object({
  key: z
    .string()
    .describe("The setting's environment-variable name."),
  value: z
    .string()
    .describe(
      "The new value, as a string. Must be one of the setting's allowed values when it declares an enum."
    )
});

export const listSecretsSchema = z.object({});

export const requestSecretSchema = z.object({
  key: z
    .string()
    .describe(
      'The secret\'s name, e.g. "STRIPE_API_KEY". Use the name the service is registered under when there is one — read list_secrets first.'
    ),
  reason: z
    .string()
    .optional()
    .describe(
      "Why you need it, in one sentence. Shown to the user in the dialog, so write it for them."
    ),
  help_url: z
    .string()
    .optional()
    .describe(
      "Where the user obtains the key. Rendered as a link when it is an https URL."
    )
});

export const listSettingsSpec: CapabilitySpec = {
  name: LIST_SETTINGS_TOOL_NAME,
  description:
    "List NodeTool's configuration settings with their group, description, allowed values, and current value. " +
    "Secrets are listed by list_secrets instead, and never carry a value here.",
  inputSchema: zodToJsonSchema(listSettingsSchema),
  zodSchema: listSettingsSchema,
  category: "read",
  userMessage: (params) => {
    const group = params["group"];
    return isNonEmptyString(group)
      ? `Reading ${group} settings`
      : "Reading settings";
  }
};

export const getSettingSpec: CapabilitySpec = {
  name: GET_SETTING_TOOL_NAME,
  description:
    "Read one configuration setting's current value, resolved from this user's saved settings and then the " +
    "process environment. Refuses a secret: read those with nodetool.secrets.get, which is bound by the " +
    "secret scope this run declares.",
  inputSchema: zodToJsonSchema(getSettingSchema),
  zodSchema: getSettingSchema,
  category: "read",
  userMessage: (params) => {
    const key = params["key"];
    return isNonEmptyString(key) ? `Reading setting ${key}` : "Reading a setting";
  }
};

export const setSettingSpec: CapabilitySpec = {
  name: SET_SETTING_TOOL_NAME,
  description:
    "Change one configuration setting for this user. Only a setting NodeTool declares can be set, and a " +
    "setting that declares allowed values accepts only those. Cannot set a secret — call request_secret, " +
    "which asks the user to enter it themselves.",
  inputSchema: zodToJsonSchema(setSettingSchema),
  zodSchema: setSettingSchema,
  category: "write",
  userMessage: (params) => {
    const key = params["key"];
    return isNonEmptyString(key) ? `Changing setting ${key}` : "Changing a setting";
  }
};

export const listSecretsSpec: CapabilitySpec = {
  name: LIST_SECRETS_TOOL_NAME,
  description:
    "List the credentials NodeTool knows about and whether each one is configured on this install. " +
    "Values are never returned. Use this to find out what is missing before asking for it.",
  inputSchema: zodToJsonSchema(listSecretsSchema),
  zodSchema: listSecretsSchema,
  category: "read",
  userMessage: () => "Checking which credentials are configured"
};

export const requestSecretSpec: CapabilitySpec = {
  name: REQUEST_SECRET_TOOL_NAME,
  description:
    "Ask the user to enter a credential. This opens a dialog in their NodeTool client where they type the " +
    "value; it is saved directly from there. You never send the value and never receive it — the answer is " +
    "only whether they saved one. This is the only way to set a secret. Read it afterwards with " +
    "nodetool.secrets.get, which works only if this run declares the name in its secret scope.",
  inputSchema: zodToJsonSchema(requestSecretSchema),
  zodSchema: requestSecretSchema,
  category: "write",
  userMessage: (params) => {
    const key = params["key"];
    return isNonEmptyString(key)
      ? `Asking you to enter ${key}`
      : "Asking you to enter a credential";
  }
};

export const settingsSpecs: readonly CapabilitySpec[] = [
  listSettingsSpec,
  getSettingSpec,
  setSettingSpec,
  listSecretsSpec,
  requestSecretSpec
];
