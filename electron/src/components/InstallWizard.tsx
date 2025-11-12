import React, { useCallback, useMemo, useState } from "react";

const moduleMapping = {
  // apple: "nodetool-ai/nodetool-apple",
  audio: "nodetool-ai/nodetool-lib-audio",
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
  audio: {
    title: "🔊 Audio Processing",
    description: "Apply audio effects and analyze audio",
  },
  // apple: {
  //   title: "🍎 Apple",
  //   description: "Automation for Apple Notes, Calendar, and more",
  // },
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
  {
    key: "utilities",
    title: "Utilities",
    items: ["audio"],
  },
  // { key: "integrations", title: "Integrations", items: ["apple", "comfy"] },
];

interface InstallWizardProps {
  defaultPath: string;
  onComplete: () => void;
  defaultSelectedModules?: string[];
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
    <div className="checkbox-wrapper">
      <input
        type="checkbox"
        name={name}
        checked={isSelected}
        onChange={onToggle}
      />
    </div>
    <div
      className="package-content"
      style={{
        backgroundColor: isSelected ? "rgba(74, 158, 255, 0.15)" : "",
        boxShadow: isSelected ? "0 0 0 2px rgba(74, 158, 255, 0.4)" : "",
      }}
    >
      <div className="package-header">
        <h4>
          {title}
          {badge && <span className="recommended-badge">{badge}</span>}
        </h4>
      </div>
      <p>{description}</p>
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

const InstallWizard: React.FC<InstallWizardProps> = ({
  defaultPath,
  onComplete,
  defaultSelectedModules = [],
}) => {
  const isMac = window.api.platform === "darwin";
  const allowedModuleKeys = useMemo<ModuleKey[]>(() => {
    const keys = Object.keys(moduleMapping) as ModuleKey[];
    return isMac ? keys : keys.filter((key) => key !== "mlx");
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

  const [currentStep, setCurrentStep] = useState<
    "welcome" | "location" | "packages"
  >("welcome");
  const [selectedPath, setSelectedPath] = useState(defaultPath);
  const LOCAL_STORAGE_KEY = "installer.selectedModules";
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
      setCurrentStep("packages");
      return true;
    },
    [validatePath]
  );
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
    const result = await window.api.selectCustomInstallLocation();
    if (result) {
      applyPathSelection(result);
    }
  };

  const handleBack = () => {
    if (currentStep === "packages") {
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
    await window.api.installToLocation(selectedPath, sanitizedSelection);
    onComplete();
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
              { key: "packages", label: "Step 2: Packages" },
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
              <div className="setup-step active">
                <div className="step-header" style={{ textAlign: "center" }}>
                  <h3>Welcome to NodeTool</h3>
                  <p style={{ marginBottom: "1em" }}>
                    This installer will download and install a Python
                    environment to execute AI models locally.
                  </p>
                  <p style={{ marginBottom: "1em" }}>
                    On a good internet connection the installation will take
                    about 5 minutes.
                  </p>
                </div>
                <div
                  className="welcome-actions"
                  style={{ justifyContent: "center" }}
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

            {/* Step 1: Install Location */}
            {currentStep === "location" && (
              <div id="step-location" className="setup-step active">
                <div className="step-header">
                  <h3>Step 1: Choose Installation Location</h3>
                  <p>Where would you like to install NodeTool?</p>
                  <p role="note" style={{ marginTop: 8, color: "#7a7a7a" }}>
                    Note: Installation may download Python libraries and require
                    additional disk space.
                  </p>
                  <p role="note" style={{ marginTop: 4, color: "#7a7a7a" }}>
                    Paths with spaces are not supported. Choose a location with
                    no whitespace characters.
                  </p>
                </div>
                <div className="location-options">
                  <button
                    className="location-button default-location"
                    onClick={handleDefaultLocation}
                  >
                    <span>
                      <FolderDownloadIcon /> Install to Default Location
                    </span>
                    <span className="location-path">{defaultPath}</span>
                  </button>
                  <button
                    className="location-button custom-location"
                    onClick={handleCustomLocation}
                  >
                    <span>
                      <SearchIcon /> Install to Custom Location
                    </span>
                  </button>
                </div>
                {pathError && (
                  <div
                    className="location-error"
                    role="alert"
                    style={{
                      marginTop: 12,
                      color: "#d93025",
                      backgroundColor: "rgba(217, 48, 37, 0.08)",
                      padding: "12px 16px",
                      borderRadius: 8,
                    }}
                  >
                    {pathError}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Package Selection */}
            {currentStep === "packages" && (
              <div id="step-packages" className="setup-step active">
                <div className="step-header">
                  <h3>Step 2: Choose Packages</h3>
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
