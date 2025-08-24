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

  useEffect(() => {
    initialize();
  }, []);
  
  useEffect(() => {
    // Check for nodeSearch query parameter after component mounts
    const urlParams = new URLSearchParams(window.location.search);
    const nodeSearchParam = urlParams.get('nodeSearch');
    if (nodeSearchParam) {
      handleNodeSearch(nodeSearchParam);
    }
  }, []);

  useEffect(() => {
    filterPackages();
  }, [searchTerm, availablePackages]);

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

  const filterPackages = () => {
    const term = searchTerm.toLowerCase();
    const filtered = availablePackages.filter(
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

      // Refresh installed packages
      const installedData = await fetchInstalledPackages();
      setInstalledPackages(installedData.packages || []);
      if (!isInstalled) {
        alert(
          "Package installed successfully. The server will restart to apply changes."
        );
        await window.api.restartServer();
      }
    } catch (error: any) {
      console.error("Package action failed:", error);
      alert(
        `Failed to ${isInstalled ? "uninstall" : "install"} package: ${
          error.message
        }`
      );
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
    <>
      <h1>Package Manager</h1>
      <div className="container">
        <div className="search-container">
          <div style={{ position: "relative" }}>
            <input
              type="text"
              className="search-input"
              placeholder="Search packages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={isProcessing}
            />
          </div>
          <div style={{ position: "relative", marginTop: 8 }}>
            <input
              type="text"
              className="search-input"
              placeholder="Search nodes (title, description, type)..."
              value={nodeQuery}
              onChange={(e) => handleNodeSearch(e.target.value)}
              disabled={isProcessing}
            />
          </div>
        </div>

        {nodeQuery && (
          <div className="package-list" style={{ marginTop: 8 }}>
            <div className="node-results-card">
              <div className="node-results-header">
                Node results{" "}
                {nodeSearching ? "(searching...)" : `(${nodeResults.length})`}
              </div>
              {nodeResults.length === 0 && !nodeSearching ? (
                <div className="empty-state">
                  <div>No nodes found</div>
                </div>
              ) : (
                nodeResults.slice(0, 20).map((n, idx) => (
                  <div
                    key={`${n.node_type}-${idx}`}
                    className="node-result-row"
                    style={{ borderTop: idx === 0 ? "none" : undefined }}
                  >
                    <div className="node-result-meta">
                      <div className="node-title">{n.title || n.node_type}</div>
                      <div className="node-desc">{n.description}</div>
                      <div className="node-pkg">
                        Package:{" "}
                        <span style={{ fontFamily: "monospace" }}>
                          {n.package}
                        </span>
                      </div>
                    </div>
                    <div style={{ marginLeft: 16 }}>
                      {!isPackageInstalled(n.package) ? (
                        <button
                          className="btn btn-primary"
                          onClick={() => handlePackageAction(n.package, false)}
                          disabled={isProcessing}
                        >
                          Install {n.package}
                        </button>
                      ) : (
                        <span
                          className="installed-badge"
                          title="Package already installed"
                        >
                          ✓ Installed
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="package-list">
          {filteredPackages.length === 0 ? (
            <div className="empty-state">
              <div>No packages found</div>
            </div>
          ) : (
            filteredPackages.map((pkg) => {
              const installed = isPackageInstalled(pkg.repo_id);
              const isActive = activePackageId === pkg.repo_id;

              return (
                <div
                  key={pkg.repo_id}
                  className={`package-item ${isActive ? "processing" : ""}`}
                  title={pkg.description}
                >
                  <div className="package-info">
                    <div className="package-name">
                      {pkg.name}
                      {installed && (
                        <span className="installed-badge" title="Installed">
                          ✓
                        </span>
                      )}
                    </div>
                    <div className="package-repo">
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
                  <div className="package-action">
                    <button
                      className={`btn ${
                        installed ? "btn-secondary" : "btn-primary"
                      }`}
                      onClick={() =>
                        handlePackageAction(pkg.repo_id, installed)
                      }
                      disabled={isProcessing}
                    >
                      {isActive && (
                        <span className="spinner spinner-small"></span>
                      )}
                      {isActive
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
            <div className="spinner"></div>
            <div className="overlay-text">{overlayText}</div>
          </div>
        )}
      </div>
    </>
  );
};

export default PackageManager;
