import React, { useEffect, useState, useRef, useCallback, useMemo  } from 'react';
import { IntervalRef } from './types';
import TitleBar from './components/TitleBar';
import BootMessage from './components/BootMessage';
import InstallLocationPrompt from './components/InstallLocationPrompt';
import LogContainer from './components/LogContainer';
import UpdateNotification from './components/UpdateNotification';
import PackageManager from './components/PackageManager';
import './index.css';

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
  const [bootMessage, setBootMessage] = useState<string>('');
  const [showBootMessage, setShowBootMessage] = useState(true);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [showUpdateSteps, setShowUpdateSteps] = useState(false);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showPackageManager, setShowPackageManager] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const [progressData, setProgressData] = useState<UpdateProgressData>({
    componentName: '',
    progress: 0,
    action: '',
    eta: ''
  });
  const [installLocationData, setInstallLocationData] = useState<InstallLocationData | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  const strokeInterval = useRef<IntervalRef>({ current: null });
  const fillInterval = useRef<IntervalRef>({ current: null });
  const colorfulStrokeInterval = useRef<IntervalRef>({ current: null });
  const colorfulFillInterval = useRef<IntervalRef>({ current: null });

  const addLog = useCallback((message: string) => {
    setLogs((prev: string[]) => [...prev, message]);
  }, []);

  const loadContentWithNoCaching = useCallback((initialURL: string) => {
    const timestamp = new Date().getTime();
    window.location.href = `${initialURL}?nocache=${timestamp}`;
  }, []);

  const clearAllAnimations = useCallback(() => {
    [strokeInterval, fillInterval, colorfulStrokeInterval, colorfulFillInterval].forEach((interval) => {
      if (interval.current?.current) {
        clearInterval(interval.current.current);
        interval.current.current = null;
      }
    });
  }, []);

  const getRandomGrayColor = useCallback(() => {
    const grayValue = Math.floor(Math.random() * 100);
    return `#${grayValue.toString(16).padStart(2, '0').repeat(3)}`;
  }, []);

  const getRandomColor = useCallback(() => {
    const randomColor = Math.floor(Math.random() * 16777215).toString(16);
    return `#${randomColor.padStart(6, '0')}`;
  }, []);

  const updateStroke = useCallback(() => {
    const icon = document.querySelector<HTMLElement>('.nodetool-icon');
    if (icon) {
      icon.style.setProperty('--stroke-color', getRandomGrayColor());
    }
  }, [getRandomGrayColor]);

  const updateFill = useCallback(() => {
    const icon = document.querySelector<HTMLElement>('.nodetool-icon');
    if (icon) {
      icon.style.setProperty('--fill-color', getRandomGrayColor());
    }
  }, [getRandomGrayColor]);

  const startIconAnimations = useCallback(() => {
    updateStroke();

    strokeInterval.current.current = setInterval(updateStroke, 5000);

    setTimeout(() => {
      fillInterval.current.current = setInterval(updateFill, 5000);
    }, 60000 + 2500);

    setTimeout(() => {
      colorfulStrokeInterval.current.current = setInterval(() => {
        const icon = document.querySelector<HTMLElement>('.nodetool-icon');
        if (icon) {
          icon.style.setProperty('--stroke-color', getRandomColor());
        }
      }, 5000);
    }, 5 * 60000);

    setTimeout(() => {
      colorfulFillInterval.current.current = setInterval(() => {
        const icon = document.querySelector<HTMLElement>('.nodetool-icon');
        if (icon) {
          icon.style.setProperty('--fill-color', getRandomColor());
        }
      }, 5000);
    }, 10 * 60000 + 2500);
  }, [updateStroke, updateFill, getRandomGrayColor]);

  const initializeApp = useCallback(async () => {
    try {
      const { isStarted, bootMsg, logs: serverLogs, initialURL } = await window.api.getServerState();
      
      if (isStarted) {
        loadContentWithNoCaching(initialURL);
      } else {
        setShowBootMessage(true);
        setBootMessage(bootMsg);
        startIconAnimations();
      }

      setLogs(serverLogs);
    } catch (error) {
      console.error('Failed to initialize app:', error);
    }
  }, [loadContentWithNoCaching, startIconAnimations]);

  useEffect(() => {
    // Initialize platform class
    document.body.classList.add(`platform-${window.api.platform}`);

    // Initialize app
    initializeApp();

    // Set up event listeners
    const handleUpdateProgress = (data: UpdateProgressData) => {
      setProgressData(data);
      if (data.progress < 100) {
        setShowUpdateSteps(true);
      } else {
        setTimeout(() => setShowUpdateSteps(false), 5000);
      }
    };

    const handleServerStarted = () => {
      if (showPackageManager) {
        setServerReady(true);
      } else {
        initializeApp();
      }
    };

    const handleBootMessage = (message: string) => {
      setBootMessage(message);
      if (message.includes('Setting up Python')) {
        setShowLogs(true);
      }
    };

    const handleServerLog = (message: string) => {
      addLog(message);
    };

    const handleInstallLocationPrompt = (data: InstallLocationData) => {
      setInstallLocationData(data);
      setShowBootMessage(false);
      setShowInstallPrompt(true);
    };
    
    const handleShowPackageManager = () => {
      setShowBootMessage(false);
      setShowInstallPrompt(false);
      setShowPackageManager(true);
      startIconAnimations();
    };

    const handleUpdateAvailable = (info: UpdateInfo) => {
      setUpdateInfo(info);
      setShowUpdateNotification(true);
    };

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
    };
  }, []);

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
      
      {showBootMessage && (
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
        <PackageManager
          onSkip={handleSkipPackageManager}
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