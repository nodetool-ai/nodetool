import React, { useState, useEffect, useCallback, useRef } from "react";
import "./packages.css";
import {
  PackageModel,
  PackageListResponse,
  InstalledPackageListResponse,
  PackageResponse,
  PackageInfo,
  RuntimePackageId,
} from "../src/types";

interface RuntimeStatus {
  id: string;
  name: string;
  description: string;
  installed: boolean;
  installing: boolean;
}

const PackageManager: React.FC = () => {
  const [availablePackages, setAvailablePackages] = useState<PackageInfo[]>([]);
  const [installedPackages, setInstalledPackages] = useState<PackageModel[]>(
    []
  );
  const [filteredPackages, setFilteredPackages] = useState<PackageInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activePackageId, setActivePackageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodeQuery, setNodeQuery] = useState("");
  const [nodeResults, setNodeResults] = useState<any[]>([]);
  const [nodeSearching, setNodeSearching] = useState(false);

  // Runtime state
  const [runtimes, setRuntimes] = useState<RuntimeStatus[]>([]);
  const [runtimesLoading, setRuntimesLoading] = useState(true);
  const [installingRuntimes, setInstallingRuntimes] = useState<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<"all" | "installed" | "available" | "updates" | "runtimes">("all");

  // Global processing flag that covers both Python package ops and runtime installs
  const isAnyProcessing = isProcessing || installingRuntimes.size > 0;

  // Live console output from package manager commands (uv / micromamba)
  const MAX_CONSOLE_LINES = 500;
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [isConsoleCollapsed, setIsConsoleCollapsed] = useState(false);
  const consoleBodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    // Check for nodeSearch query parameter after component mounts
    const urlParams = new URLSearchParams(window.location.search);
    const nodeSearchParam = urlParams.get("nodeSearch");
    if (nodeSearchParam) {
      handleNodeSearch(nodeSearchParam);
    }
  }, []);

  useEffect(() => {
    filterPackages();
  }, [searchTerm, availablePackages, installedPackages, activeTab]);

  // Load runtime statuses
  const loadRuntimes = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.packages?.getRuntimeStatuses) {
      setRuntimesLoading(false);
      return;
    }
    try {
      const statuses = await api.packages.getRuntimeStatuses();
      setRuntimes(statuses);
    } catch (err) {
      console.error("Failed to load runtime statuses:", err);
    } finally {
      setRuntimesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRuntimes();
  }, [loadRuntimes]);

  // Subscribe to server-log events. The main process emits these for every
  // stdout/stderr line from uv (pip install/uninstall/update) and micromamba
  // (runtime install/uninstall), giving us a live console feed.
  useEffect(() => {
    const api = window.electronAPI;
    const onLog =
      api?.server?.onLog ?? api?.onServerLog ?? window.electronAPI?.server?.onLog;
    if (typeof onLog !== "function") return;

    const unsubscribe = onLog((message: string) => {
      setConsoleLogs((prev) => {
        const next = prev.length >= MAX_CONSOLE_LINES
          ? prev.slice(prev.length - MAX_CONSOLE_LINES + 1)
          : prev.slice();
        next.push(message);
        return next;
      });
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  // Auto-scroll to newest console line.
  useEffect(() => {
    if (isConsoleCollapsed) return;
    const body = consoleBodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [consoleLogs, isConsoleCollapsed]);

  const handleClearConsole = useCallback(() => {
    setConsoleLogs([]);
  }, []);

  const handleToggleConsole = useCallback(() => {
    setIsConsoleCollapsed((prev) => !prev);
  }, []);

  const handleInstallRuntime = useCallback(async (runtimeId: RuntimePackageId) => {
    if (isProcessing) return;
    const api = window.electronAPI;
    if (!api?.packages?.installRuntime) return;

    setInstallingRuntimes(prev => new Set(prev).add(runtimeId));
    setError(null);
    try {
      const result = await api.packages.installRuntime(runtimeId);
      if (result.success) {
        await loadRuntimes();
      } else {
        setError(result.message || "Runtime installation failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Runtime installation failed");
    } finally {
      setInstallingRuntimes(prev => {
        const next = new Set(prev);
        next.delete(runtimeId);
        return next;
      });
    }
  }, [loadRuntimes, isProcessing]);

  const handleUninstallRuntime = useCallback(async (runtimeId: RuntimePackageId) => {
    if (isProcessing) return;
    const api = window.electronAPI;
    if (!api?.packages?.uninstallRuntime) return;

    setInstallingRuntimes(prev => new Set(prev).add(runtimeId));
    setError(null);
    try {
      const result = await api.packages.uninstallRuntime(runtimeId);
      if (result.success) {
        await loadRuntimes();
      } else {
        setError(result.message || "Runtime uninstall failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Runtime uninstall failed");
    } finally {
      setInstallingRuntimes(prev => {
        const next = new Set(prev);
        next.delete(runtimeId);
        return next;
      });
    }
  }, [loadRuntimes, isProcessing]);

  const initialize = async () => {
    try {
      const [availableData, installedData] = await Promise.all([
        fetchAvailablePackages(),
        fetchInstalledPackages(),
      ]);

      setAvailablePackages(availableData.packages || []);
      setInstalledPackages(installedData.packages || []);
      setFilteredPackages(availableData.packages || []);
      setLoading(false);
    } catch (error: any) {
      setError(error.message);
      setLoading(false);
    }
  };

  const fetchAvailablePackages = async (): Promise<PackageListResponse> => {
    if (!window.electronAPI) {
      throw new Error("Electron API is not available");
    }
    if (!window.electronAPI.packages) {
      throw new Error("Package API is not available");
    }
    return await window.electronAPI.packages.listAvailable();
  };

  const fetchInstalledPackages =
    async (): Promise<InstalledPackageListResponse> => {
      if (!window.electronAPI) {
        throw new Error("Electron API is not available");
      }
      if (!window.electronAPI.packages) {
        throw new Error("Package API is not available");
      }
      return await window.electronAPI.packages.listInstalled();
    };

  const installPackage = async (repoId: string): Promise<PackageResponse> => {
    return await window.electronAPI.packages.install(repoId);
  };

  const uninstallPackage = async (repoId: string): Promise<PackageResponse> => {
    return await window.electronAPI.packages.uninstall(repoId);
  };

  const updatePackage = async (repoId: string): Promise<PackageResponse> => {
    return await window.electronAPI.packages.update(repoId);
  };

  const filterPackages = () => {
    const term = searchTerm.toLowerCase();

    let baseList = availablePackages;

    if (activeTab === "installed") {
      baseList = availablePackages.filter(p => isPackageInstalled(p.repo_id));
    } else if (activeTab === "available") {
      baseList = availablePackages.filter(p => !isPackageInstalled(p.repo_id));
    } else if (activeTab === "updates") {
      baseList = availablePackages.filter(p => hasUpdate(p.repo_id));
    }

    const filtered = baseList.filter(
      (pkg) =>
        pkg.name.toLowerCase().includes(term) ||
        pkg.description.toLowerCase().includes(term) ||
        pkg.repo_id.toLowerCase().includes(term)
    );
    setFilteredPackages(filtered);
  };

  const isPackageInstalled = (repoId: string): boolean => {
    return installedPackages.some((pkg) => pkg.repo_id === repoId);
  };

  const getInstalledPackage = (repoId: string): PackageModel | undefined => {
    return installedPackages.find((pkg) => pkg.repo_id === repoId);
  };

  const hasUpdate = (repoId: string): boolean => {
    const installedPkg = getInstalledPackage(repoId);
    return installedPkg?.hasUpdate || false;
  };

  const handlePackageAction = async (repoId: string, isInstalled: boolean) => {
    if (isAnyProcessing || !repoId) return;

    setIsProcessing(true);
    setActivePackageId(repoId);

    try {
      let result: PackageResponse;
      if (isInstalled) {
        result = await uninstallPackage(repoId);
      } else {
        result = await installPackage(repoId);
      }

      if (!result.success) {
        throw new Error(result.message);
      }

      if (!isInstalled) {
        alert(
          "Package installed successfully. The server will restart to apply changes."
        );
        // Reload after showing the message
        const installedData = await fetchInstalledPackages();
        setInstalledPackages(installedData.packages || []);
        // Trigger restart without awaiting to avoid UI hang
        try {
          window.electronAPI?.restartServer?.();
        } catch (e) {
          console.warn("Restart server failed:", e);
        }
      } else {
        // For uninstall path, keep behavior
        const installedData = await fetchInstalledPackages();
        setInstalledPackages(installedData.packages || []);
      }
    } catch (error: any) {
      console.error("Package action failed:", error);
      alert(
        `Failed to ${isInstalled ? "uninstall" : "install"} package: ${error.message
        }`
      );
    } finally {
      setIsProcessing(false);
      setActivePackageId(null);
    }
  };

  const handleUpdatePackage = async (repoId: string) => {
    if (isAnyProcessing || !repoId) return;

    setIsProcessing(true);
    setActivePackageId(repoId);

    try {
      const result = await updatePackage(repoId);

      if (!result.success) {
        throw new Error(result.message);
      }

      alert(
        "Package updated successfully. The server will restart to apply changes."
      );
      // Reload after showing the message
      const installedData = await fetchInstalledPackages();
      setInstalledPackages(installedData.packages || []);
      // Trigger restart without awaiting to avoid UI hang
      try {
        window.electronAPI?.restartServer?.();
      } catch (e) {
        console.warn("Restart server failed:", e);
      }
    } catch (error: any) {
      console.error("Package update failed:", error);
      alert(`Failed to update package: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setActivePackageId(null);
    }
  };

  const openExternal = (url: string) => {
    if (window.electronAPI && window.electronAPI.openExternal) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleNodeSearch = async (q: string) => {
    setNodeQuery(q);
    const query = q.trim();
    if (!query) {
      setNodeResults([]);
      return;
    }
    if (!window.electronAPI?.packages?.searchNodes) return;
    setNodeSearching(true);
    try {
      const results = await window.electronAPI.packages.searchNodes(query);
      setNodeResults(results || []);
    } catch (e) {
      // ignore, keep previous results
    } finally {
      setNodeSearching(false);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="loading-container">
          <div className="spinner"></div>
          <div>Loading packages...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="error-container">
          <div className="error-message">
            <div style={{ fontSize: "18px", marginBottom: "8px" }}>
              Error loading packages
            </div>
            <div>{error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      <div className="header-region">
        <h1>Package Manager</h1>
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All Packages
          </button>
          <button
            className={`tab ${activeTab === 'installed' ? 'active' : ''}`}
            onClick={() => setActiveTab('installed')}
          >
            Installed
          </button>
          <button
            className={`tab ${activeTab === 'available' ? 'active' : ''}`}
            onClick={() => setActiveTab('available')}
          >
            Available
          </button>
          <button
            className={`tab ${activeTab === 'updates' ? 'active' : ''}`}
            onClick={() => setActiveTab('updates')}
          >
            Updates
          </button>
          <button
            className={`tab ${activeTab === 'runtimes' ? 'active' : ''}`}
            onClick={() => setActiveTab('runtimes')}
          >
            Runtimes
          </button>
        </div>
      </div>

      <div className="container">
        {activeTab === "runtimes" ? (
          <div className="runtimes-section">
            <p className="runtimes-description">
              Runtimes and optional Node.js modules enable extra features such as video processing, code execution, Claude/Codex agents, Transformers.js, and TensorFlow.js nodes.
            </p>
            {error && (
              <div className="error-banner">
                {error}
                <button className="error-dismiss" onClick={() => setError(null)}>&times;</button>
              </div>
            )}
            {runtimesLoading ? (
              <div className="loading-container">
                <div className="spinner"></div>
                <div>Loading runtimes...</div>
              </div>
            ) : (
              <div className="runtime-grid">
                {runtimes.map((rt) => {
                  const isInstalling = installingRuntimes.has(rt.id) || rt.installing;
                  return (
                    <div
                      key={rt.id}
                      className={`package-card ${rt.installed ? "installed" : ""}`}
                    >
                      <div className="package-card-header">
                        <div className="package-title-row">
                          <div className="package-name">{rt.name}</div>
                          {rt.installed && (
                            <div className="badges">
                              <span className="badge badge-installed">Installed</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="package-card-body">
                        <p className="package-description">{rt.description}</p>
                      </div>
                      <div className="package-card-footer">
                        {rt.installed ? (
                          <button
                            className="btn btn-outline-danger full-width"
                            onClick={() => handleUninstallRuntime(rt.id as RuntimePackageId)}
                            disabled={isInstalling || isAnyProcessing}
                          >
                            {isInstalling ? "Removing..." : "Uninstall"}
                          </button>
                        ) : (
                          <button
                            className="btn btn-primary full-width"
                            onClick={() => handleInstallRuntime(rt.id as RuntimePackageId)}
                            disabled={isInstalling || isAnyProcessing}
                          >
                            {isInstalling ? "Installing..." : "Install"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
        <>
        <div className="search-section">
          <div className="search-input-wrapper">
            <input
              type="text"
              className="search-input main-search"
              placeholder="Search packages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={isAnyProcessing}
            />
          </div>
          <div className="search-input-wrapper">
            <input
              type="text"
              className="search-input node-search"
              placeholder="Search specific nodes..."
              value={nodeQuery}
              onChange={(e) => handleNodeSearch(e.target.value)}
              disabled={isAnyProcessing}
            />
          </div>
        </div>

        {nodeQuery && (
          <div className="section-block">
            <div className="node-results-card">
              <div className="node-results-header">
                Node results{" "}
                {nodeSearching ? "(searching...)" : `(${nodeResults.length})`}
              </div>
              {nodeResults.length === 0 && !nodeSearching ? (
                <div className="empty-state-small">
                  <div>No nodes found matching "{nodeQuery}"</div>
                </div>
              ) : (
                nodeResults.slice(0, 20).map((n, idx) => (
                  <div
                    key={`${n.node_type}-${idx}`}
                    className="node-result-row"
                    data-package={n.package}
                  >
                    <div className="node-result-meta">
                      <div className="node-title">{n.title || n.node_type}</div>
                      <div className="node-desc">{n.description}</div>
                      <div className="node-pkg-badge">
                        {n.package}
                      </div>
                    </div>
                    <div className="node-action">
                      {!n.package ? (
                        <span className="status-text">—</span>
                      ) : !isPackageInstalled(n.package) ? (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handlePackageAction(n.package, false)}
                          disabled={isAnyProcessing}
                        >
                          {activePackageId === n.package ? <div className="spinner-small" /> : "Install"}
                        </button>
                      ) : (
                        <span className="status-text installed">
                          Installed
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="package-grid">
          {filteredPackages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📦</div>
              <h3>No packages found</h3>
              <p>Try adjusting your search filters</p>
            </div>
          ) : (
            filteredPackages.map((pkg) => {
              const installed = isPackageInstalled(pkg.repo_id);
              const updateAvailable = hasUpdate(pkg.repo_id);
              const installedPkg = getInstalledPackage(pkg.repo_id);
              const isActive = activePackageId === pkg.repo_id;

              return (
                <div
                  key={pkg.repo_id}
                  className={`package-card ${isActive ? "processing" : ""} ${installed ? "installed" : ""}`}
                >
                  <div className="package-card-header">
                    <div className="package-title-row">
                      <div className="package-name" title={pkg.name}>
                        {pkg.name}
                      </div>
                      {installed && (
                        <div className="badges">
                          <span className="badge badge-installed">Installed</span>
                        </div>
                      )}
                    </div>
                    {pkg.repo_id.includes("/") && (
                      <div className="package-repo-link">
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            openExternal(`https://github.com/${pkg.repo_id}`);
                          }}
                        >
                          {pkg.repo_id}
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="package-card-body">
                    <p className="package-description" title={pkg.description}>
                      {pkg.description || "No description available."}
                    </p>

                    <div className="package-meta">
                      {installed && installedPkg ? (
                        <>
                          <div className="version-info">
                            <span className="label">Ver:</span> {installedPkg.version}
                          </div>
                          {updateAvailable && installedPkg.latestVersion && (
                            <div className="update-alert">
                              Update: v{installedPkg.latestVersion}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="version-info">
                          <span className="label">Latest:</span> {pkg.version}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="package-card-footer">
                    {updateAvailable && (
                      <button
                        className="btn btn-warning full-width"
                        onClick={() => handleUpdatePackage(pkg.repo_id)}
                        disabled={isAnyProcessing}
                      >
                        {isActive ? <div className="spinner-small" /> : "Update v" + installedPkg?.latestVersion}
                      </button>
                    )}
                    <button
                      className={`btn full-width ${installed ? "btn-outline-danger" : "btn-primary"
                        }`}
                      onClick={() =>
                        handlePackageAction(pkg.repo_id, installed)
                      }
                      disabled={isAnyProcessing}
                    >
                      {isActive && !updateAvailable
                        ? <div className="spinner-small" />
                        : installed
                          ? "Uninstall"
                          : "Install"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>


        </>
        )}
      </div>

      <div
        className={`pm-console ${isConsoleCollapsed ? "collapsed" : ""}`}
      >
        <div className="pm-console-header">
          <div className="pm-console-title">
            <span className="pm-console-indicator" />
            Console output
            {consoleLogs.length > 0 && (
              <span className="pm-console-count">
                ({consoleLogs.length})
              </span>
            )}
          </div>
          <div className="pm-console-actions">
            <button
              type="button"
              className="pm-console-button"
              onClick={handleClearConsole}
              disabled={consoleLogs.length === 0}
            >
              Clear
            </button>
            <button
              type="button"
              className="pm-console-button"
              onClick={handleToggleConsole}
            >
              {isConsoleCollapsed ? "Show" : "Hide"}
            </button>
          </div>
        </div>
        {!isConsoleCollapsed && (
          <div
            className="pm-console-body"
            ref={consoleBodyRef}
            role="log"
            aria-live="polite"
            aria-label="Package manager console output"
          >
            {consoleLogs.length === 0 ? (
              <div className="pm-console-empty">
                Console output will appear here when you install, update, or
                uninstall a package.
              </div>
            ) : (
              consoleLogs.map((line, i) => (
                <div
                  key={`${i}-${line.length}`}
                  className="pm-console-line"
                >
                  {line}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PackageManager;
