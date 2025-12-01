import React, { useEffect, useState, useCallback } from "react";
import BootMessage from "./BootMessage";
import InstallWizard from "./InstallWizard";
import LogContainer from "./LogContainer";
import UpdateNotification from "./UpdateNotification";
import { useIconAnimation } from "../hooks/useIconAnimation";
import "./index.css";
import PackageManager from "./PackageManager";
import PackageUpdatesNotification from "./PackageUpdatesNotification";
import type {
  InstallLocationData,
  PackageUpdateInfo,
  ServerState,
  UpdateInfo,
  UpdateProgressData,
} from "../types";

const App: React.FC = () => {
  const showPackageManager = window.location.search.includes("package-manager");

  const [logs, setLogs] = useState<string[]>([]);
  const [bootMessage, setBootMessage] = useState<string>("");
  const [showBootMessage, setShowBootMessage] = useState(!showPackageManager);
  const [showInstallWizard, setShowInstallPrompt] = useState(false);
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
  // showPackageManager is declared above to allow conditional initial state

  const [installLocationData, setInstallLocationData] =
    useState<InstallLocationData | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [packageUpdates, setPackageUpdates] = useState<
    PackageUpdateInfo[] | null
  >(null);

  const { startAnimations, clearAllAnimations } = useIconAnimation();

  const addLog = useCallback((message: string) => {
    setLogs((prev: string[]) => [...prev, message]);
  }, []);

  const loadContentWithNoCaching = useCallback((initialURL: string) => {
    const timestamp = new Date().getTime();
    window.location.href = `${initialURL}?nocache=${timestamp}`;
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
      } = await window.api.getServerState();

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

  // Set up event listeners
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
    if (!showPackageManager) {
      initializeApp();
    }
  }, [initializeApp, showPackageManager]);

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

  const handleInstallLocationPrompt = useCallback(
    (data: InstallLocationData) => {
      setInstallLocationData({
        ...data,
        packages: data.packages ?? [],
      });
      setShowBootMessage(false);
      setShowInstallPrompt(true);
    },
    [setInstallLocationData, setShowBootMessage, setShowInstallPrompt]
  );

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
    (data: any) => {
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
    if (showBootMessage) {
      startAnimations();
      return () => {
        clearAllAnimations();
      };
    }

    clearAllAnimations();
    return undefined;
  }, [showBootMessage, startAnimations, clearAllAnimations]);

  useEffect(() => {
    // Initialize platform class
    document.body.classList.add(`platform-${window.api.platform}`);
    // Register event listeners FIRST
    window.api.onUpdateProgress(handleUpdateProgress);
    window.api.onServerStarted(handleServerStarted);
    window.api.onBootMessage(handleBootMessage);
    window.api.onServerLog(handleServerLog);
    window.api.onServerError(handleServerError);
    window.api.onInstallLocationPrompt(handleInstallLocationPrompt);
    window.api.onUpdateAvailable(handleUpdateAvailable);
    window.api.onPackageUpdatesAvailable(handlePackageUpdatesAvailable);
    (window as any).api.onMenuEvent(handleMenuEvent);

    // Initialize app after listeners are in place (skip when showing package manager)
    if (!showPackageManager) {
      initializeApp();
    }

    // Cleanup on unmount
    return () => {
      clearAllAnimations();
      if ((window as any).api.unregisterMenuEvent) {
        (window as any).api.unregisterMenuEvent(handleMenuEvent);
      }

      // Note: Event listeners are managed by the preload script
      // and don't need explicit cleanup in the renderer
    };
  }, [
    clearAllAnimations,
    initializeApp,
    handleUpdateProgress,
    handleServerStarted,
    handleBootMessage,
    handleServerLog,
    handleServerError,
    handleInstallLocationPrompt,
    handleUpdateAvailable,
    handlePackageUpdatesAvailable,
    handleMenuEvent,
    showPackageManager,
  ]);

  const handleInstallComplete = useCallback(() => {
    setShowInstallPrompt(false);
    setShowBootMessage(true);
  }, []);

  const handleRetryStart = useCallback(() => {
    setServerError(null);
    setServerStatus("starting");
    setBootMessage("Retrying backend start...");
    setShowBootMessage(true);
    setShowLogs(true);
    void window.api.restartServer().catch((error: any) => {
      const message = error?.message ?? "Failed to restart backend server.";
      setServerStatus("error");
      setServerError(message);
      setBootMessage(message);
    });
  }, []);

  const handleOpenLogs = useCallback(() => {
    setShowLogs(true);
    window.api.openLogFile();
  }, []);

  const handleReinstallEnvironment = useCallback(() => {
    if (installLocationData) {
      setShowBootMessage(false);
      setShowInstallPrompt(true);
      return;
    }
    window.api.showPackageManager?.(undefined);
  }, [installLocationData]);

  const handleSkipPackageManager = useCallback(() => {
    setShowBootMessage(true);
    setBootMessage("Starting server...");
    setServerStatus("starting");
    setServerError(null);
    clearAllAnimations();
    void window.api.startServer().catch((error: any) => {
      const message = error?.message ?? "Failed to start backend server.";
      setServerStatus("error");
      setServerError(message);
      setBootMessage(message);
      setShowLogs(true);
    });
  }, [clearAllAnimations]);

  return (
    <div className="app">
      {showPackageManager && (
        <PackageManager onSkip={handleSkipPackageManager} />
      )}

      {showBootMessage && (
        <BootMessage
          message={bootMessage}
          showUpdateSteps={showUpdateSteps}
          progressData={progressData}
          status={serverStatus}
          errorMessage={serverError ?? undefined}
          onRetry={handleRetryStart}
          onOpenLogs={handleOpenLogs}
          onReinstall={handleReinstallEnvironment}
        />
      )}

      {showInstallWizard && installLocationData && (
        <InstallWizard
          defaultPath={installLocationData.defaultPath}
          defaultSelectedModules={installLocationData.packages}
          onComplete={handleInstallComplete}
        />
      )}

      <LogContainer
        logs={logs}
        isExpanded={showLogs}
        onToggle={() => setShowLogs(!showLogs)}
      />

      {showUpdateNotification && updateInfo && (
        <UpdateNotification
          releaseUrl={updateInfo.releaseUrl}
          onClose={() => setShowUpdateNotification(false)}
        />
      )}
      {showPackageUpdates && packageUpdates && (
        <PackageUpdatesNotification
          updates={packageUpdates}
          onDismiss={() => setShowPackageUpdates(false)}
          onManagePackages={() => window.api.showPackageManager?.(undefined)}
        />
      )}
    </div>
  );
};

export default App;
