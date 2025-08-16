import React, { useState, useEffect } from "react";

interface BasicSystemInfo {
  os: {
    platform: string;
    release: string;
    arch: string;
  };
  versions: {
    python?: string;
    nodetool_core?: string;
    nodetool_base?: string;
  };
  paths: {
    data_dir: string;
    core_logs_dir: string;
    electron_logs_dir: string;
  };
  server: {
    status: "connected" | "disconnected" | "checking";
    port?: number;
  };
}

interface SystemDiagnosticsProps {
  isVisible: boolean;
  onToggle: () => void;
}

const SystemDiagnostics: React.FC<SystemDiagnosticsProps> = ({
  isVisible,
  onToggle,
}) => {
  const [systemInfo, setSystemInfo] = useState<BasicSystemInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isVisible && !systemInfo) {
      loadSystemInfo();
    }
  }, [isVisible, systemInfo]);

  const loadSystemInfo = async () => {
    setLoading(true);
    setError(null);

    try {
      // Try to get system info from backend
      const info = await fetchBasicSystemInfo();
      setSystemInfo(info);
    } catch (err) {
      console.error("Failed to load system info:", err);
      setError("Unable to load system information");

      // Fallback to basic local info
      setSystemInfo({
        os: {
          platform: window.api.platform,
          release: "Unknown",
          arch: "Unknown",
        },
        versions: {},
        paths: {
          data_dir: "Unknown",
          core_logs_dir: "Unknown",
          electron_logs_dir: "Unknown",
        },
        server: {
          status: "disconnected",
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBasicSystemInfo = async (): Promise<BasicSystemInfo> => {
    // Use the real API integration
    const systemInfo = await window.api.getSystemInfo();
    if (!systemInfo) {
      throw new Error("Failed to fetch system information");
    }
    return systemInfo;
  };

  const copySystemInfo = async () => {
    if (!systemInfo) return;

    const info = [
      `OS: ${systemInfo.os.platform} ${systemInfo.os.release} (${systemInfo.os.arch})`,
      `Python: ${systemInfo.versions.python || "Unknown"}`,
      `NodeTool Core: ${systemInfo.versions.nodetool_core || "Unknown"}`,
      `NodeTool Base: ${systemInfo.versions.nodetool_base || "Unknown"}`,
      `Server Status: ${systemInfo.server.status}${
        systemInfo.server.port ? ` (port ${systemInfo.server.port})` : ""
      }`,
      `Data Directory: ${systemInfo.paths.data_dir}`,
      `Core Logs: ${systemInfo.paths.core_logs_dir}`,
      `Electron Logs: ${systemInfo.paths.electron_logs_dir}`,
    ].join("\n");

    try {
      await window.api.clipboardWriteText(info);
      // Could add a brief success indicator here
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="system-diagnostics">
      <div className="system-diagnostics-header">
        <h4>System Information</h4>
        <button className="system-diagnostics-close" onClick={onToggle}>
          ×
        </button>
      </div>

      <div className="system-diagnostics-content">
        {loading && (
          <div className="system-diagnostics-loading">
            Loading system information...
          </div>
        )}

        {error && <div className="system-diagnostics-error">{error}</div>}

        {systemInfo && !loading && (
          <>
            <div className="system-info-section">
              <h5>Operating System</h5>
              <div className="system-info-item">
                <span className="label">Platform:</span>
                <span className="value">{systemInfo.os.platform}</span>
              </div>
              <div className="system-info-item">
                <span className="label">Release:</span>
                <span className="value">{systemInfo.os.release}</span>
              </div>
              <div className="system-info-item">
                <span className="label">Architecture:</span>
                <span className="value">{systemInfo.os.arch}</span>
              </div>
            </div>

            <div className="system-info-section">
              <h5>Versions</h5>
              <div className="system-info-item">
                <span className="label">Python:</span>
                <span className="value">
                  {systemInfo.versions.python || "Unknown"}
                </span>
              </div>
              <div className="system-info-item">
                <span className="label">NodeTool Core:</span>
                <span className="value">
                  {systemInfo.versions.nodetool_core || "Unknown"}
                </span>
              </div>
              <div className="system-info-item">
                <span className="label">NodeTool Base:</span>
                <span className="value">
                  {systemInfo.versions.nodetool_base || "Unknown"}
                </span>
              </div>
            </div>

            <div className="system-info-section">
              <h5>Server Status</h5>
              <div className="system-info-item">
                <span className="label">Connection:</span>
                <span className={`value status-${systemInfo.server.status}`}>
                  {systemInfo.server.status}
                  {systemInfo.server.port &&
                    ` (port ${systemInfo.server.port})`}
                </span>
              </div>
            </div>

            <div className="system-info-section">
              <h5>Key Paths</h5>
              <div className="system-info-item">
                <span className="label">Data Directory:</span>
                <span className="value path">{systemInfo.paths.data_dir}</span>
              </div>
              <div className="system-info-item">
                <span className="label">Core Logs:</span>
                <span className="value path">
                  {systemInfo.paths.core_logs_dir}
                </span>
              </div>
              <div className="system-info-item">
                <span className="label">Electron Logs:</span>
                <span className="value path">
                  {systemInfo.paths.electron_logs_dir}
                </span>
              </div>
            </div>

            <div className="system-diagnostics-actions">
              <button className="copy-button" onClick={copySystemInfo}>
                Copy System Info
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SystemDiagnostics;
