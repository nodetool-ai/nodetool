import { dialog } from "electron";
import { logMessage } from "./logger";
import { readSettingsAsync, updateSetting } from "./settings";

/**
 * Settings key recording whether the user has seen the one-time
 * explanation that the OS keychain is about to be accessed.
 */
export const KEYCHAIN_EXPLANATION_ACKNOWLEDGED_KEY =
  "keychainExplanationAcknowledged";

/** Platform-specific wording for the keychain prompt explanation. */
function getKeychainExplanation(): { title: string; detail: string } {
  if (process.platform === "darwin") {
    return {
      title: "Keychain Access",
      detail:
        "NodeTool uses your macOS Keychain to store an encryption key for your API credentials. " +
        "macOS will now ask for permission to store or access an item named 'secrets_master_key'. " +
        "This keeps the API keys you add in Settings encrypted at rest on this machine.",
    };
  }
  // Linux / BSD: libsecret (gnome-keyring, kwallet) may prompt to unlock.
  return {
    title: "Keychain Access",
    detail:
      "NodeTool uses your system's secret service (e.g. gnome-keyring, kwallet) to store " +
      "an encryption key for your API credentials. You may be prompted to unlock your keyring. " +
      "This keeps the API keys you add in Settings encrypted at rest on this machine.",
  };
}

/**
 * Shows a one-time informational dialog before the backend accesses the
 * system keychain. Persists acknowledgement so the dialog only appears on
 * first launch.
 *
 * No-op on:
 * - Windows (Credential Manager does not prompt the user)
 * - Environments with SECRETS_MASTER_KEY set (keytar is never touched)
 * - Subsequent launches (setting already recorded)
 * - CI / test runs (NODE_ENV=test or CI=true)
 */
export async function showKeychainExplanationIfNeeded(): Promise<void> {
  // Windows Credential Manager does not surface a permission prompt, so the
  // explanation would be pointless friction there.
  if (process.platform === "win32") {
    return;
  }

  // If the user has configured an env-provided master key, keytar is never
  // consulted by the backend. Skip the dialog entirely.
  if (process.env.SECRETS_MASTER_KEY) {
    logMessage(
      "SECRETS_MASTER_KEY is set; skipping keychain explanation dialog"
    );
    return;
  }

  // Don't interrupt automated runs.
  if (process.env.NODE_ENV === "test" || process.env.CI) {
    return;
  }

  let settings: Record<string, unknown>;
  try {
    settings = await readSettingsAsync();
  } catch (error) {
    logMessage(
      `Failed to read settings while checking keychain acknowledgement: ${error}`,
      "warn"
    );
    // If we can't read settings, don't block startup — the OS prompt will
    // still appear, just without our explanation.
    return;
  }

  if (settings[KEYCHAIN_EXPLANATION_ACKNOWLEDGED_KEY] === true) {
    return;
  }

  const { title, detail } = getKeychainExplanation();

  logMessage("Showing one-time keychain explanation dialog");
  try {
    await dialog.showMessageBox({
      type: "info",
      title,
      message: "NodeTool needs access to your system keychain",
      detail,
      buttons: ["Continue"],
      defaultId: 0,
    });
  } catch (error) {
    logMessage(
      `Failed to show keychain explanation dialog: ${error}`,
      "warn"
    );
    // Fall through and still record acknowledgement — retrying on every
    // startup would be more annoying than losing a single informational prompt.
  }

  try {
    updateSetting(KEYCHAIN_EXPLANATION_ACKNOWLEDGED_KEY, true);
    logMessage("Recorded keychain explanation acknowledgement");
  } catch (error) {
    logMessage(
      `Failed to persist keychain acknowledgement: ${error}`,
      "warn"
    );
  }
}
