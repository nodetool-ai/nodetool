import React, { useState, useEffect } from "react";
import "./settings.css";
import { UpdateInfo, Vault } from "../src/types";

const DEFAULT_VAULT_ID = "default";

const Settings: React.FC = () => {
  const [autoUpdatesEnabled, setAutoUpdatesEnabled] = useState(false);
  const [startLlamaCppOnStartup, setStartLlamaCppOnStartup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serviceSaving, setServiceSaving] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  // Vaults: switchable, isolated data stores (each its own SQLite database).
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [activeVaultId, setActiveVaultId] = useState<string>(DEFAULT_VAULT_ID);
  const [newVaultName, setNewVaultName] = useState("");
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    // Subscribe to update available events
    if (window.api?.updates?.onAvailable) {
      const unsubscribe = window.api.updates.onAvailable((info: UpdateInfo) => {
        setUpdateInfo(info);
      });
      return () => {
        unsubscribe?.();
      };
    }
  }, []);

  const initialize = async () => {
    try {
      if (window.api?.settings?.getAutoUpdates) {
        const enabled = await window.api.settings.getAutoUpdates();
        setAutoUpdatesEnabled(enabled);
      }
      if (window.api?.settings?.getModelServicesStartup) {
        const startup = await window.api.settings.getModelServicesStartup();
        setStartLlamaCppOnStartup(startup.startLlamaCppOnStartup);
      }
      if (window.api?.vaults?.list) {
        const result = await window.api.vaults.list();
        setVaults(result.vaults);
        setActiveVaultId(result.activeVaultId);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVault = async () => {
    const name = newVaultName.trim();
    if (!name || vaultBusy || !window.api?.vaults?.create) return;
    setVaultBusy(true);
    setVaultError(null);
    try {
      const result = await window.api.vaults.create(name);
      setVaults(result.vaults);
      setActiveVaultId(result.activeVaultId);
      setNewVaultName("");
    } catch (error) {
      setVaultError(error instanceof Error ? error.message : String(error));
    } finally {
      setVaultBusy(false);
    }
  };

  const handleSwitchVault = async (id: string) => {
    if (id === activeVaultId || vaultBusy || !window.api?.vaults?.switch) return;
    setVaultBusy(true);
    setVaultError(null);
    try {
      // Switching restarts the backend and reloads the main window; the
      // settings window stays open and reflects the new active vault.
      const result = await window.api.vaults.switch(id);
      setVaults(result.vaults);
      setActiveVaultId(result.activeVaultId);
    } catch (error) {
      setVaultError(error instanceof Error ? error.message : String(error));
    } finally {
      setVaultBusy(false);
    }
  };

  const handleRenameVault = async (id: string, currentName: string) => {
    if (vaultBusy || !window.api?.vaults?.rename) return;
    const next = window.prompt("Rename vault", currentName);
    if (next === null) return;
    const name = next.trim();
    if (!name || name === currentName) return;
    setVaultBusy(true);
    setVaultError(null);
    try {
      const result = await window.api.vaults.rename(id, name);
      setVaults(result.vaults);
      setActiveVaultId(result.activeVaultId);
    } catch (error) {
      setVaultError(error instanceof Error ? error.message : String(error));
    } finally {
      setVaultBusy(false);
    }
  };

  const handleDeleteVault = async (id: string, name: string) => {
    if (vaultBusy || !window.api?.vaults?.delete) return;
    const confirmed = window.confirm(
      `Remove the vault "${name}" from the list?\n\nIts database files are left on disk and can be re-added or deleted manually.`
    );
    if (!confirmed) return;
    setVaultBusy(true);
    setVaultError(null);
    try {
      const result = await window.api.vaults.delete(id);
      setVaults(result.vaults);
      setActiveVaultId(result.activeVaultId);
    } catch (error) {
      setVaultError(error instanceof Error ? error.message : String(error));
    } finally {
      setVaultBusy(false);
    }
  };

  const handleAutoUpdatesToggle = async () => {
    if (saving) return;

    const newValue = !autoUpdatesEnabled;
    setSaving(true);

    try {
      if (window.api?.settings?.setAutoUpdates) {
        await window.api.settings.setAutoUpdates(newValue);
        setAutoUpdatesEnabled(newValue);
      }
    } catch (error) {
      console.error("Failed to save auto-updates setting:", error);
      alert("Failed to save setting. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleInstallUpdate = async () => {
    if (isInstalling || !updateInfo) return;

    setIsInstalling(true);

    try {
      if (window.api?.updates?.restartAndInstall) {
        await window.api.updates.restartAndInstall();
      }
    } catch (error) {
      console.error("Failed to install update:", error);
      alert("Failed to install update. Please try again.");
      setIsInstalling(false);
    }
  };

  const handleModelServiceStartupToggle = async (
    key: "startLlamaCppOnStartup",
    value: boolean
  ) => {
    if (serviceSaving) return;
    setServiceSaving(true);

    try {
      if (window.api?.settings?.setModelServicesStartup) {
        const next = await window.api.settings.setModelServicesStartup({
          [key]: value,
        });
        setStartLlamaCppOnStartup(next.startLlamaCppOnStartup);
      }
    } catch (error) {
      console.error("Failed to save model service startup setting:", error);
      alert("Failed to save setting. Please try again.");
    } finally {
      setServiceSaving(false);
    }
  };

  const openReleaseNotes = () => {
    if (updateInfo?.releaseUrl && window.api?.shell?.openExternal) {
      window.api.shell.openExternal(updateInfo.releaseUrl);
    }
  };

  if (loading) {
    return (
      <div className="app-wrapper">
        <div className="header-region">
          <h1>Settings</h1>
        </div>
        <div className="container">
          <div className="loading-container">
            <div className="spinner"></div>
            <div>Loading settings...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      <div className="header-region">
        <h1>Settings</h1>
      </div>

      <div className="container">
        {/* Update Available Banner */}
        {updateInfo && (
          <div className="update-banner">
            <div className="update-banner-content">
              <div className="update-banner-icon">🎉</div>
              <div className="update-banner-text">
                <div className="update-banner-title">
                  Update Available: v{updateInfo.version}
                </div>
                <div className="update-banner-subtitle">
                  {updateInfo.downloaded
                    ? "Update downloaded and ready to install"
                    : "A new version is available"}
                </div>
              </div>
            </div>
            <div className="update-banner-actions">
              <button
                className="btn btn-secondary"
                onClick={openReleaseNotes}
              >
                Release Notes
              </button>
              <button
                className="btn btn-primary"
                onClick={handleInstallUpdate}
                disabled={isInstalling || !updateInfo.downloaded}
              >
                {isInstalling
                  ? "Installing..."
                  : updateInfo.downloaded
                  ? "Restart & Install"
                  : "Downloading..."}
              </button>
            </div>
          </div>
        )}

        {/* Settings Sections */}
        <div className="settings-section">
          <div className="settings-section-header">
            <h2>Local Model Services</h2>
            <p className="settings-section-description">
              Control which Electron-managed local model services start when NodeTool launches
            </p>
          </div>

          <div className="settings-card">
            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Start Llama.cpp on Startup</div>
                <div className="setting-description">
                  Start or attach to `llama-server` when the desktop app starts.
                </div>
              </div>
              <div className="setting-control">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={startLlamaCppOnStartup}
                    onChange={(event) =>
                      void handleModelServiceStartupToggle(
                        "startLlamaCppOnStartup",
                        event.target.checked
                      )
                    }
                    disabled={serviceSaving}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <h2>Updates</h2>
            <p className="settings-section-description">
              Configure how NodeTool handles application updates
            </p>
          </div>

          <div className="settings-card">
            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Automatic Updates</div>
                <div className="setting-description">
                  Automatically check for and download updates when the application starts.
                  When disabled, you can manually check for updates from the Help menu.
                </div>
              </div>
              <div className="setting-control">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={autoUpdatesEnabled}
                    onChange={handleAutoUpdatesToggle}
                    disabled={saving}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Vaults Section */}
        <div className="settings-section">
          <div className="settings-section-header">
            <h2>Vaults</h2>
            <p className="settings-section-description">
              A vault is a separate, isolated data store with its own database,
              assets, and RAG collections. Switch vaults to keep different sets
              of workflows and data apart. Switching restarts the backend and
              reloads the app.
            </p>
          </div>

          <div className="settings-card">
            {vaults.map((vault) => {
              const isActive = vault.id === activeVaultId;
              const isDefault = vault.id === DEFAULT_VAULT_ID;
              return (
                <div className="setting-row" key={vault.id}>
                  <div className="setting-info">
                    <div className="setting-label">
                      {vault.name}
                      {isActive && (
                        <span className="vault-badge">Active</span>
                      )}
                    </div>
                    <div className="setting-description">
                      {isDefault
                        ? "The original data store."
                        : vault.dbPath ?? ""}
                    </div>
                  </div>
                  <div className="setting-control vault-actions">
                    {!isActive && (
                      <button
                        className="btn btn-primary"
                        onClick={() => void handleSwitchVault(vault.id)}
                        disabled={vaultBusy}
                      >
                        Switch
                      </button>
                    )}
                    <button
                      className="btn btn-secondary"
                      onClick={() =>
                        void handleRenameVault(vault.id, vault.name)
                      }
                      disabled={vaultBusy || isDefault}
                    >
                      Rename
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => void handleDeleteVault(vault.id, vault.name)}
                      disabled={vaultBusy || isDefault || isActive}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Create a new vault</div>
                <div className="setting-description">
                  Starts an empty database in its own folder.
                </div>
              </div>
              <div className="setting-control vault-create">
                <input
                  className="vault-input"
                  type="text"
                  placeholder="Vault name"
                  value={newVaultName}
                  maxLength={100}
                  onChange={(event) => setNewVaultName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void handleCreateVault();
                    }
                  }}
                  disabled={vaultBusy}
                />
                <button
                  className="btn btn-primary"
                  onClick={() => void handleCreateVault()}
                  disabled={vaultBusy || newVaultName.trim().length === 0}
                >
                  Create
                </button>
              </div>
            </div>
          </div>

          {vaultError && <div className="vault-error">{vaultError}</div>}
        </div>

        {/* Info Section */}
        <div className="info-section">
          <div className="info-icon">ℹ️</div>
          <div className="info-text">
            Settings are saved immediately. Auto-update preference will take effect on the next application restart.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
