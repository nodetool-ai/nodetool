import React, { useState, useEffect, useCallback } from "react";
import {
  PackageInfo,
  PackageModel,
  PackageListResponse,
  InstalledPackageListResponse,
} from "../types";

interface PackageManagerProps {
  onSkip: () => void;
}

const PackageManager: React.FC<PackageManagerProps> = ({ onSkip }) => {
  const [availablePackages, setAvailablePackages] = useState<PackageInfo[]>([]);
  const [installedPackages, setInstalledPackages] = useState<PackageModel[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPackages();
  }, []);

  const loadPackages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load available packages
      const availableResponse: PackageListResponse =
        await window.electronAPI.packages.listAvailable();
      console.log("availableResponse", availableResponse);
      setAvailablePackages(availableResponse.packages || []);

      // Load installed packages
      const installedResponse: InstalledPackageListResponse =
        await window.electronAPI.packages.listInstalled();
      setInstalledPackages(installedResponse.packages || []);
      console.log("installedPackages", installedResponse.packages);
    } catch (err) {
      console.error("Failed to load packages:", err);
      setError("Failed to load packages. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInstall = useCallback(
    async (repoId: string) => {
      setInstalling((prev) => new Set(prev).add(repoId));
      try {
        const result = await window.electronAPI.packages.install(repoId);
        if (result.success) {
          // Notify user first to avoid blocking UI before reload
          alert(
            "Package installed successfully. The server will restart to apply changes."
          );
          // Reload lists after the message
          await loadPackages();
          // Trigger restart without awaiting to avoid UI hang
          try {
            window.api?.restartServer?.();
          } catch (e) {
            console.warn("Restart server failed:", e);
          }
        } else {
          setError(result.message || "Installation failed");
        }
      } catch (err) {
        console.error("Installation error:", err);
        setError("Installation failed. Please try again.");
      } finally {
        setInstalling((prev) => {
          const newSet = new Set(prev);
          newSet.delete(repoId);
          return newSet;
        });
      }
    },
    [loadPackages]
  );

  const handleUninstall = useCallback(
    async (repoId: string) => {
      setInstalling((prev) => new Set(prev).add(repoId));
      try {
        const result = await window.electronAPI.packages.uninstall(repoId);
        if (result.success) {
          await loadPackages(); // Refresh the package lists
        } else {
          setError(result.message || "Uninstallation failed");
        }
      } catch (err) {
        console.error("Uninstallation error:", err);
        setError("Uninstallation failed. Please try again.");
      } finally {
        setInstalling((prev) => {
          const newSet = new Set(prev);
          newSet.delete(repoId);
          return newSet;
        });
      }
    },
    [loadPackages]
  );

  const handleUpdate = useCallback(
    async (repoId: string) => {
      setInstalling((prev) => new Set(prev).add(repoId));
      try {
        const result = await window.electronAPI.packages.update(repoId);
        if (result.success) {
          alert(
            "Package updated successfully. The server will restart to apply changes."
          );
          await loadPackages();
          try {
            window.api?.restartServer?.();
          } catch (e) {
            console.warn("Restart server failed:", e);
          }
        } else {
          setError(result.message || "Update failed");
        }
      } catch (err) {
        console.error("Update error:", err);
        setError("Update failed. Please try again.");
      } finally {
        setInstalling((prev) => {
          const newSet = new Set(prev);
          newSet.delete(repoId);
          return newSet;
        });
      }
    },
    [loadPackages]
  );

  const isInstalled = useCallback(
    (repoId: string) => {
      return installedPackages.some((pkg) => pkg.repo_id === repoId);
    },
    [installedPackages]
  );

  const isProcessing = useCallback(
    (repoId: string) => {
      return installing.has(repoId);
    },
    [installing]
  );

  if (loading) {
    return (
      <div className="package-manager">
        <div className="loading-message">Loading packages...</div>
      </div>
    );
  }

  return (
    <div className="package-manager">
      <div className="package-manager-header">
        <h1>NodeTool Package Manager</h1>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)} className="dismiss-error">
            ×
          </button>
        </div>
      )}

      <div className="package-sections">
        <div className="package-section">
          <h2>Installed Packages ({installedPackages.length})</h2>
          {installedPackages.length === 0 ? (
            <p className="no-packages">No packages installed</p>
          ) : (
            <div className="package-list">
              {installedPackages.map((pkg) => (
                <div key={pkg.repo_id} className="package-item installed">
                  <div className="package-info">
                    <h3>{pkg.name}</h3>
                    <div className="version-info">
                      <p className="package-version">
                        Installed: v{pkg.version}
                      </p>
                      {pkg.hasUpdate && pkg.latestVersion && (
                        <p className="update-available">
                          Update available: v{pkg.latestVersion}
                        </p>
                      )}
                    </div>
                    <p className="package-description">{pkg.description}</p>
                  </div>
                  <div className="package-actions">
                    {pkg.hasUpdate && (
                      <button
                        className="update-button"
                        onClick={() => handleUpdate(pkg.repo_id)}
                        disabled={isProcessing(pkg.repo_id)}
                      >
                        {isProcessing(pkg.repo_id) ? "Updating..." : "Update"}
                      </button>
                    )}
                    <button
                      className="uninstall-button"
                      onClick={() => handleUninstall(pkg.repo_id)}
                      disabled={isProcessing(pkg.repo_id)}
                    >
                      {isProcessing(pkg.repo_id)
                        ? "Uninstalling..."
                        : "Uninstall"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="package-section">
          <h2>
            Available Packs (
            {
              availablePackages.filter((pkg) => !isInstalled(pkg.repo_id))
                .length
            }
            )
          </h2>
          {availablePackages.filter((pkg) => !isInstalled(pkg.repo_id))
            .length === 0 ? (
            <p className="no-packages">No packages available</p>
          ) : (
            <div className="package-list">
              {availablePackages
                .filter((pkg) => !isInstalled(pkg.repo_id))
                .map((pkg) => (
                  <div key={pkg.repo_id} className="package-item available">
                    <div className="package-info">
                      <h3>{pkg.name}</h3>
                      <p className="package-description">{pkg.description}</p>
                    </div>
                    <button
                      className="install-button"
                      onClick={() => handleInstall(pkg.repo_id)}
                      disabled={isProcessing(pkg.repo_id)}
                    >
                      {isProcessing(pkg.repo_id) ? "Installing..." : "Install"}
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PackageManager;
