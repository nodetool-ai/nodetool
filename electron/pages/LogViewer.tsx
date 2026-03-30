import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import "./logs.css";

const LogViewer: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [logLevel, setLogLevel] = useState<"all" | "info" | "warn" | "error">("all");
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [allCopied, setAllCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const dragStartMousePos = useRef<{ x: number; y: number } | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const prevLogsLengthRef = useRef<number>(0);

  const loadLogs = useCallback(async () => {
    try {
      const fetchedLogs = await window.api.getLogs();
      setLogs(fetchedLogs);
    } catch (error) {
      console.error("Failed to load logs:", error);
    }
  }, []);

  useEffect(() => {
    loadLogs();

    if (window.api?.onServerLog) {
      const handleLog = (message: string) => {
        setLogs((prev) => [...prev, message]);
      };
      const unsubscribe = window.api.onServerLog(handleLog);
      return () => {
        unsubscribe?.();
      };
    }
  }, [loadLogs]);

  useEffect(() => {
    const interval = setInterval(loadLogs, 2000);
    return () => clearInterval(interval);
  }, [loadLogs]);

  const filteredLogs = useMemo(() => {
    let filtered = logs;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((log) => log.toLowerCase().includes(term));
    }

    if (logLevel !== "all") {
      filtered = filtered.filter((log) => {
        const logLower = log.toLowerCase();
        if (logLevel === "error") {
          return logLower.includes("error") || logLower.includes("exception");
        } else if (logLevel === "warn") {
          return logLower.includes("warn") || logLower.includes("warning");
        } else if (logLevel === "info") {
          return logLower.includes("info") && !logLower.includes("error") && !logLower.includes("warn");
        }
        return true;
      });
    }

    return filtered;
  }, [logs, searchTerm, logLevel]);

  const logClassNames = useMemo(() => {
    return filteredLogs.map((log) => {
      const logLower = log.toLowerCase();
      if (logLower.includes("error") || logLower.includes("exception")) return "log-error";
      if (logLower.includes("warn") || logLower.includes("warning")) return "log-warn";
      return "log-info";
    });
  }, [filteredLogs]);

  const filteredLogsLength = filteredLogs.length;
  useEffect(() => {
    if (autoScroll && logsEndRef.current && filteredLogsLength > prevLogsLengthRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "auto" });
    }
    prevLogsLengthRef.current = filteredLogsLength;
  }, [filteredLogs, autoScroll, filteredLogsLength]);

  useEffect(() => {
    if (selectedIndices.size > 0) {
      const selectedLogsText = Array.from(selectedIndices)
        .sort((a, b) => a - b)
        .map((i) => filteredLogs[i])
        .join("\n");
      window.api.clipboard.writeText(selectedLogsText);
      setCopied(true);
      const timer = setTimeout(() => setCopied(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [selectedIndices, filteredLogs]);

  const handleClearLogs = useCallback(async () => {
    try {
      await window.api.clearLogs();
      setLogs([]);
      setSelectedIndices(new Set());
    } catch (error) {
      console.error("Failed to clear logs:", error);
    }
  }, []);

  const handleCopyLogs = useCallback(() => {
    const logText = filteredLogs.join("\n");
    window.api.clipboard.writeText(logText);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  }, [filteredLogs]);

  const handleLogClick = useCallback((index: number, event: React.MouseEvent) => {
    if (isDragging) return;

    setSelectedIndices((prev) => {
      const newSelection = new Set(prev);

      if (event.shiftKey && lastClickedIndex !== null) {
        const start = Math.min(lastClickedIndex, index);
        const end = Math.max(lastClickedIndex, index);
        for (let i = start; i <= end; i++) {
          newSelection.add(i);
        }
      } else if (event.metaKey || event.ctrlKey) {
        if (newSelection.has(index)) {
          newSelection.delete(index);
        } else {
          newSelection.add(index);
        }
      } else {
        newSelection.clear();
        newSelection.add(index);
      }

      return newSelection;
    });
    setLastClickedIndex(index);
  }, [lastClickedIndex, isDragging]);

  const clearSelection = useCallback(() => {
    setSelectedIndices(new Set());
    setLastClickedIndex(null);
  }, []);

  const handleScroll = useCallback(() => {
    if (!logsContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  }, []);

  const handleLogMouseDown = useCallback((event: React.MouseEvent, index: number) => {
    dragStartMousePos.current = { x: event.clientX, y: event.clientY };
    setIsDragging(true);
    setDragStartIndex(index);
    setLastClickedIndex(index);

    if (event.metaKey || event.ctrlKey) {
      setSelectedIndices((prev) => {
        const newSelection = new Set(prev);
        if (newSelection.has(index)) {
          newSelection.delete(index);
        } else {
          newSelection.add(index);
        }
        return newSelection;
      });
    } else {
      setSelectedIndices(new Set([index]));
    }
  }, []);

  const handleLogMouseEnter = useCallback((index: number) => {
    if (isDragging && dragStartIndex !== null) {
      const start = Math.min(dragStartIndex, index);
      const end = Math.max(dragStartIndex, index);
      const newSelection = new Set<number>();
      for (let i = start; i <= end; i++) {
        newSelection.add(i);
      }
      setSelectedIndices(newSelection);
    }
  }, [isDragging, dragStartIndex]);

  const handleMouseUp = useCallback((event: MouseEvent) => {
    if (dragStartMousePos.current) {
      const dx = Math.abs(event.clientX - dragStartMousePos.current.x);
      const dy = Math.abs(event.clientY - dragStartMousePos.current.y);
      const hasMoved = dx > 3 || dy > 3;
      setIsDragging(hasMoved);
    }
    setDragStartIndex(null);
    dragStartMousePos.current = null;
  }, []);

  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  const statusBarText = useMemo(() => {
    let text = `Showing ${filteredLogs.length} of ${logs.length} logs`;
    if (selectedIndices.size > 0) text += ` • ${selectedIndices.size} selected`;
    if (copied) text += " • Copied to clipboard!";
    return text;
  }, [filteredLogs.length, logs.length, selectedIndices.size, copied]);

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
              onChange={(e) => setLogLevel(e.target.value as "all" | "info" | "warn" | "error")}
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
            {selectedIndices.size > 0 && (
              <button className="btn btn-outline" onClick={clearSelection}>
                Clear Selection ({selectedIndices.size})
              </button>
            )}
            <button className={`btn btn-secondary ${allCopied ? 'copied' : ''}`} onClick={handleCopyLogs}>
              {allCopied ? '✓ Copied!' : 'Copy All'}
            </button>
            <button className="btn btn-danger" onClick={handleClearLogs}>
              Clear
            </button>
          </div>
        </div>

        <div className="logs-container" ref={logsContainerRef} onScroll={handleScroll}>
          {filteredLogs.length === 0 ? (
            <div className="empty-state">
              <div>No logs to display</div>
            </div>
          ) : (
            filteredLogs.map((log, index) => (
              <div
                key={index}
                className={`log-entry ${logClassNames[index]} ${selectedIndices.has(index) ? 'selected' : ''}`}
                onMouseDown={(e) => handleLogMouseDown(e, index)}
                onMouseEnter={() => handleLogMouseEnter(index)}
                onClick={(e) => handleLogClick(index, e)}
                title="Click to select • Shift+Click for range • Cmd/Ctrl+Click to toggle • Drag to select range"
              >
                <span className="log-index">{index + 1}</span>
                <span className="log-text">{log}</span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>

        <div className="status-bar">
          <span>{statusBarText}</span>
          <span>{autoScroll ? "Auto-scroll: ON" : "Auto-scroll: OFF"}</span>
        </div>
      </div>
    </>
  );
};

export default LogViewer;
