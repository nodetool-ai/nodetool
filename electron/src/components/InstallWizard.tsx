import React, { useCallback, useState, useEffect } from "react";
import logo from "../assets/logo.png";

interface InstallWizardProps {
  defaultPath: string;
  onComplete: () => void;
  defaultSelectedModules?: string[];
}

interface RuntimeSelection {
  llamacpp: boolean;
}

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
}) => {
  const RUNTIME_STORAGE_KEY = "installer.selectedRuntime";

  const [currentStep, setCurrentStep] = useState<
    "welcome" | "location" | "runtime" | "licensing"
  >("welcome");
  const [selectedPath, setSelectedPath] = useState(defaultPath);
  const [selectedRuntime, setSelectedRuntime] =
    useState<RuntimeSelection>({ llamacpp: false });
  const [pathError, setPathError] = useState<string | null>(null);


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

      if (saved === "llamacpp") {
        setSelectedRuntime({ llamacpp: true });
        return;
      }
      if (saved === "skip" || saved === "ollama") {
        setSelectedRuntime({ llamacpp: false });
        return;
      }

      const parsed = JSON.parse(saved) as Partial<RuntimeSelection>;
      if (typeof parsed.llamacpp === "boolean") {
        setSelectedRuntime({
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

  const handleBack = () => {
    if (currentStep === "licensing") {
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

    const startLlamaCppOnStartup = selectedRuntime.llamacpp;
    const installLlamaCpp = selectedRuntime.llamacpp;

    // Map UI runtime option to backend type
    let modelBackend: "ollama" | "llama_cpp" | "none" = "none";
    if (selectedRuntime.llamacpp) {
      modelBackend = "llama_cpp";
    }

    await window.api.installer.install(
      selectedPath,
      [],
      modelBackend,
      installLlamaCpp,
      startLlamaCppOnStartup
    );
    onComplete();
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
                  {!selectedRuntime.llamacpp ? (
                    <p className="runtime-description">
                      No local model service selected. You can continue and use external providers (e.g. Ollama) directly.
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

            {/* Step 3: Licensing Notice */}
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
                      <strong>llama.cpp</strong>{" "}
                      is an optional AI runtime component that may be installed
                      with this application. It is provided
                      under the MIT License (
                        <a
                          href="https://github.com/ggerganov/llama.cpp/blob/master/LICENSE"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          view license
                        </a>
                      ).
                    </p>
                    <p
                      style={{
                        marginBottom: "16px",
                        fontSize: "12px",
                        color: "var(--c_text_tertiary)",
                      }}
                    >
                      NodeTool does not provide or transfer a license for
                      llama.cpp. Users are responsible for
                      compliance with its license terms. This
                      component is optional and may be skipped during
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
                    onClick={handleInstall}
                  >
                    I Understand, Install →
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
