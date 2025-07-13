import React, { useEffect, useState, useCallback } from "react";
import TitleBar from "./components/TitleBar";
import BootMessage from "./components/BootMessage";
import InstallLocationPrompt from "./components/InstallLocationPrompt";
import LogContainer from "./components/LogContainer";
import UpdateNotification from "./components/UpdateNotification";
import PackageManager from "./components/PackageManager";
import { useIconAnimation } from "./hooks/useIconAnimation";
import "./index.css";

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
  const [logs, setLogs] = useState<string[]>([]);
  const [bootMessage, setBootMessage] = useState<string>("");
  const [showBootMessage, setShowBootMessage] = useState(true);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [showUpdateSteps, setShowUpdateSteps] = useState(false);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showPackageManager, setShowPackageManager] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const [progressData, setProgressData] = useState<UpdateProgressData>({
    componentName: "",
    progress: 0,
    action: "",
    eta: "",
  });
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

  console.log(showPackageManager, showBootMessage, showInstallPrompt);

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
    if (showPackageManager) {
      setServerReady(true);
    } else {
      initializeApp();
    }
  }, [showPackageManager, initializeApp]);

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

  const handleShowPackageManager = useCallback(() => {
    setShowBootMessage(false);
    setShowInstallPrompt(false);
    setShowPackageManager(true);
    startAnimations();
  }, [
    setShowBootMessage,
    setShowInstallPrompt,
    setShowPackageManager,
    startAnimations,
  ]);

  const handleUpdateAvailable = useCallback(
    (info: UpdateInfo) => {
      setUpdateInfo(info);
      setShowUpdateNotification(true);
    },
    [setUpdateInfo, setShowUpdateNotification]
  );

  useEffect(() => {
    // Initialize platform class
    document.body.classList.add(`platform-${window.api.platform}`);

    // Initialize app
    initializeApp();
    // Register event listeners
    window.api.onUpdateProgress(handleUpdateProgress);
    window.api.onServerStarted(handleServerStarted);
    window.api.onBootMessage(handleBootMessage);
    window.api.onServerLog(handleServerLog);
    window.api.onInstallLocationPrompt(handleInstallLocationPrompt);
    window.api.onUpdateAvailable(handleUpdateAvailable);
    window.api.onShowPackageManager(handleShowPackageManager);

    // Cleanup on unmount
    return () => {
      clearAllAnimations();

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
    handleShowPackageManager,
    handleUpdateAvailable,
  ]);

  const handleInstallComplete = useCallback(() => {
    setShowInstallPrompt(false);
    setShowBootMessage(true);
  }, []);

  const handleSkipPackageManager = useCallback(() => {
    setShowBootMessage(true);
    setBootMessage("Starting server...");
    setShowPackageManager(false);
    clearAllAnimations();
    window.api.startServer();
  }, [clearAllAnimations]);

  return (
    <div className="app">
      <TitleBar />

      {showBootMessage && !showPackageManager && (
        <BootMessage
          message={bootMessage}
          showUpdateSteps={showUpdateSteps}
          progressData={progressData}
        />
      )}

      {showInstallPrompt && installLocationData && (
        <InstallLocationPrompt
          defaultPath={installLocationData.defaultPath}
          onComplete={handleInstallComplete}
        />
      )}

      {showPackageManager && (
        <PackageManager onSkip={handleSkipPackageManager} />
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
