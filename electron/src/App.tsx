import React, { useEffect, useState, useCallback } from "react";
import TitleBar from "./components/TitleBar";
import BootMessage from "./components/BootMessage";
import InstallWizard from "./components/InstallWizard";
import LogContainer from "./components/LogContainer";
import UpdateNotification from "./components/UpdateNotification";
import { useIconAnimation } from "./hooks/useIconAnimation";
import "./index.css";
import PackageManager from "./components/PackageManager";

interface UpdateProgressData {
  componentName: string;
  progress: number;
  action: string;
  eta?: string;
}

interface InstallLocationData {
  defaultPath: string;
}

interface UpdateInfo {
  releaseUrl: string;
}

const App: React.FC = () => {
  const showPackageManager = window.location.search.includes("package-manager");

  const [logs, setLogs] = useState<string[]>([]);
  const [bootMessage, setBootMessage] = useState<string>("");
  const [showBootMessage, setShowBootMessage] = useState(!showPackageManager);
  const [showInstallWizard, setShowInstallPrompt] = useState(false);
  const [showUpdateSteps, setShowUpdateSteps] = useState(false);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [progressData, setProgressData] = useState<UpdateProgressData>({
    componentName: "",
    progress: 0,
    action: "",
    eta: "",
  });
  // showPackageManager is declared above to allow conditional initial state

  const [installLocationData, setInstallLocationData] =
    useState<InstallLocationData | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

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
        logs: serverLogs,
        initialURL,
      } = await window.api.getServerState();

      if (isStarted) {
        loadContentWithNoCaching(initialURL);
      } else {
        setShowBootMessage(true);
        setBootMessage(bootMsg);
        startAnimations();
      }

      setLogs(serverLogs);
    } catch (error) {
      console.error("Failed to initialize app:", error);
    }
  }, [loadContentWithNoCaching, startAnimations]);

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
    if (!showPackageManager) {
      initializeApp();
    }
  }, [initializeApp, showPackageManager]);

  const handleBootMessage = useCallback(
    (message: string) => {
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

  const handleInstallLocationPrompt = useCallback(
    (data: InstallLocationData) => {
      setInstallLocationData(data);
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

  const handleMenuEvent = useCallback((data: any) => {
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
  }, [addLog]);

  useEffect(() => {
    // Initialize platform class
    document.body.classList.add(`platform-${window.api.platform}`);
    // Register event listeners FIRST
    window.api.onUpdateProgress(handleUpdateProgress);
    window.api.onServerStarted(handleServerStarted);
    window.api.onBootMessage(handleBootMessage);
    window.api.onServerLog(handleServerLog);
    window.api.onInstallLocationPrompt(handleInstallLocationPrompt);
    window.api.onUpdateAvailable(handleUpdateAvailable);
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
    handleInstallLocationPrompt,
    handleUpdateAvailable,
    handleMenuEvent,
    showPackageManager,
  ]);

  const handleInstallComplete = useCallback(() => {
    setShowInstallPrompt(false);
    setShowBootMessage(true);
  }, []);

  const handleSkipPackageManager = useCallback(() => {
    setShowBootMessage(true);
    setBootMessage("Starting server...");
    clearAllAnimations();
    window.api.startServer();
  }, [clearAllAnimations]);

  return (
    <div className="app">
      <TitleBar />

      {showPackageManager && (
        <PackageManager onSkip={handleSkipPackageManager} />
      )}

      {showBootMessage && (
        <BootMessage
          message={bootMessage}
          showUpdateSteps={showUpdateSteps}
          progressData={progressData}
        />
      )}

      {showInstallWizard && installLocationData && (
        <InstallWizard
          defaultPath={installLocationData.defaultPath}
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
    </div>
  );
};

export default App;
