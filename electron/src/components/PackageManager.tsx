import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  PackageInfo,
  PackageModel,
  PackageListResponse,
  InstalledPackageListResponse,
  RuntimePackageStatus,
  RuntimePackageId,
} from "../types";

interface PackageManagerProps {
  onSkip: () => void;
}

const MAX_CONSOLE_LINES = 500;

const PackageManager: React.FC<PackageManagerProps> = ({ onSkip }) => {
  const [availablePackages, setAvailablePackages] = useState<PackageInfo[]>([]);
  const [installedPackages, setInstalledPackages] = useState<PackageModel[]>(
    []
  );
  const [runtimePackages, setRuntimePackages] = useState<
    RuntimePackageStatus[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [installLocation, setInstallLocation] = useState<string>("");
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [isConsoleCollapsed, setIsConsoleCollapsed] = useState(false);
  const consoleBodyRef = useRef<HTMLDivElement | null>(null);

  const loadRuntimeStatuses = useCallback(async () => {
    try {
      const [statuses, location] = await Promise.all([
        window.api.packages.getRuntimeStatuses(),
        window.api.packages.getInstallLocation(),
      ]);
      setRuntimePackages(statuses);
      setInstallLocation(location);
    } catch (err) {
      console.error("Failed to load runtime statuses:", err);
    }
  }, []);

  const loadPackages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [availableResponse, installedResponse] = await Promise.all([
        window.api.packages.listAvailable().catch(() => ({ packages: [] })),
        window.api.packages.listInstalled().catch(() => ({ packages: [] })),
      ]);

      setAvailablePackages(
        (availableResponse as PackageListResponse).packages || []
      );
      setInstalledPackages(
        (installedResponse as InstalledPackageListResponse).packages || []
      );

      await loadRuntimeStatuses();
    } catch (err) {
      setError("Failed to load packages. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [loadRuntimeStatuses]);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  // Stream live command output from the main process into the console panel.
  // `server-log` is broadcast for every stdout/stderr line from uv and
  // micromamba during install/uninstall/update operations.
  useEffect(() => {
    const unsubscribe = window.api.server.onLog((message: string) => {
      setConsoleLogs((prev) => {
        const next = prev.length >= MAX_CONSOLE_LINES
          ? prev.slice(prev.length - MAX_CONSOLE_LINES + 1)
          : prev.slice();
        next.push(message);
        return next;
      });
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Auto-scroll the console to the newest line when logs arrive.
  useEffect(() => {
    if (isConsoleCollapsed) return;
    const body = consoleBodyRef.current;
    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  }, [consoleLogs, isConsoleCollapsed]);

  const handleClearConsole = useCallback(() => {
    setConsoleLogs([]);
  }, []);

  const handleToggleConsole = useCallback(() => {
    setIsConsoleCollapsed((prev) => !prev);
  }, []);

  const handleSelectLocation = useCallback(async () => {
    try {
      const selected = await window.api.packages.selectInstallLocation();
      if (selected) {
        setInstallLocation(selected);
      }
    } catch (err) {
      console.error("Failed to select location:", err);
    }
  }, []);

  const handleRuntimeInstall = useCallback(
    async (packageId: RuntimePackageId) => {
      setInstalling((prev) => new Set(prev).add(packageId));
      try {
        const location = installLocation || undefined;
        const result = await window.api.packages.installRuntime(
          packageId,
          location
        );
        if (result.success) {
          await loadRuntimeStatuses();
        } else {
          setError(result.message || "Installation failed");
        }
      } catch (err) {
        console.error("Runtime installation error:", err);
        setError("Installation failed. Please try again.");
      } finally {
        setInstalling((prev) => {
          const newSet = new Set(prev);
          newSet.delete(packageId);
          return newSet;
        });
      }
    },
    [loadRuntimeStatuses, installLocation]
  );

  const handleInstall = useCallback(
    async (repoId: string) => {
      setInstalling((prev) => new Set(prev).add(repoId));
      try {
        const result = await window.api.packages.install(repoId);
        if (result.success) {
          alert(
            "Package installed successfully. The server will restart to apply changes."
          );
          await loadPackages();
          try {
            window.api.server.restart();
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
        const result = await window.api.packages.uninstall(repoId);
        if (result.success) {
          await loadPackages();
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
        const result = await window.api.packages.update(repoId);
        if (result.success) {
          alert(
            "Package updated successfully. The server will restart to apply changes."
          );
          await loadPackages();
          try {
            window.api.server.restart();
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

  const getInstalledPackage = useCallback(
    (repoId: string) => {
      return installedPackages.find((pkg) => pkg.repo_id === repoId);
    },
    [installedPackages]
  );

  const isProcessing = useCallback(
    (id: string) => {
      return installing.has(id);
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
        <p style={{ color: "#999", margin: "8px 0 0" }}>
          Install runtimes and packages to extend NodeTool's capabilities.
        </p>
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
        {/* Runtime Packages Section */}
        <div className="package-section">
          <h2>Runtime Packages</h2>
          <p className="section-description" style={{ color: "#999", margin: "4px 0 12px", fontSize: "13px" }}>
            Core runtimes for AI capabilities. Install what you need.
          </p>

          {/* Install location selector */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              margin: "0 0 16px",
              padding: "10px 14px",
              background: "rgba(255,255,255,0.04)",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          >
            <span style={{ color: "#999", whiteSpace: "nowrap" }}>
              Install location:
            </span>
            <code
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "#ccc",
                fontSize: "12px",
              }}
              title={installLocation}
            >
              {installLocation}
            </code>
            <button
              onClick={handleSelectLocation}
              style={{
                padding: "4px 10px",
                borderRadius: "4px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "transparent",
                color: "#ccc",
                cursor: "pointer",
                fontSize: "12px",
                whiteSpace: "nowrap",
              }}
            >
              Change
            </button>
          </div>

          <div className="package-list">
            {runtimePackages.map((pkg) => {
              return (
                <div
                  key={pkg.id}
                  className={`package-item ${pkg.installed ? "installed" : "available"}`}
                >
                  <div className="package-info">
                    <div className="package-header-row">
                      <h3>{pkg.name}</h3>
                      {pkg.installed && (
                        <span className="status-badge up-to-date">
                          INSTALLED
                        </span>
                      )}
                    </div>
                    <p className="package-description">{pkg.description}</p>
                  </div>
                  <div className="package-actions">
                    {pkg.installed ? (
                      <button className="installed-indicator" disabled>
                        Installed
                      </button>
                    ) : (
                      <button
                        className="install-button"
                        onClick={() => handleRuntimeInstall(pkg.id)}
                        disabled={
                          isProcessing(pkg.id) ||
                          pkg.installing
                        }
                      >
                        {isProcessing(pkg.id) || pkg.installing
                          ? "Installing..."
                          : "Install"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Installed Packages Section */}
        {installedPackages.length > 0 && (
          <div className="package-section">
            <h2>Installed Packages ({installedPackages.length})</h2>
            <div className="package-list">
              {installedPackages.map((pkg) => (
                <div key={pkg.repo_id} className="package-item installed">
                  <div className="package-info">
                    <div className="package-header-row">
                      <h3>{pkg.name}</h3>
                      <span className="status-badge up-to-date">INSTALLED</span>
                    </div>
                    <div className="version-info">
                      <p className="package-version">v{pkg.version}</p>
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
          </div>
        )}

        {/* Available Packages Section */}
        <div className="package-section">
          <h2>Available Packs ({availablePackages.length})</h2>
          {availablePackages.length === 0 ? (
            <p className="no-packages">No packages available</p>
          ) : (
            <div className="package-list">
              {availablePackages.map((pkg) => {
                const installed = isInstalled(pkg.repo_id);
                const installedPkg = getInstalledPackage(pkg.repo_id);
                const hasUpdate = installedPkg?.hasUpdate || false;
                const isUpToDate = installed && !hasUpdate;

                return (
                  <div
                    key={pkg.repo_id}
                    className={`package-item ${installed ? "installed" : "available"}`}
                  >
                    <div className="package-info">
                      <div className="package-header-row">
                        <h3>{pkg.name}</h3>
                        {isUpToDate && (
                          <span className="status-badge up-to-date">
                            UP-TO-DATE
                          </span>
                        )}
                        {hasUpdate && (
                          <span className="status-badge update-available">
                            UPDATE AVAILABLE
                          </span>
                        )}
                      </div>
                      {installed && installedPkg && (
                        <p className="package-version">
                          v{installedPkg.version}
                          {hasUpdate && installedPkg.latestVersion && (
                            <span className="version-arrow">
                              {" "}
                              -&gt; v{installedPkg.latestVersion}
                            </span>
                          )}
                        </p>
                      )}
                      <p className="package-description">{pkg.description}</p>
                    </div>
                    <div className="package-actions">
                      {installed ? (
                        <>
                          {hasUpdate && (
                            <button
                              className="update-button"
                              onClick={() => handleUpdate(pkg.repo_id)}
                              disabled={isProcessing(pkg.repo_id)}
                            >
                              {isProcessing(pkg.repo_id)
                                ? "Updating..."
                                : "Update"}
                            </button>
                          )}
                          <button className="installed-indicator" disabled>
                            Installed
                          </button>
                        </>
                      ) : (
                        <button
                          className="install-button"
                          onClick={() => handleInstall(pkg.repo_id)}
                          disabled={isProcessing(pkg.repo_id)}
                        >
                          {isProcessing(pkg.repo_id)
                            ? "Installing..."
                            : "Install"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div
        className={`package-console ${
          isConsoleCollapsed ? "collapsed" : ""
        }`}
      >
        <div className="package-console-header">
          <div className="package-console-title">
            <span className="package-console-indicator" />
            Console output
            {consoleLogs.length > 0 && (
              <span className="package-console-count">
                ({consoleLogs.length})
              </span>
            )}
          </div>
          <div className="package-console-actions">
            <button
              type="button"
              className="package-console-button"
              onClick={handleClearConsole}
              disabled={consoleLogs.length === 0}
            >
              Clear
            </button>
            <button
              type="button"
              className="package-console-button"
              onClick={handleToggleConsole}
            >
              {isConsoleCollapsed ? "Show" : "Hide"}
            </button>
          </div>
        </div>
        {!isConsoleCollapsed && (
          <div
            className="package-console-body"
            ref={consoleBodyRef}
            role="log"
            aria-live="polite"
            aria-label="Package manager console output"
          >
            {consoleLogs.length === 0 ? (
              <div className="package-console-empty">
                Console output will appear here when you install, update, or
                uninstall a package.
              </div>
            ) : (
              consoleLogs.map((line, i) => (
                <div
                  key={`${i}-${line.length}`}
                  className="package-console-line"
                >
                  {line}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div
        style={{
          padding: "16px 24px",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <button
          className="nav-button next"
          onClick={onSkip}
          style={{
            padding: "10px 24px",
            borderRadius: "8px",
            border: "none",
            background: "var(--c_primary, #4a9eff)",
            color: "#fff",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          Continue to App
        </button>
      </div>
    </div>
  );
};

export default PackageManager;
