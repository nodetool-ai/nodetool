import React, { useState, useEffect, useRef } from "react";
import "./logs.css";

const LogViewer: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [logLevel, setLogLevel] = useState<"all" | "info" | "warn" | "error">(
    "all"
  );
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial load
    loadLogs();

    // Listen for new log messages
    if (window.api?.onServerLog) {
      window.api.onServerLog((message: string) => {
        setLogs((prev) => [...prev, message]);
      });
    }

    // Poll for logs every 2 seconds as a fallback
    const interval = setInterval(loadLogs, 2000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    filterLogs();
  }, [logs, searchTerm, logLevel]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [filteredLogs, autoScroll]);

  const loadLogs = async () => {
    try {
      const fetchedLogs = await window.api.getLogs();
      setLogs(fetchedLogs);
    } catch (error) {
      console.error("Failed to load logs:", error);
    }
  };

  const filterLogs = () => {
    let filtered = logs;

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((log) => log.toLowerCase().includes(term));
    }

    // Filter by log level
    if (logLevel !== "all") {
      filtered = filtered.filter((log) => {
        const logLower = log.toLowerCase();
        if (logLevel === "error") {
          return logLower.includes("error") || logLower.includes("exception");
        } else if (logLevel === "warn") {
          return logLower.includes("warn") || logLower.includes("warning");
        } else if (logLevel === "info") {
          return (
            logLower.includes("info") &&
            !logLower.includes("error") &&
            !logLower.includes("warn")
          );
        }
        return true;
      });
    }

    setFilteredLogs(filtered);
  };

  const handleClearLogs = async () => {
    try {
      await window.api.clearLogs();
      setLogs([]);
      setFilteredLogs([]);
    } catch (error) {
      console.error("Failed to clear logs:", error);
    }
  };

  const handleCopyLogs = () => {
    const logText = filteredLogs.join("\n");
    window.api.clipboardWriteText(logText);
  };

  const getLogClassName = (log: string): string => {
    const logLower = log.toLowerCase();
    if (logLower.includes("error") || logLower.includes("exception")) {
      return "log-error";
    } else if (logLower.includes("warn") || logLower.includes("warning")) {
      return "log-warn";
    }
    return "log-info";
  };

  const handleScroll = () => {
    if (!logsContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } =
      logsContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  return (
    <>
      <h1>Server Logs</h1>
      <div className="container">
        <div className="controls-container">
          <div className="search-container">
            <input
              type="text"
              className="search-input"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="filter-container">
            <label>Level:</label>
            <select
              className="filter-select"
              value={logLevel}
              onChange={(e) =>
                setLogLevel(e.target.value as "all" | "info" | "warn" | "error")
              }
            >
              <option value="all">All</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>

          <div className="button-group">
            <label className="auto-scroll-toggle">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              Auto-scroll
            </label>
            <button className="btn btn-secondary" onClick={handleCopyLogs}>
              Copy Logs
            </button>
            <button className="btn btn-danger" onClick={handleClearLogs}>
              Clear Logs
            </button>
          </div>
        </div>

        <div
          className="logs-container"
          ref={logsContainerRef}
          onScroll={handleScroll}
        >
          {filteredLogs.length === 0 ? (
            <div className="empty-state">
              <div>No logs to display</div>
            </div>
          ) : (
            filteredLogs.map((log, index) => (
              <div key={index} className={`log-entry ${getLogClassName(log)}`}>
                <span className="log-index">{index + 1}</span>
                <span className="log-text">{log}</span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>

        <div className="status-bar">
          <span>
            Showing {filteredLogs.length} of {logs.length} logs
          </span>
          <span>{autoScroll ? "Auto-scroll: ON" : "Auto-scroll: OFF"}</span>
        </div>
      </div>
    </>
  );
};

export default LogViewer;
