/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useState } from "react";
import { Text, TextInput, EditorButton, FlexColumn, FlexRow } from "../ui_primitives";

const DEFAULT_VAULT_ID = "default";

interface VaultInfo {
  id: string;
  name: string;
  dbPath?: string | null;
}

interface VaultListResult {
  vaults: VaultInfo[];
  activeVaultId: string;
}

/**
 * Electron-only settings section for managing vaults — switchable, isolated
 * data stores, each backed by its own SQLite database. Talks to the desktop
 * app over `window.api.vaults`. Renders nothing when that bridge is absent
 * (e.g. the web build running in a plain browser).
 */
const VaultsSettings: React.FC = () => {
  const vaultsApi = typeof window !== "undefined" ? window.api?.vaults : undefined;

  const [vaults, setVaults] = useState<VaultInfo[]>([]);
  const [activeVaultId, setActiveVaultId] = useState(DEFAULT_VAULT_ID);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((result: VaultListResult) => {
    setVaults(result.vaults);
    setActiveVaultId(result.activeVaultId);
  }, []);

  useEffect(() => {
    if (!vaultsApi) return;
    vaultsApi
      .list()
      .then(apply)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [vaultsApi, apply]);

  const run = useCallback(
    async (action: () => Promise<VaultListResult>) => {
      if (!vaultsApi || busy) return;
      setBusy(true);
      setError(null);
      try {
        apply(await action());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [vaultsApi, busy, apply]
  );

  if (!vaultsApi) {
    return null;
  }

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    void run(() => vaultsApi.create(name)).then(() => setNewName(""));
  };

  const handleSwitch = (id: string) => {
    // Switching restarts the backend and reloads the app; the list returned
    // here may never arrive because the window reloads first — that's fine.
    void run(() => vaultsApi.switch(id));
  };

  const handleRename = (id: string, currentName: string) => {
    const next = window.prompt("Rename vault", currentName);
    if (next === null) return;
    const name = next.trim();
    if (!name || name === currentName) return;
    void run(() => vaultsApi.rename(id, name));
  };

  const handleDelete = (id: string, name: string) => {
    const confirmed = window.confirm(
      `Remove the vault "${name}" from the list?\n\nIts database files are left on disk and can be re-added or deleted manually.`
    );
    if (!confirmed) return;
    void run(() => vaultsApi.delete(id));
  };

  return (
    <div className="settings-section">
      <Text size="big" id="vaults" className="settings-heading">
        Vaults
      </Text>
      <Text className="description">
        A vault is a separate, isolated data store with its own database,
        assets, and RAG collections. Switch vaults to keep different sets of
        workflows and data apart. Switching restarts the backend and reloads the
        app.
      </Text>

      <FlexColumn gap={1} style={{ marginTop: 8 }}>
        {vaults.map((vault) => {
          const isActive = vault.id === activeVaultId;
          const isDefault = vault.id === DEFAULT_VAULT_ID;
          return (
            <FlexRow
              key={vault.id}
              align="center"
              justify="space-between"
              gap={1}
              style={{ flexWrap: "wrap" }}
            >
              <Text>
                {vault.name}
                {isActive ? " — active" : ""}
              </Text>
              <FlexRow gap={1} align="center">
                {!isActive && (
                  <EditorButton
                    variant="contained"
                    size="small"
                    disabled={busy}
                    onClick={() => handleSwitch(vault.id)}
                  >
                    Switch
                  </EditorButton>
                )}
                <EditorButton
                  variant="outlined"
                  size="small"
                  disabled={busy || isDefault}
                  onClick={() => handleRename(vault.id, vault.name)}
                >
                  Rename
                </EditorButton>
                <EditorButton
                  variant="outlined"
                  size="small"
                  color="error"
                  disabled={busy || isDefault || isActive}
                  onClick={() => handleDelete(vault.id, vault.name)}
                >
                  Delete
                </EditorButton>
              </FlexRow>
            </FlexRow>
          );
        })}
      </FlexColumn>

      <FlexRow gap={1} align="flex-end" style={{ marginTop: 12 }}>
        <TextInput
          label="New vault name"
          value={newName}
          autoComplete="off"
          disabled={busy}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleCreate();
            }
          }}
        />
        <EditorButton
          variant="contained"
          size="small"
          disabled={busy || newName.trim().length === 0}
          onClick={handleCreate}
        >
          Create
        </EditorButton>
      </FlexRow>

      {error && (
        <Text color="error" style={{ marginTop: 8 }}>
          {error}
        </Text>
      )}
    </div>
  );
};

export default VaultsSettings;
