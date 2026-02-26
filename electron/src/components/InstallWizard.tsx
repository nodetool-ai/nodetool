import React, { useCallback, useMemo, useState, useEffect } from "react";
import logo from "../assets/logo.png";

const moduleMapping = {
  apple: "nodetool-ai/nodetool-apple",
  // comfy: "nodetool-ai/nodetool-comfy",
  elevenlabs: "nodetool-ai/nodetool-elevenlabs",
  whispercpp: "nodetool-ai/nodetool-whispercpp",
  fal: "nodetool-ai/nodetool-fal",
  huggingface: "nodetool-ai/nodetool-huggingface",
  ml: "nodetool-ai/nodetool-lib-ml",
  mlx: "nodetool-ai/nodetool-mlx",
  replicate: "nodetool-ai/nodetool-replicate",
} as const;

type ModuleKey = keyof typeof moduleMapping;

const packageMeta: Record<
  ModuleKey,
  { title: string; description: string; recommended?: boolean }
> = {
  mlx: {
    title: "🤗 MLX",
    description: "Apple Silicon Accelerated Models",
    recommended: true,
  },
  huggingface: {
    title: "🤗 HuggingFace",
    description: "Text, Image, and Audio models from HuggingFace",
    recommended: true,
  },
  ml: {
    title: "📊 Machine Learning",
    description: "Classification, Regression, and statistical models",
  },
  whispercpp: {
    title: "🔊 WhisperCpp",
    description: "Transcribe audio using CPU",
  },
  elevenlabs: {
    title: "🎤 ElevenLabs",
    description: "Advanced text-to-speech and voice cloning",
  },
  fal: {
    title: "⚡ FAL AI",
    description: "Run premium Image and Video models on Fal AI",
  },
  replicate: {
    title: "🔄 Replicate",
    description: "Access hundreds of AI models hosted on Replicate",
  },
  apple: {
    title: "🍎 Apple Integration",
    description: "Automation for Apple Notes, Calendar, and more",
  },
  // comfy: {
  //   title: "🧱 ComfyUI",
  //   description: "ComfyUI integration and nodes",
  // },
};

const baseGroups: Array<{ key: string; title: string; items: ModuleKey[] }> = [
  {
    key: "aiml",
    title: "AI & Machine Learning",
    items: ["huggingface", "mlx", "ml", "whispercpp"],
  },
  {
    key: "services",
    title: "AI Services",
    items: ["elevenlabs", "fal", "replicate"],
  },
  { key: "integrations", title: "Integrations", items: ["apple"] },
];

interface InstallWizardProps {
  defaultPath: string;
  onComplete: () => void;
  defaultSelectedModules?: string[];
}

interface RuntimeSelection {
  ollama: boolean;
  llamacpp: boolean;
}

interface PackageOptionProps {
  name: string;
  title: string;
  description: string;
  isSelected: boolean;
  onToggle: () => void;
  badge?: React.ReactNode;
}

const PackageOption: React.FC<PackageOptionProps> = ({
  name,
  title,
  description,
  isSelected,
  onToggle,
  badge,
}) => (
  <label className="package-option">
    <input
      type="checkbox"
      name={name}
      checked={isSelected}
      onChange={onToggle}
    />
    <div className="package-card-content">
      <div className="package-header">
        <h4>{title}</h4>
        {badge && (
          <span className={`runtime-badge ${badge === 'Recommended' ? 'recommended' : ''}`}>
            {badge}
          </span>
        )}
      </div>
      <p className="package-description">{description}</p>
    </div>
  </label>
);

// Inline SVG icon components (use <use> to reference symbols injected in the DOM)
const SearchIcon: React.FC = () => (
  <svg width="16" height="16" aria-hidden>
    <use href="#icon-search" />
  </svg>
);

const FolderDownloadIcon: React.FC = () => (
  <svg width="16" height="16" aria-hidden>
    <use href="#icon-folder-download" />
  </svg>
);

const TerminalIcon: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5"></polyline>
    <line x1="12" y1="19" x2="20" y2="19"></line>
  </svg>
);

const CpuIcon: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
    <rect x="9" y="9" width="6" height="6"></rect>
    <line x1="9" y1="1" x2="9" y2="4"></line>
    <line x1="15" y1="1" x2="15" y2="4"></line>
    <line x1="9" y1="20" x2="9" y2="23"></line>
    <line x1="15" y1="20" x2="15" y2="23"></line>
    <line x1="20" y1="9" x2="23" y2="9"></line>
    <line x1="20" y1="14" x2="23" y2="14"></line>
    <line x1="1" y1="9" x2="4" y2="9"></line>
    <line x1="1" y1="14" x2="4" y2="14"></line>
  </svg>
);

const InstallWizard: React.FC<InstallWizardProps> = ({
  defaultPath,
  onComplete,
  defaultSelectedModules = [],
}) => {
  const isMac = window.api.platform === "darwin";
  const allowedModuleKeys = useMemo<ModuleKey[]>(() => {
    const keys = Object.keys(moduleMapping) as ModuleKey[];
    return isMac ? keys : keys.filter((key) => key !== "mlx" && key !== "apple");
  }, [isMac]);

  const allowedModuleRepoIds = useMemo(
    () => new Set<string>(allowedModuleKeys.map((key) => moduleMapping[key])),
    [allowedModuleKeys]
  );

  const sanitizeSelection = useCallback(
    (modules: string[]) => modules.filter((id) => allowedModuleRepoIds.has(id)),
    [allowedModuleRepoIds]
  );

  const groups = useMemo(
    () =>
      baseGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => allowedModuleKeys.includes(item)),
        }))
        .filter((group) => group.items.length > 0),
    [allowedModuleKeys]
  );

  // Update step type to include licensing step
  const [currentStep, setCurrentStep] = useState<
    "welcome" | "location" | "runtime" | "packages" | "licensing"
  >("welcome");
  const [selectedPath, setSelectedPath] = useState(defaultPath);
  const [selectedRuntime, setSelectedRuntime] =
    useState<RuntimeSelection>({ ollama: true, llamacpp: false });
  const LOCAL_STORAGE_KEY = "installer.selectedModules";
  const RUNTIME_STORAGE_KEY = "installer.selectedRuntime";
  const [pathError, setPathError] = useState<string | null>(null);
  const [isOllamaRunning, setIsOllamaRunning] = useState(false);
  const [isOllamaInstalled, setIsOllamaInstalled] = useState(false);

  // Check for running Ollama instance or existing installation
  useEffect(() => {
    let cancelled = false;

    const checkOllama = async () => {
      let running = false;
      let installed = false;

      // Check for running instance on default Ollama port.
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 1000);
        const res = await fetch("http://127.0.0.1:11434/api/tags", {
          signal: controller.signal,
        });
        clearTimeout(id);
        running = res.ok;
      } catch {
        running = false;
      }

      // Check for installed binary (available on PATH).
      try {
        installed = await window.api.system.checkOllamaInstalled();
      } catch (e) {
        console.error("Failed to check for Ollama installation:", e);
      }

      if (cancelled) {
        return;
      }

      setIsOllamaRunning(running);
      setIsOllamaInstalled(installed);
    };

    void checkOllama();

    return () => {
      cancelled = true;
    };
  }, []);

  // Prefer Ollama when it's detected and no runtime has been selected.
  useEffect(() => {
    const detected = isOllamaRunning || isOllamaInstalled;
    const hasAnyRuntime = selectedRuntime.ollama || selectedRuntime.llamacpp;
    if (currentStep === "runtime" && detected && !hasAnyRuntime) {
      const nextSelection = { ollama: true, llamacpp: selectedRuntime.llamacpp };
      setSelectedRuntime(nextSelection);
      try {
        localStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(nextSelection));
      } catch {
        // ignore
      }
    }
  }, [currentStep, isOllamaRunning, isOllamaInstalled, selectedRuntime]);


  const validatePath = useCallback((path: string) => {
    if (!path) {
      return "Please choose an installation location.";
    }
    if (/\s/.test(path)) {
      return "Installation path cannot contain spaces. Please choose a location without whitespace.";
    }
    return null;
  }, []);

  // Load runtime preference from localStorage (supports legacy single-choice values).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RUNTIME_STORAGE_KEY);
      if (!saved) {
        return;
      }

      if (saved === "ollama") {
        setSelectedRuntime({ ollama: true, llamacpp: false });
        return;
      }
      if (saved === "llamacpp") {
        setSelectedRuntime({ ollama: false, llamacpp: true });
        return;
      }
      if (saved === "skip") {
        setSelectedRuntime({ ollama: false, llamacpp: false });
        return;
      }

      const parsed = JSON.parse(saved) as Partial<RuntimeSelection>;
      if (
        typeof parsed.ollama === "boolean" &&
        typeof parsed.llamacpp === "boolean"
      ) {
        setSelectedRuntime({
          ollama: parsed.ollama,
          llamacpp: parsed.llamacpp,
        });
      }
    } catch {
      // ignore
    }
  }, []);

  const applyPathSelection = useCallback(
    (path: string) => {
      setSelectedPath(path);
      const error = validatePath(path);
      if (error) {
        setPathError(error);
        setCurrentStep("location");
        return false;
      }
      setPathError(null);
      setCurrentStep("runtime");
      return true;
    },
    [validatePath]
  );

  const handleRuntimeToggle = (runtime: keyof RuntimeSelection) => {
    const nextSelection = {
      ...selectedRuntime,
      [runtime]: !selectedRuntime[runtime],
    };
    setSelectedRuntime(nextSelection);
    try {
      localStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(nextSelection));
    } catch {
      // ignore
    }
  };

  // Update handleBack to include licensing step
  const handleBack = () => {
    if (currentStep === "packages") {
      setCurrentStep("licensing");
    } else if (currentStep === "licensing") {
      setCurrentStep("runtime");
    } else if (currentStep === "runtime") {
      setCurrentStep("location");
    } else if (currentStep === "location") {
      setCurrentStep("welcome");
    }
  };

  const handleInstall = async () => {
    const error = validatePath(selectedPath);
    if (error) {
      setPathError(error);
      setCurrentStep("location");
      return;
    }
    const sanitizedSelection = sanitizeSelection(selectedModules);
    if (sanitizedSelection.length !== selectedModules.length) {
      persist(sanitizedSelection);
      setSelectedModules(sanitizedSelection);
    }

    // Determine what to install based on runtime selection
    let ollamaDetected = isOllamaRunning || isOllamaInstalled;
    if (selectedRuntime.ollama && !ollamaDetected) {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 1000);
        const res = await fetch("http://127.0.0.1:11434/api/tags", {
          signal: controller.signal,
        });
        clearTimeout(id);
        ollamaDetected = res.ok;
      } catch {
        // ignore
      }

      if (!ollamaDetected) {
        try {
          ollamaDetected = await window.api.system.checkOllamaInstalled();
        } catch {
          // ignore
        }
      }
    }
    const startOllamaOnStartup = selectedRuntime.ollama;
    const startLlamaCppOnStartup = selectedRuntime.llamacpp;
    const installOllama = selectedRuntime.ollama && !ollamaDetected;
    const installLlamaCpp = selectedRuntime.llamacpp;

    // Map UI runtime option to backend type
    let modelBackend: "ollama" | "llama_cpp" | "none" = "ollama";
    if (selectedRuntime.ollama && selectedRuntime.llamacpp) {
      modelBackend = "ollama";
    } else if (selectedRuntime.llamacpp) {
      modelBackend = "llama_cpp";
    } else if (!selectedRuntime.ollama) {
      modelBackend = "none";
    }

    await window.api.installer.install(
      selectedPath,
      sanitizedSelection,
      modelBackend,
      installOllama,
      installLlamaCpp,
      startOllamaOnStartup,
      startLlamaCppOnStartup
    );
    onComplete();
  };

  const [selectedModules, setSelectedModules] = useState<string[]>(() => {
    const normalizedDefaults = sanitizeSelection(defaultSelectedModules);
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as string[]) : normalizedDefaults;
      const sanitized = sanitizeSelection(
        parsed.length ? parsed : normalizedDefaults
      );
      if (sanitized.length !== parsed.length) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sanitized));
      }
      return sanitized;
    } catch {
      return normalizedDefaults;
    }
  });
  const persist = (next: string[]) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleModuleToggle = (moduleName: ModuleKey) => {
    if (!allowedModuleKeys.includes(moduleName)) {
      return;
    }
    const repoId = moduleMapping[moduleName as keyof typeof moduleMapping];
    setSelectedModules((prev: string[]) => {
      const next = prev.includes(repoId)
        ? prev.filter((id: string) => id !== repoId)
        : Array.from(new Set([...prev, repoId]));
      persist(next);
      return next;
    });
  };

  const isModuleSelected = (moduleName: string): boolean => {
    const repoId = moduleMapping[moduleName as keyof typeof moduleMapping];
    return selectedModules.includes(repoId);
  };

  const handleDefaultLocation = () => {
    applyPathSelection(defaultPath);
  };

  const handleCustomLocation = async () => {
    const result = await window.api.installer.selectLocation();
    if (result) {
      applyPathSelection(result);
    }
  };

  const selectedCount = selectedModules.length;

  const toggleGroup = (items: ModuleKey[], select: boolean) => {
    if (select) {
      const repoIds = items.map((k) => moduleMapping[k]);
      setSelectedModules((prev) => {
        const next = Array.from(new Set([...prev, ...repoIds]));
        persist(next);
        return next;
      });
    } else {
      const repoIds = new Set<string>(items.map((k) => moduleMapping[k]));
      setSelectedModules((prev) => {
        const next = prev.filter((id) => !repoIds.has(id));
        persist(next);
        return next;
      });
    }
  };
  return (
    <div id="install-location-prompt">
      {/* Inline icons (accessible, no external assets) */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <symbol id="icon-search" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14Z"
          />
        </symbol>
        <symbol id="icon-folder-download" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Zm-6 5v4h-2v-4H9l3-3 3 3h-1Z"
          />
        </symbol>
      </svg>
      <div className="installer-shell">
        <div className="installer-header">
          <div className="installer-brand">NodeTool Installer</div>
          <div className="installer-sub">
            Fast, private, local-first AI workflows
          </div>
        </div>

        <div className="wizard-layout">
          <aside className="wizard-rail">
            {[
              { key: "welcome", label: "Welcome" },
              { key: "location", label: "Step 1: Location" },
              { key: "runtime", label: "Step 2: AI Runtime" },
              { key: "licensing", label: "Step 3: Licensing" },
              { key: "packages", label: "Step 4: Packages" },
            ].map((step, index) => (
              <div
                key={step.key}
                className={`wizard-step ${
                  currentStep === step.key ? "active" : ""
                }`}
              >
                <div className="step-label">{step.label}</div>
              </div>
            ))}
          </aside>

          <div id="environment-info" className="wizard-content">
            {/* Step 0: Welcome */}
            {currentStep === "welcome" && (
              <div className="setup-step active welcome-step">
                <div className="welcome-hero">
                  <div className="hero-icon-wrapper">
                    <img
                      src={logo}
                      alt="NodeTool Logo"
                      className="nodetool-icon hero-icon"
                      style={{ objectFit: "contain" }}
                    />
                  </div>
                  <h1>Welcome to NodeTool</h1>
                  <p className="hero-subtitle">
                    The fastest way to run AI models locally.
                  </p>
                </div>
                
                <div className="welcome-content">
                  <p>
                    This installer will set up a dedicated environment for running
                    advanced AI workflows on your machine.
                  </p>
                </div>
                <div
                  className="welcome-actions" // Clean up layout
                  style={{ justifyContent: "center", width: "100%", display: "flex", marginTop: "40px" }}
                >
                  <button
                    className="primary"
                    onClick={() => setCurrentStep("location")}
                  >
                    Get Started
                  </button>
                </div>
              </div>
            )}

            {currentStep === "location" && (
              <div id="step-location" className="setup-step active">
                <div className="step-header">
                  <h3>Step 1: Choose Installation Location</h3>
                  <p>Where would you like to install NodeTool?</p>
                  <p role="note" style={{ marginTop: 8, color: "#7a7a7a" }}>
                    Note: Installation may download Python libraries and require
                    additional disk space.
                  </p>
                </div>
                
                <div className="location-options" style={{ marginTop: 24 }}>
                  {/* Default Location Card */}
                  <div 
                    className="location-card"
                    onClick={handleDefaultLocation}
                  >
                    <div className="location-icon-wrapper">
                      <FolderDownloadIcon />
                    </div>
                    <div className="location-content">
                      <h4 className="location-title">Install to Default Location</h4>
                      <div className="location-path">{defaultPath}</div>
                    </div>
                  </div>

                  {/* Custom Location Card */}
                  <div 
                    className="location-card"
                    onClick={handleCustomLocation}
                  >
                    <div className="location-icon-wrapper">
                      <SearchIcon />
                    </div>
                    <div className="location-content">
                      <h4 className="location-title">Install to Custom Location</h4>
                      <span style={{ fontSize: '13px', color: 'var(--c_text_secondary)' }}>
                        Choose a specific folder on your system...
                      </span>
                    </div>
                  </div>
                </div>

                {pathError && (
                  <div
                    className="location-error"
                    role="alert"
                    style={{
                      marginTop: 16,
                      color: "#fca5a5",
                      backgroundColor: "rgba(239, 68, 68, 0.1)",
                      padding: "12px 16px",
                      borderRadius: 12,
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    {pathError}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Runtime Selection */}
            {currentStep === "runtime" && (
              <div id="step-runtime" className="setup-step active">
                <div className="step-header">
                  <h3>Step 2: Choose Local Model Services</h3>
                  <p>
                    Choose which Electron-managed services should be configured for startup.
                    You can enable one, both, or neither.
                  </p>
                  <p role="note" style={{ marginTop: 8, color: "#7a7a7a" }}>
                    Installing to: <code>{selectedPath}</code>
                  </p>
                </div>
                <div
                  className="runtime-grid"
                  style={{ marginTop: "24px" }}
                >
                  {/* Ollama Option */}
                  <div
                    className={`runtime-card ${
                      selectedRuntime.ollama ? "selected" : ""
                    }`}
                    onClick={() => handleRuntimeToggle("ollama")}
                  >
                    <div className="runtime-icon">
                      <TerminalIcon />
                    </div>
                    <div className="runtime-content">
                      <div className="runtime-header">
                        <h4 className="runtime-title">Ollama</h4>
                        <span
                          className={`runtime-badge ${
                            isOllamaRunning || isOllamaInstalled
                              ? "running"
                              : "recommended"
                          }`}
                        >
                          {isOllamaRunning || isOllamaInstalled
                            ? "Detected"
                            : "Recommended"}
                        </span>
                      </div>
                      <p className="runtime-description">
                        Easy to use, recommended for most users. Includes model management and a simple API.
                      </p>
                      
                      {(isOllamaRunning || isOllamaInstalled) && (
                        <div className="runtime-note">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                          </svg>
                          <span>Ollama detected. NodeTool will use your existing Ollama and will not download it.</span>
                        </div>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      name="runtime-ollama"
                      value="ollama"
                      checked={selectedRuntime.ollama}
                      onChange={() => {}} // Handle click on parent
                      style={{ marginLeft: "auto", marginRight: 0 }}
                    />
                  </div>

                  {/* llama.cpp Option */}
                  <div
                    className={`runtime-card ${
                      selectedRuntime.llamacpp ? "selected" : ""
                    }`}
                    onClick={() => handleRuntimeToggle("llamacpp")}
                  >
                    <div className="runtime-icon">
                      <CpuIcon />
                    </div>
                    <div className="runtime-content">
                      <div className="runtime-header">
                        <h4 className="runtime-title">llama.cpp</h4>
                      </div>
                      <p className="runtime-description">
                        High-performance backend with built-in GPU acceleration and GGUF model support.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      name="runtime-llamacpp"
                      value="llamacpp"
                      checked={selectedRuntime.llamacpp}
                      onChange={() => {}}
                      style={{ marginLeft: "auto", marginRight: 0 }}
                    />
                  </div>
                </div>

                <div className="runtime-selection-help" style={{ marginTop: "14px" }}>
                  {!selectedRuntime.ollama && !selectedRuntime.llamacpp ? (
                    <p className="runtime-description">
                      No local model service selected. You can continue and use external providers only.
                    </p>
                  ) : selectedRuntime.ollama && selectedRuntime.llamacpp ? (
                    <p className="runtime-description">
                      Both services selected. NodeTool will manage startup for both and install required binaries.
                    </p>
                  ) : (
                    <p className="runtime-description">
                      Selected service will be managed by NodeTool on startup.
                    </p>
                  )}
                </div>

                <div
                  className="navigation-buttons"
                  style={{ marginTop: "24px" }}
                >
                  <button className="nav-button back" onClick={handleBack}>
                    ← Back
                  </button>
                  <button
                    className="nav-button next"
                    onClick={() => setCurrentStep("licensing")}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}

            {/* Step: Licensing Notice */}
            {currentStep === "licensing" && (
              <div id="step-licensing" className="setup-step active">
                <div className="step-header">
                  <h3>Required Licensing Notice</h3>
                  <p>
                    Please review the following licensing information before
                    proceeding with installation.
                  </p>
                </div>

                <div className="license-box">
                  <div className="license-content">
                    <p style={{ marginTop: 0, marginBottom: "16px" }}>
                      <strong>
                        This installer includes components from the Anaconda
                        Distribution.
                      </strong>{" "}
                      Use of these components is governed by the{" "}
                      <a
                        href="https://www.anaconda.com/terms-of-service"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Anaconda Terms of Service
                      </a>
                      . NodeTool does not provide or transfer a license for
                      Anaconda components. Users are responsible for ensuring
                      that their use complies with Anaconda's licensing rules.
                    </p>

                    <p style={{ marginBottom: "16px" }}>
                      <strong>
                        Organisations with 200 or more employees require a
                        commercial Anaconda license
                      </strong>{" "}
                      for any use of the bundled Anaconda components.
                    </p>

                    <p style={{ marginBottom: "16px" }}>
                      <strong>
                        Channel Information:
                      </strong>{" "}
                      This installation uses the <strong>conda-forge</strong>{" "}
                      channel (not Anaconda's default channel) for package
                      resolution via micromamba. Conda-forge packages are
                      community-maintained and do not require Anaconda
                      commercial licensing.
                    </p>

                    <div className="license-divider"></div>

                    <p style={{ marginBottom: "12px" }}>
                      <strong>
                        AI Runtime Components:
                      </strong>
                    </p>
                    <p style={{ marginBottom: "12px" }}>
                      <strong>Ollama</strong> and <strong>llama.cpp</strong>{" "}
                      are optional AI runtime components that may be installed
                      with this application. These components are provided
                      under their respective open source licenses:
                    </p>
                    <ul
                      style={{
                        margin: "8px 0 16px 20px",
                        paddingLeft: "20px",
                      }}
                    >
                      <li>
                        <strong>Ollama:</strong> MIT License (
                        <a
                          href="https://github.com/ollama/ollama/blob/main/LICENSE"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          view license
                        </a>
                        )
                      </li>
                      <li>
                        <strong>llama.cpp:</strong> MIT License (
                        <a
                          href="https://github.com/ggerganov/llama.cpp/blob/master/LICENSE"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          view license
                        </a>
                        )
                      </li>
                    </ul>
                    <p
                      style={{
                        marginBottom: "16px",
                        fontSize: "12px",
                        color: "var(--c_text_tertiary)",
                      }}
                    >
                      NodeTool does not provide or transfer licenses for
                      Ollama or llama.cpp. Users are responsible for
                      compliance with their respective license terms. These
                      components are optional and may be skipped during
                      installation if you prefer to use external
                      installations.
                    </p>

                    <div className="license-divider"></div>
                    
                    <p style={{ marginBottom: "8px" }}>
                      <strong>
                        Open Source Licenses:
                      </strong>
                    </p>
                    <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
                      <li>
                        <strong>Micromamba:</strong> Apache 2.0 License
                      </li>
                      <li>
                        <strong>NodeTool:</strong> AGPL-3.0 License
                      </li>
                      <li>
                        <strong>Ollama:</strong> MIT License
                      </li>
                      <li>
                        <strong>llama.cpp:</strong> MIT License
                      </li>
                    </ul>
                    <p
                      style={{
                        marginTop: "12px",
                        fontSize: "12px",
                        color: "var(--c_text_tertiary)",
                      }}
                    >
                      Full license texts are available in the application's
                      LICENSE and NOTICE files.
                    </p>
                  </div>
                </div>

                <div
                  className="navigation-buttons"
                  style={{ marginTop: "24px" }}
                >
                  <button className="nav-button back" onClick={handleBack}>
                    ← Back
                  </button>
                  <button
                    className="nav-button next"
                    onClick={() => setCurrentStep("packages")}
                  >
                    I Understand, Continue →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Package Selection */}
            {currentStep === "packages" && (
              <div id="step-packages" className="setup-step active">
                <div className="step-header">
                  <h3>Step 4: Choose Packages</h3>
                  <p>Select the packages you'd like to install:</p>
                  <p
                    role="note"
                    style={{
                      marginTop: 8,
                      color: "#7a7a7a",
                      wordBreak: "break-all",
                    }}
                  >
                    Installing to: <code>{selectedPath}</code>
                  </p>
                </div>

                <div className="package-selection">
                  <div className="package-grid">
                    {groups.map((group) => {
                      const allSelected = group.items.every((k) =>
                        isModuleSelected(k)
                      );
                      const someSelected =
                        !allSelected &&
                        group.items.some((k) => isModuleSelected(k));
                      return (
                        <div className="package-group" key={group.key}>
                          <div className="group-header">
                            <h4>{group.title}</h4>
                            <div className="group-actions">
                              {!allSelected && (
                                <button
                                  className="chip-button"
                                  onClick={() => toggleGroup(group.items, true)}
                                >
                                  Select all
                                </button>
                              )}
                              {(allSelected || someSelected) && (
                                <button
                                  className="chip-button"
                                  onClick={() =>
                                    toggleGroup(group.items, false)
                                  }
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="package-options">
                            {group.items.map((key) => (
                              <PackageOption
                                key={key}
                                name={key}
                                title={packageMeta[key].title}
                                description={packageMeta[key].description}
                                isSelected={isModuleSelected(key)}
                                onToggle={() => handleModuleToggle(key)}
                                badge={
                                  packageMeta[key].recommended
                                    ? "Recommended"
                                    : undefined
                                }
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="navigation-buttons">
                  <button className="nav-button back" onClick={handleBack}>
                    ← Back
                  </button>
                  <button className="nav-button next" onClick={handleInstall}>
                    Install {selectedCount > 0 ? `(${selectedCount}) ` : ""}→
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstallWizard;
