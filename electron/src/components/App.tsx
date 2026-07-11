import React, { useEffect, useState, useCallback } from "react";
import BootMessage from "./BootMessage";
import LogContainer from "./LogContainer";
import UpdateNotification from "./UpdateNotification";
import "./index.css";
import PackageUpdatesNotification from "./PackageUpdatesNotification";
import type {
  PackageUpdateInfo,
  ServerState,
  UpdateInfo,
  UpdateProgressData,
} from "../types";

const App: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [bootMessage, setBootMessage] = useState<string>("");
  const [showBootMessage, setShowBootMessage] = useState(true);
  const [showUpdateSteps, setShowUpdateSteps] = useState(false);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [showPackageUpdates, setShowPackageUpdates] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [progressData, setProgressData] = useState<UpdateProgressData>({
    componentName: "",
    progress: 0,
    action: "",
    eta: "",
  });
  const [serverStatus, setServerStatus] =
    useState<ServerState["status"]>("idle");
  const [serverError, setServerError] = useState<string | null>(null);

  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [packageUpdates, setPackageUpdates] = useState<
    PackageUpdateInfo[] | null
  >(null);

  const addLog = useCallback((message: string) => {
    setLogs((prev: string[]) => [...prev, message]);
  }, []);

  const loadContentWithNoCaching = useCallback((initialURL: string) => {
    const timestamp = new Date().getTime();
    window.location.href = `${initialURL}/?nocache=${timestamp}`;
  }, []);

  const initializeApp = useCallback(async () => {
    try {
      const {
        isStarted,
        bootMsg,
        status,
        error,
        logs: serverLogs,
        initialURL,
      } = await window.api.server.getState();

      setServerStatus(status ?? "idle");
      setServerError(error ?? null);

      if (status === "error") {
        setShowBootMessage(true);
        setBootMessage(error ?? bootMsg);
        setShowLogs(true);
        setLogs(serverLogs);
        return;
      }

      if (isStarted || status === "started") {
        loadContentWithNoCaching(initialURL);
      } else {
        setShowBootMessage(true);
        setBootMessage(bootMsg);
      }

      setLogs(serverLogs);
    } catch (error) {
      console.error("Failed to initialize app:", error);
    }
  }, [loadContentWithNoCaching]);

  const handleUpdateProgress = useCallback(
    (data: UpdateProgressData) => {
      setProgressData(data);
      if (data.progress < 100) {
        setShowUpdateSteps(true);
      } else {
        setTimeout(() => setShowUpdateSteps(false), 5000);
      }
    },
    [setProgressData, setShowUpdateSteps]
  );

  const handleServerStarted = useCallback(() => {
    setServerStatus("started");
    setServerError(null);
    initializeApp();
  }, [initializeApp]);

  const handleBootMessage = useCallback(
    (message: string) => {
      setServerStatus((prev) => (prev === "error" ? prev : "starting"));
      setBootMessage(message);
      if (message.includes("Setting up Python")) {
        setShowLogs(true);
      }
    },
    [setBootMessage, setShowLogs]
  );

  const handleServerLog = useCallback(
    (message: string) => {
      addLog(message);
    },
    [addLog]
  );

  const handleServerError = useCallback((data: { message: string }) => {
    setServerStatus("error");
    setServerError(data.message);
    setShowBootMessage(true);
    setBootMessage(data.message);
    setShowUpdateSteps(false);
    setShowLogs(true);
  }, []);

  const handleUpdateAvailable = useCallback(
    (info: UpdateInfo) => {
      setUpdateInfo(info);
      setShowUpdateNotification(true);
    },
    [setUpdateInfo, setShowUpdateNotification]
  );

  const handlePackageUpdatesAvailable = useCallback(
    (updates: PackageUpdateInfo[]) => {
      if (!updates?.length) {
        return;
      }
      setPackageUpdates(updates);
      setShowPackageUpdates(true);
    },
    []
  );

  const handleMenuEvent = useCallback(
    (data: { type?: string }) => {
      // Basic reaction to menu clicks so users see immediate feedback
      // Extend this switch to wire up actual actions as needed
      switch (data?.type) {
        case "fitView":
        case "resetZoom":
        case "zoomIn":
        case "zoomOut":
        case "saveWorkflow":
        case "newTab":
        case "close":
        case "undo":
        case "redo":
        case "cut":
        case "copy":
        case "paste":
        case "duplicate":
        case "duplicateVertical":
        case "group":
        case "selectAll":
        case "align":
        case "alignWithSpacing":
          addLog(`Menu action: ${data.type}`);
          break;
        default:
          addLog(`Menu action: ${JSON.stringify(data)}`);
          break;
      }
    },
    [addLog]
  );


  useEffect(() => {
    document.body.classList.add(`platform-${window.api.platform}`);

    const unsubs: (() => void)[] = [];

    unsubs.push(window.api.installer.onProgress(handleUpdateProgress));
    unsubs.push(window.api.server.onStarted(handleServerStarted));
    unsubs.push(window.api.server.onBootMessage(handleBootMessage));
    unsubs.push(window.api.server.onLog(handleServerLog));
    unsubs.push(window.api.server.onError(handleServerError));
    unsubs.push(window.api.updates.onAvailable(handleUpdateAvailable));
    unsubs.push(window.api.packages.onUpdatesAvailable(handlePackageUpdatesAvailable));
    unsubs.push(window.api.menu.onEvent(handleMenuEvent));

    initializeApp();

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [
    initializeApp,
    handleUpdateProgress,
    handleServerStarted,
    handleBootMessage,
    handleServerLog,
    handleServerError,
    handleUpdateAvailable,
    handlePackageUpdatesAvailable,
    handleMenuEvent,
  ]);

  const handleRetryStart = useCallback(() => {
    setServerError(null);
    setServerStatus("starting");
    setBootMessage("Retrying backend start...");
    setShowBootMessage(true);
    setShowLogs(true);
    void window.api.server.restart().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to restart backend server.";
      setServerStatus("error");
      setServerError(message);
      setBootMessage(message);
    });
  }, []);

  const handleOpenLogs = useCallback(() => {
    setShowLogs(true);
    window.api.system.openLogFile();
  }, []);

  return (
    <div className="app">
      {showBootMessage && (
        <BootMessage
          message={bootMessage}
          showUpdateSteps={showUpdateSteps}
          progressData={progressData}
          status={serverStatus}
          errorMessage={serverError ?? undefined}
          onRetry={handleRetryStart}
          onOpenLogs={handleOpenLogs}
        />
      )}

      <LogContainer
        logs={logs}
        isExpanded={showLogs}
        onToggle={() => setShowLogs(!showLogs)}
      />

      {showUpdateNotification && updateInfo && (
        <UpdateNotification
          version={updateInfo.version}
          releaseUrl={updateInfo.releaseUrl}
          downloaded={updateInfo.downloaded}
          onClose={() => setShowUpdateNotification(false)}
        />
      )}
      {showPackageUpdates && packageUpdates && (
        <PackageUpdatesNotification
          updates={packageUpdates}
          onDismiss={() => setShowPackageUpdates(false)}
        />
      )}
    </div>
  );
};

export default App;
