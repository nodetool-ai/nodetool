import React, { useState, useEffect } from "react";
import "./settings.css";
import { UpdateInfo } from "../src/types";

const Settings: React.FC = () => {
  const [autoUpdatesEnabled, setAutoUpdatesEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

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
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
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
