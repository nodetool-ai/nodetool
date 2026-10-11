/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useState } from "react";
import {
  Text,
  TextInput,
  EditorButton,
  FlexColumn,
  FlexRow,
  Dialog,
  ConfirmDialog,
  AlertBanner,
  SPACING
} from "../ui_primitives";

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
  const [renameTarget, setRenameTarget] = useState<VaultInfo | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<VaultInfo | null>(null);

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

  const handleRename = (vault: VaultInfo) => {
    setRenameValue(vault.name);
    setRenameTarget(vault);
  };

  const closeRename = () => setRenameTarget(null);

  const confirmRename = () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    const { id, name: currentName } = renameTarget;
    setRenameTarget(null);
    if (!name || name === currentName) return;
    void run(() => vaultsApi.rename(id, name));
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    void run(() => vaultsApi.delete(id));
  };

  return (
    <div className="settings-section">
      <Text size="big" id="vaults" className="settings-heading">
        Vaults
      </Text>
      <FlexColumn gap={SPACING.lg}>
        <Text className="description">
          A vault is a separate, isolated data store with its own database,
          assets, and RAG collections. Switch vaults to keep different sets of
          workflows and data apart. Switching restarts the backend and reloads the
          app.
        </Text>

        <FlexColumn gap={1}>
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
                    onClick={() => handleRename(vault)}
                  >
                    Rename
                  </EditorButton>
                  <EditorButton
                    variant="outlined"
                    size="small"
                    color="error"
                    disabled={busy || isDefault || isActive}
                    onClick={() => setDeleteTarget(vault)}
                  >
                    Delete
                  </EditorButton>
                </FlexRow>
              </FlexRow>
            );
          })}
        </FlexColumn>

        <FlexRow gap={1} align="flex-end">
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

        {error && <AlertBanner severity="error">{error}</AlertBanner>}
      </FlexColumn>

      <Dialog
        open={renameTarget !== null}
        onClose={closeRename}
        title="Rename vault"
        onConfirm={confirmRename}
        confirmText="Rename"
        confirmDisabled={renameValue.trim().length === 0}
        maxWidth="xs"
        fullWidth
      >
        <TextInput
          label="Vault name"
          value={renameValue}
          autoComplete="off"
          autoFocus
          fullWidth
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirmRename();
            }
          }}
        />
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Remove vault?"
        content={`"${deleteTarget?.name ?? ""}" is removed from the list. Its database files stay on disk and can be re-added or deleted manually.`}
        confirmText="Remove"
        cancelText="Cancel"
        destructive
      />
    </div>
  );
};

export default VaultsSettings;
