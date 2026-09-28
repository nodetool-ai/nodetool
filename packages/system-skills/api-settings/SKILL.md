---
name: api-settings
description: "Call nodetool.settings or nodetool.secrets from a code action: read or change a NodeTool setting, find out which credentials are configured, ask the user to enter a missing API key, or read a secret in a script. Load before the first call into these namespaces."
---

# nodetool.settings and nodetool.secrets

`nodetool.settings` is the configuration of this install. `nodetool.secrets`
reads credentials inside a run. A secret value never passes through the agent:
the user types it in a dialog.

## nodetool.settings

| Call | Does | Answers |
| :--- | :--- | :--- |
| `list({group})` | Lists every setting, or one group (`"Folders"`, for example), with its description, allowed values and current value. Secrets are not in this list. | `{settings, groups}` |
| `get(key)` | Reads one setting, from the user's saved settings and then the environment. Refuses a secret. | The setting with its `value` and `source` (`user`, `env` or `unset`) |
| `set(key, value)` | Changes one setting for this user. Only a declared setting can be set, and a setting with allowed values takes only those. `value` is a string. | — |
| `secrets()` | Lists the known credentials and whether each one is configured. | Names and a configured flag. Never values. |
| `requestSecret(key, {reason, help_url})` | Opens a dialog in the user's client where they type the value. | Only whether they saved one |

`key` is the environment-variable name: `"AUTOSAVE_INTERVAL_MINUTES"`,
`"STRIPE_API_KEY"`.

### Asking for a credential

1. Call `secrets()` to see what is missing, and use the name the service is
   registered under.
2. Call `requestSecret(key, {reason, help_url})`. Write `reason` for the user,
   in one sentence. `help_url` is where they get the key.
3. Continue when the answer says it was saved.

A run with no interactive client refuses the request. Then tell the user
which credential is missing and where to add it (Settings > Secrets). Do not
ask again in a loop, and never ask the user to paste a key into the chat.

## nodetool.secrets

For code that needs a credential value, such as a Code node or a script:

| Call | Does |
| :--- | :--- |
| `get(name)` | The value. It throws and names the secret when it is not set. |
| `tryGet(name)` | The value, or `undefined` for a credential that is optional |
| `list()` | The names this node declared in its secret scope, or `null` when it declared none |

A read works only for a name inside the secret scope of the run. A chat
action has no secret store, so `nodetool.secrets.get` throws there. Use the
tools that hold the credential on the host instead of reading it.
