import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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

/* ============================================================
   Icon Generation
   ============================================================ */

const PACKAGE_EMOJIS: Record<string, string> = {
  core: "🧊",
  apple: "🍎",
  mlx: "🚀",
  huggingface: "🤗",
  ml: "🔬",
  whispercpp: "🎙️",
  ffmpeg: "🎬",
  pandoc: "📄",
  yt_dlp: "📥",
  python: "🐍",
  nodejs: "🟢",
  bash: "🐚",
  ruby: "💎",
  lua: "🌙",
  pdftotext: "📑",
  claude_agent_sdk: "🧠",
  codex_sdk: "💻",
  transformers_js: "🤖",
  tensorflow_js: "📊",
};

const PALETTES = [
  { bg: "#5b8dd9", gradient: "linear-gradient(135deg, #5b8dd9, #7a5ed1)" },
  { bg: "#4ec988", gradient: "linear-gradient(135deg, #4ec988, #3aa8a8)" },
  { bg: "#d9a34b", gradient: "linear-gradient(135deg, #d9a34b, #d4734e)" },
  { bg: "#e05252", gradient: "linear-gradient(135deg, #e05252, #c44d8c)" },
  { bg: "#6b8dd6", gradient: "linear-gradient(135deg, #6b8dd6, #5e60ce)" },
  { bg: "#4ec9b0", gradient: "linear-gradient(135deg, #4ec9b0, #4e8bc9)" },
  { bg: "#c9a84e", gradient: "linear-gradient(135deg, #c9a84e, #c96b4e)" },
  { bg: "#9b59b6", gradient: "linear-gradient(135deg, #9b59b6, #6b5ed1)" },
  { bg: "#3498db", gradient: "linear-gradient(135deg, #3498db, #2ecc71)" },
  { bg: "#e74c3c", gradient: "linear-gradient(135deg, #e74c3c, #e67e22)" },
  { bg: "#1abc9c", gradient: "linear-gradient(135deg, #1abc9c, #3498db)" },
  { bg: "#f39c12", gradient: "linear-gradient(135deg, #f39c12, #e74c3c)" },
];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function getPackageIcon(pkg: PackageInfo | PackageModel | RuntimeStatus): { emoji: string; gradient: string } {
  const name = pkg.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
  for (const key of Object.keys(PACKAGE_EMOJIS)) {
    if (name.includes(key)) {
      return { emoji: PACKAGE_EMOJIS[key], gradient: PALETTES[hashString(key) % PALETTES.length].gradient };
    }
  }
  const id = "repo_id" in pkg ? pkg.repo_id : pkg.name;
  const h = hashString(id || pkg.name);
  const firstChar = pkg.name.charAt(0).toUpperCase();
  return { emoji: firstChar, gradient: PALETTES[h % PALETTES.length].gradient };
}

/* ============================================================
   Tab Icons (SVG)
   ============================================================ */

function IconGrid({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function IconDownload({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconRefresh({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconSliders({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/* ============================================================
   Component
   ============================================================ */

const PackageManager: React.FC = () => {
  const [availablePackages, setAvailablePackages] = useState<PackageInfo[]>([]);
  const [installedPackages, setInstalledPackages] = useState<PackageModel[]>([]);
  const [filteredPackages, setFilteredPackages] = useState<PackageInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activePackageId, setActivePackageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodeQuery, setNodeQuery] = useState("");
  const [nodeResults, setNodeResults] = useState<any[]>([]);
  const [nodeSearching, setNodeSearching] = useState(false);

  const [runtimes, setRuntimes] = useState<RuntimeStatus[]>([]);
  const [runtimesLoading, setRuntimesLoading] = useState(true);
  const [installingRuntimes, setInstallingRuntimes] = useState<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<"all" | "installed" | "available" | "updates">("all");
  const [showNodeSearch, setShowNodeSearch] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const MAX_CONSOLE_LINES = 500;
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [isConsoleCollapsed, setIsConsoleCollapsed] = useState(true);
  const consoleBodyRef = useRef<HTMLDivElement | null>(null);

  const isAnyProcessing = isProcessing || installingRuntimes.size > 0;

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

  const handleClearConsole = useCallback(() => { setConsoleLogs([]); }, []);
  const handleToggleConsole = useCallback(() => { setIsConsoleCollapsed((prev) => !prev); }, []);

  const handleInstallRuntime = useCallback(async (runtimeId: RuntimePackageId) => {
    if (isProcessing) return;
    const api = window.electronAPI;
    if (!api?.packages?.installRuntime) return;
    setInstallingRuntimes(prev => new Set(prev).add(runtimeId));
    setError(null);
    setIsConsoleCollapsed(false);
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
      setInstallingRuntimes(prev => { const next = new Set(prev); next.delete(runtimeId); return next; });
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
      setInstallingRuntimes(prev => { const next = new Set(prev); next.delete(runtimeId); return next; });
    }
  }, [loadRuntimes, isProcessing]);

  useEffect(() => { initialize(); }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const nodeSearchParam = urlParams.get("nodeSearch");
    if (nodeSearchParam) {
      setShowNodeSearch(true);
      handleNodeSearch(nodeSearchParam);
    }
  }, []);

  useEffect(() => { filterPackages(); }, [searchTerm, availablePackages, installedPackages, activeTab]);

  useEffect(() => {
    loadRuntimes();
  }, [loadRuntimes]);

  useEffect(() => {
    const api = window.electronAPI;
    const onLog = api?.server?.onLog ?? api?.onServerLog;
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
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, []);

  useEffect(() => {
    if (isConsoleCollapsed) return;
    const body = consoleBodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [consoleLogs, isConsoleCollapsed]);

  const initialize = async () => {
    try {
      const [availableData, installedData] = await Promise.all([
        fetchAvailablePackages(),
        fetchInstalledPackages(),
      ]);
      setAvailablePackages(availableData.packages || []);
      setInstalledPackages(installedData.packages || []);
      setFilteredPackages(availableData.packages || []);
      setLastUpdated(new Date());
      setLoading(false);
    } catch (error: any) {
      setError(error.message);
      setLoading(false);
    }
  };

  const fetchAvailablePackages = async (): Promise<PackageListResponse> => {
    if (!window.electronAPI?.packages?.listAvailable) {
      throw new Error("Package API is not available");
    }
    return await window.electronAPI.packages.listAvailable();
  };

  const fetchInstalledPackages = async (): Promise<InstalledPackageListResponse> => {
    if (!window.electronAPI?.packages?.listInstalled) {
      throw new Error("Package API is not available");
    }
    return await window.electronAPI.packages.listInstalled();
  };

  const filterPackages = () => {
    const term = searchTerm.toLowerCase().trim();
    let baseList = availablePackages;
    if (activeTab === "installed") {
      baseList = availablePackages.filter(p => isPackageInstalled(p.repo_id));
    } else if (activeTab === "available") {
      baseList = availablePackages.filter(p => !isPackageInstalled(p.repo_id));
    } else if (activeTab === "updates") {
      baseList = availablePackages.filter(p => hasUpdate(p.repo_id));
    }
    if (!term) {
      setFilteredPackages(baseList);
      return;
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

  const handlePackageAction = async (repoId: string, installed: boolean) => {
    if (isAnyProcessing || !repoId) return;
    setIsProcessing(true);
    setActivePackageId(repoId);
    setError(null);
    setIsConsoleCollapsed(false);
    try {
      let result: PackageResponse;
      if (installed) {
        result = await window.electronAPI.packages.uninstall(repoId);
      } else {
        result = await window.electronAPI.packages.install(repoId);
      }
      if (!result.success) {
        throw new Error(result.message);
      }
      if (!installed) {
        alert("Package installed successfully. The server will restart to apply changes.");
        const installedData = await fetchInstalledPackages();
        setInstalledPackages(installedData.packages || []);
        try { window.electronAPI?.restartServer?.(); } catch (e) { /* ignore */ }
      } else {
        const installedData = await fetchInstalledPackages();
        setInstalledPackages(installedData.packages || []);
      }
      setLastUpdated(new Date());
    } catch (error: any) {
      console.error("Package action failed:", error);
      setError(`Failed to ${installed ? "uninstall" : "install"} package: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setActivePackageId(null);
    }
  };

  const handleUpdatePackage = async (repoId: string) => {
    if (isAnyProcessing || !repoId) return;
    setIsProcessing(true);
    setActivePackageId(repoId);
    setError(null);
    setIsConsoleCollapsed(false);
    try {
      const result = await window.electronAPI.packages.update(repoId);
      if (!result.success) {
        throw new Error(result.message);
      }
      alert("Package updated successfully. The server will restart to apply changes.");
      const installedData = await fetchInstalledPackages();
      setInstalledPackages(installedData.packages || []);
      try { window.electronAPI?.restartServer?.(); } catch (e) { /* ignore */ }
      setLastUpdated(new Date());
    } catch (error: any) {
      console.error("Package update failed:", error);
      setError(`Failed to update package: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setActivePackageId(null);
    }
  };

  const openExternal = (url: string) => {
    if (window.electronAPI?.openExternal) {
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
      // ignore
    } finally {
      setNodeSearching(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await initialize();
  }, []);

  const stats = useMemo(() => {
    const total = availablePackages.length + runtimes.length;
    const installed = installedPackages.length + runtimes.filter(r => r.installed).length;
    const available = (availablePackages.length - installedPackages.length) + runtimes.filter(r => !r.installed).length;
    const updates = installedPackages.filter(p => p.hasUpdate).length;
    return { total, installed, available, updates };
  }, [availablePackages, installedPackages, runtimes]);

  if (loading) {
    return (
      <div className="app-wrapper">
        <div className="loading-container">
          <div className="spinner" />
          <div>Loading packages…</div>
        </div>
      </div>
    );
  }

  if (error && !availablePackages.length) {
    return (
      <div className="app-wrapper">
        <div className="loading-container">
          <div className="empty-icon">⚠️</div>
          <h3 style={{ color: "var(--text-secondary)", marginBottom: 8 }}>Error loading packages</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      {/* Header */}
      <div className="header-region">
        <div className="header-brand">
          <div className="header-icon">📦</div>
          <div className="header-text">
            <h1>Package Manager</h1>
            <p>Manage and install NodeTool packages and extensions</p>
          </div>
        </div>
        <div className="tabs">
          <button className={`tab ${activeTab === "all" ? "active" : ""}`} onClick={() => setActiveTab("all")}>
            <IconGrid className="tab-icon" /> All Packages
          </button>
          <button className={`tab ${activeTab === "installed" ? "active" : ""}`} onClick={() => setActiveTab("installed")}>
            <IconCheck className="tab-icon" /> Installed
          </button>
          <button className={`tab ${activeTab === "available" ? "active" : ""}`} onClick={() => setActiveTab("available")}>
            <IconDownload className="tab-icon" /> Available
          </button>
          <button className={`tab ${activeTab === "updates" ? "active" : ""}`} onClick={() => setActiveTab("updates")}>
            <IconRefresh className="tab-icon" /> Updates
          </button>

        </div>
      </div>

      {/* Main Content */}
      <div className="container">
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button className="error-dismiss" onClick={() => setError(null)}><IconX /></button>
          </div>
        )}

        <>
            {/* Toolbar */}
            <div className="toolbar">
              <div className="search-box">
                <IconSearch className="search-icon" />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search packages…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  disabled={isAnyProcessing}
                />
              </div>
              <div className="toolbar-actions">
                <button
                  className={`toolbar-btn ${showNodeSearch ? "active" : ""}`}
                  onClick={() => setShowNodeSearch(s => !s)}
                  disabled={isAnyProcessing}
                >
                  <IconSliders /> {showNodeSearch ? "Hide Node Search" : "Search Nodes"}
                </button>
              </div>
            </div>

            {/* Node Search Panel */}
            {showNodeSearch && (
              <div className="node-search-panel">
                <div className="node-search-header">
                  <h3>Search Specific Nodes</h3>
                  <button className="node-search-close" onClick={() => { setShowNodeSearch(false); setNodeQuery(""); setNodeResults([]); }}>
                    <IconX />
                  </button>
                </div>
                <div style={{ padding: "12px 20px", borderBottom: nodeResults.length || nodeSearching ? "1px solid var(--border-color)" : "none" }}>
                  <div className="search-box">
                    <IconSearch className="search-icon" />
                    <input
                      type="text"
                      className="search-input"
                      placeholder="Type to find nodes across all packages…"
                      value={nodeQuery}
                      onChange={(e) => handleNodeSearch(e.target.value)}
                      disabled={isAnyProcessing}
                    />
                  </div>
                </div>
                <div className="node-search-results">
                  {!nodeQuery ? (
                    <div className="node-search-hint">
                      <div className="node-search-hint-icon">🔍</div>
                      <div className="node-search-hint-text">Start typing to search for nodes across all packages</div>
                    </div>
                  ) : (
                    <>
                      {nodeResults.length === 0 && !nodeSearching ? (
                        <div className="empty-state-small">
                          No nodes found matching "{nodeQuery}"
                        </div>
                      ) : (
                        nodeResults.slice(0, 20).map((n, idx) => (
                          <div key={`${n.node_type}-${idx}`} className="node-result-row" data-package={n.package}>
                            <div className="node-result-meta">
                              <div className="node-title">{n.title || n.node_type}</div>
                              <div className="node-desc">{n.description}</div>
                              <span className="node-pkg-badge">{n.package}</span>
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
                                <span className="status-text installed">✓ Installed</span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Package Grid */}
            <div className="package-grid">
              {/* Runtimes — shown in All tab */}
              {activeTab === "all" && !runtimesLoading && runtimes.map((rt) => {
                const isInstalling = installingRuntimes.has(rt.id) || rt.installing;
                const icon = getPackageIcon(rt as any);
                return (
                  <div key={rt.id} className={`package-card ${rt.installed ? "installed" : ""}`}>
                    <div className="package-card-header">
                      <div className="package-icon" style={{ background: icon.gradient }}>{icon.emoji}</div>
                      <div className="package-header-text">
                        <div className="package-title-row">
                          <span className="package-name">{rt.name}</span>
                          {rt.installed && (
                            <span className="badge badge-installed"><span className="badge-dot" /> Installed</span>
                          )}
                        </div>
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
                          <IconTrash /> {isInstalling ? "Removing…" : "Uninstall"}
                        </button>
                      ) : (
                        <button
                          className="btn btn-primary full-width"
                          onClick={() => handleInstallRuntime(rt.id as RuntimePackageId)}
                          disabled={isInstalling || isAnyProcessing}
                        >
                          <IconDownload /> {isInstalling ? "Installing…" : "Install"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Empty state — only when nothing to show */}
              {filteredPackages.length === 0 && (activeTab !== "all" || runtimes.length === 0) && (
                <div className="empty-state">
                  <div className="empty-icon">📦</div>
                  <h3>No packages found</h3>
                  <p>Try adjusting your search or switching to a different tab.</p>
                </div>
              )}

              {filteredPackages.map((pkg) => {
                  const installed = isPackageInstalled(pkg.repo_id);
                  const updateAvailable = hasUpdate(pkg.repo_id);
                  const installedPkg = getInstalledPackage(pkg.repo_id);
                  const isActive = activePackageId === pkg.repo_id;
                  const icon = getPackageIcon(pkg);

                  return (
                    <div
                      key={pkg.repo_id}
                      className={`package-card ${isActive ? "processing" : ""} ${installed ? "installed" : ""}`}
                    >
                      <div className="package-card-header">
                        <div className="package-icon" style={{ background: icon.gradient }}>
                          {icon.emoji}
                        </div>
                        <div className="package-header-text">
                          <div className="package-title-row">
                            <span className="package-name" title={pkg.name}>{pkg.name}</span>
                            {installed && !updateAvailable && (
                              <span className="badge badge-installed"><span className="badge-dot" /> Installed</span>
                            )}
                            {updateAvailable && (
                              <span className="badge badge-update"><span className="badge-dot" /> Update</span>
                            )}
                          </div>
                          {pkg.repo_id.includes("/") && (
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
                          )}
                        </div>
                      </div>

                      <div className="package-card-body">
                        <p className="package-description" title={pkg.description}>
                          {pkg.description || "No description available."}
                        </p>
                        <div className="package-meta">
                          {installed && installedPkg ? (
                            <>
                              <span className="version-pill">v{installedPkg.version}</span>
                              {updateAvailable && installedPkg.latestVersion && (
                                <span className="version-pill version-latest">
                                  → v{installedPkg.latestVersion}
                                </span>
                              )}
                            </>
                          ) : pkg.version ? (
                            <span className="version-pill">Latest: v{pkg.version}</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="package-card-footer">
                        {updateAvailable && (
                          <button
                            className="btn btn-warning full-width"
                            onClick={() => handleUpdatePackage(pkg.repo_id)}
                            disabled={isAnyProcessing}
                          >
                            {isActive ? <div className="spinner-small" /> : `Update to v${installedPkg?.latestVersion}`}
                          </button>
                        )}
                        <button
                          className={`btn full-width ${installed ? "btn-outline-danger" : "btn-primary"}`}
                          onClick={() => handlePackageAction(pkg.repo_id, installed)}
                          disabled={isAnyProcessing}
                        >
                          {isActive && !updateAvailable ? (
                            <div className="spinner-small" />
                          ) : installed ? (
                            <><IconTrash /> Uninstall</>
                          ) : (
                            <><IconDownload /> Install</>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </>
      </div>

      {/* Footer Bar */}
      <div className="footer-bar">
        <div className="footer-stats">
          <div className="footer-stat">
            <span className="footer-stat-dot total" />
            {stats.total} packages
          </div>
          <div className="footer-stat">
            <span className="footer-stat-dot installed" />
            {stats.installed} installed
          </div>
          <div className="footer-stat">
            <span className="footer-stat-dot available" />
            {stats.available} available
          </div>
          {stats.updates > 0 && (
            <div className="footer-stat">
              <span className="footer-stat-dot updates" />
              {stats.updates} updates
            </div>
          )}
        </div>
        <div className="footer-actions">
          <button className="footer-btn" onClick={handleRefresh} disabled={loading}>
            <IconRefresh /> Refresh
          </button>
          {lastUpdated && (
            <span>Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          )}
        </div>
      </div>

      {/* Console */}
      <div className={`pm-console ${isConsoleCollapsed ? "collapsed" : ""}`}>
        <div className="pm-console-header" onClick={handleToggleConsole}>
          <div className="pm-console-title">
            <span className={`pm-console-indicator ${consoleLogs.length === 0 ? "idle" : ""}`} />
            Console Output
            {consoleLogs.length > 0 && (
              <span className="pm-console-count">({consoleLogs.length})</span>
            )}
          </div>
          <div className="pm-console-actions" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="pm-console-button"
              onClick={handleClearConsole}
              disabled={consoleLogs.length === 0}
            >
              Clear
            </button>
            <button type="button" className="pm-console-button" onClick={handleToggleConsole}>
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
                Console output will appear here when you install, update, or uninstall a package.
              </div>
            ) : (
              consoleLogs.map((line, i) => (
                <div key={`${i}-${line.length}`} className="pm-console-line">
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
