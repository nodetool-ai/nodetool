import React, { useState, useEffect } from "react";
import "./packages.css";
import {
  PackageModel,
  PackageListResponse,
  InstalledPackageListResponse,
  PackageResponse,
  PackageInfo,
} from "../src/types";

const PackageManager: React.FC = () => {
  const [availablePackages, setAvailablePackages] = useState<PackageInfo[]>([]);
  const [installedPackages, setInstalledPackages] = useState<PackageModel[]>(
    []
  );
  const [filteredPackages, setFilteredPackages] = useState<PackageInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activePackageId, setActivePackageId] = useState<string | null>(null);
  const [overlayText, setOverlayText] = useState("");
  const [showOverlay, setShowOverlay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodeQuery, setNodeQuery] = useState("");
  const [nodeResults, setNodeResults] = useState<any[]>([]);
  const [nodeSearching, setNodeSearching] = useState(false);

  const [activeTab, setActiveTab] = useState<"all" | "installed" | "available" | "updates">("all");

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
    if (isProcessing) return;

    setIsProcessing(true);
    setActivePackageId(repoId);

    const pkg = availablePackages.find((p) => p.repo_id === repoId);
    const action = isInstalled ? "Uninstalling" : "Installing";

    setOverlayText(`${action} ${pkg?.name || "package"}...`);
    setShowOverlay(true);

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
          window.api?.restartServer?.();
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
      setShowOverlay(false);
    }
  };

  const handleUpdatePackage = async (repoId: string) => {
    if (isProcessing) return;

    setIsProcessing(true);
    setActivePackageId(repoId);

    const pkg = availablePackages.find((p) => p.repo_id === repoId);

    setOverlayText(`Updating ${pkg?.name || "package"}...`);
    setShowOverlay(true);

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
        window.api?.restartServer?.();
      } catch (e) {
        console.warn("Restart server failed:", e);
      }
    } catch (error: any) {
      console.error("Package update failed:", error);
      alert(`Failed to update package: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setActivePackageId(null);
      setShowOverlay(false);
    }
  };

  const openExternal = (url: string) => {
    if (window.electronAPI && window.electronAPI.openExternal) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, "_blank");
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
        </div>
      </div>

      <div className="container">
        <div className="search-section">
          <div className="search-input-wrapper">
            <input
              type="text"
              className="search-input main-search"
              placeholder="Search packages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={isProcessing}
            />
          </div>
          <div className="search-input-wrapper">
            <input
              type="text"
              className="search-input node-search"
              placeholder="Search specific nodes..."
              value={nodeQuery}
              onChange={(e) => handleNodeSearch(e.target.value)}
              disabled={isProcessing}
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
                      {!isPackageInstalled(n.package) ? (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handlePackageAction(n.package, false)}
                          disabled={isProcessing}
                        >
                          Install
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
                        disabled={isProcessing}
                      >
                        {isActive ? "Updating..." : "Update v" + installedPkg?.latestVersion}
                      </button>
                    )}
                    <button
                      className={`btn full-width ${installed ? "btn-outline-danger" : "btn-primary"
                        }`}
                      onClick={() =>
                        handlePackageAction(pkg.repo_id, installed)
                      }
                      disabled={isProcessing}
                    >
                      {isActive && !updateAvailable
                        ? installed
                          ? "Uninstalling..."
                          : "Installing..."
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

        {showOverlay && (
          <div className="overlay">
            <div className="spinner-large"></div>
            <div className="overlay-text">{overlayText}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PackageManager;
