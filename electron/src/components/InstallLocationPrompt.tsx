import React, { useState } from 'react';

interface InstallLocationPromptProps {
  defaultPath: string;
  onComplete: () => void;
}

interface PackageOptionProps {
  name: string;
  title: string;
  description: string;
  isSelected: boolean;
  onToggle: () => void;
}

const PackageOption: React.FC<PackageOptionProps> = ({ name, title, description, isSelected, onToggle }) => (
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
        backgroundColor: isSelected ? 'rgba(74, 158, 255, 0.15)' : '',
        boxShadow: isSelected ? '0 0 0 2px rgba(74, 158, 255, 0.4)' : ''
      }}
    >
      <div className="package-header">
        <h4>{title}</h4>
      </div>
      <p>{description}</p>
    </div>
  </label>
);

const InstallLocationPrompt: React.FC<InstallLocationPromptProps> = ({ defaultPath, onComplete }) => {
  const [currentStep, setCurrentStep] = useState<'location' | 'packages'>('location');
  const [selectedPath, setSelectedPath] = useState(defaultPath);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);

  const moduleMapping = {
    anthropic: 'nodetool-ai/nodetool-anthropic',
    apple: 'nodetool-ai/nodetool-apple',
    audio: 'nodetool-ai/nodetool-lib-audio',
    chroma: 'nodetool-ai/nodetool-chroma',
    comfy: 'nodetool-ai/nodetool-comfy',
    data: 'nodetool-ai/nodetool-lib-data',
    elevenlabs: 'nodetool-ai/nodetool-elevenlabs',
    fal: 'nodetool-ai/nodetool-fal',
    file: 'nodetool-ai/nodetool-lib-file',
    google: 'nodetool-ai/nodetool-google',
    huggingface: 'nodetool-ai/nodetool-huggingface',
    image: 'nodetool-ai/nodetool-lib-image',
    ml: 'nodetool-ai/nodetool-lib-ml',
    network: 'nodetool-ai/nodetool-lib-network',
    ollama: 'nodetool-ai/nodetool-ollama',
    openai: 'nodetool-ai/nodetool-openai',
    replicate: 'nodetool-ai/nodetool-replicate',
  };

  const handleModuleToggle = (moduleName: string) => {
    const repoId = moduleMapping[moduleName as keyof typeof moduleMapping];
    if (selectedModules.includes(repoId)) {
      setSelectedModules((prev: string[]) => prev.filter((id: string) => id !== repoId));
    } else {
      setSelectedModules((prev: string[]) => [...prev, repoId]);
    }
  };

  const isModuleSelected = (moduleName: string): boolean => {
    const repoId = moduleMapping[moduleName as keyof typeof moduleMapping];
    return selectedModules.includes(repoId);
  };

  const handleDefaultLocation = () => {
    setSelectedPath(defaultPath);
    setCurrentStep('packages');
  };

  const handleCustomLocation = async () => {
    const result = await window.api.selectCustomInstallLocation();
    if (result) {
      setSelectedPath(result);
      setCurrentStep('packages');
    }
  };

  const handleBack = () => {
    setCurrentStep('location');
  };

  const handleInstall = async () => {
    await window.api.installToLocation(selectedPath, selectedModules);
    onComplete();
  };


  return (
    <div id="install-location-prompt">
      <div id="environment-info">
        {/* Step 1: Install Location */}
        {currentStep === 'location' && (
          <div id="step-location" className="setup-step active">
            <div className="step-header">
              <h3>Step 1: Choose Installation Location</h3>
              <p>Where would you like to install NodeTool?</p>
            </div>
            <div className="location-options">
              <button className="location-button default-location" onClick={handleDefaultLocation}>
                <span>📁 Install to Default Location</span>
                <span className="location-path">{defaultPath}</span>
              </button>
              <button className="location-button custom-location" onClick={handleCustomLocation}>
                <span>🔍 Install to Custom Location</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Package Selection */}
        {currentStep === 'packages' && (
          <div id="step-packages" className="setup-step active">
            <div className="step-header">
              <h3>Step 2: Choose Packages</h3>
              <p>Select the packages you'd like to install:</p>
            </div>

            <div className="package-selection">
              <div className="package-grid">
                {/* AI & ML Package Group */}
                <div className="package-group">
                  <h4>🤖 AI & Machine Learning</h4>
                  <div className="package-options">
                    <PackageOption
                      name="huggingface"
                      title="🤗 HuggingFace"
                      description="Text, Image, and Audio models from HuggingFace"
                      isSelected={isModuleSelected('huggingface')}
                      onToggle={() => handleModuleToggle('huggingface')}
                    />

                    <PackageOption
                      name="ml"
                      title="📊 Machine Learning"
                      description="Classification, Regression, and statistical models"
                      isSelected={isModuleSelected('ml')}
                      onToggle={() => handleModuleToggle('ml')}
                    />
                  </div>
                </div>

                {/* Cloud AI Services */}
                <div className="package-group">
                  <h4>☁️ AI Services</h4>
                  <div className="package-options">
                    <PackageOption
                      name="openai"
                      title="🧠 OpenAI"
                      description="Additional services from OpenAI, like TTS and Transcription"
                      isSelected={isModuleSelected('openai')}
                      onToggle={() => handleModuleToggle('openai')}
                    />

                    <PackageOption
                      name="elevenlabs"
                      title="🎤 ElevenLabs"
                      description="Advanced text-to-speech and voice cloning"
                      isSelected={isModuleSelected('elevenlabs')}
                      onToggle={() => handleModuleToggle('elevenlabs')}
                    />

                    <PackageOption
                      name="fal"
                      title="⚡ FAL AI"
                      description="Run premium Image and Video models on Fal AI"
                      isSelected={isModuleSelected('fal')}
                      onToggle={() => handleModuleToggle('fal')}
                    />

                    <PackageOption
                      name="replicate"
                      title="🔄 Replicate"
                      description="Access hundreds of AI models hosted on Replicate"
                      isSelected={isModuleSelected('replicate')}
                      onToggle={() => handleModuleToggle('replicate')}
                    />
                  </div>
                </div>

                {/* Utilities */}
                <div className="package-group">
                  <h4>🛠️ Utilities</h4>
                  <div className="package-options">
                    <PackageOption
                      name="file"
                      title="📄 Document Processing"
                      description="Convert, merge, and analyze PDFs, Excel, and more"
                      isSelected={isModuleSelected('file')}
                      onToggle={() => handleModuleToggle('file')}
                    />

                    <PackageOption
                      name="data"
                      title="📈 Data Processing"
                      description="Clean, transform, and analyze data with Pandas and Numpy"
                      isSelected={isModuleSelected('data')}
                      onToggle={() => handleModuleToggle('data')}
                    />

                    <PackageOption
                      name="audio"
                      title="🔊 Audio Processing"
                      description="Apply audio effects and analyze audio"
                      isSelected={isModuleSelected('audio')}
                      onToggle={() => handleModuleToggle('audio')}
                    />

                    <PackageOption
                      name="image"
                      title="🖼️ Image Processing"
                      description="Transform and draw images"
                      isSelected={isModuleSelected('image')}
                      onToggle={() => handleModuleToggle('image')}
                    />

                    <PackageOption
                      name="network"
                      title="🌐 Network"
                      description="HTTP, IMAP and BeautifulSoup"
                      isSelected={isModuleSelected('network')}
                      onToggle={() => handleModuleToggle('network')}
                    />
                  </div>
                </div>

                {/* Integrations */}
                <div className="package-group">
                  <h4>🔌 Integrations</h4>
                  <div className="package-options">
                    <PackageOption
                      name="apple"
                      title="🍎 Apple"
                      description="Automation for Apple Notes, Calendar, and more"
                      isSelected={isModuleSelected('apple')}
                      onToggle={() => handleModuleToggle('apple')}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="navigation-buttons">
              <button className="nav-button back" onClick={handleBack}>
                ← Back
              </button>
              <button className="nav-button next" onClick={handleInstall}>
                Install →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InstallLocationPrompt;