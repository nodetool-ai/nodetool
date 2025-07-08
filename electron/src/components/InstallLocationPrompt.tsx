import React, { useState, useEffect } from 'react';

interface InstallLocationPromptProps {
  defaultPath: string;
  onComplete: () => void;
}

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

  useEffect(() => {
    // Add event listeners for package selection highlighting
    const checkboxes = document.querySelectorAll('.package-option input[type="checkbox"]');
    const handlers: Array<EventListener> = [];
    
    checkboxes.forEach((checkbox) => {
      const handleChange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const content = target.closest('.package-option')?.querySelector('.package-content') as HTMLElement;
        
        if (content) {
          if (target.checked) {
            content.style.backgroundColor = 'rgba(74, 158, 255, 0.15)';
            content.style.boxShadow = '0 0 0 2px rgba(74, 158, 255, 0.4)';
          } else {
            content.style.backgroundColor = '';
            content.style.boxShadow = '';
          }
        }
      };

      handlers.push(handleChange as EventListener);
      checkbox.addEventListener('change', handleChange as EventListener);
    });

    return () => {
      checkboxes.forEach((checkbox, index) => {
        checkbox.removeEventListener('change', handlers[index]);
      });
    };
  }, [currentStep]);

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
                    <label className="package-option">
                      <div className="checkbox-wrapper">
                        <input
                          type="checkbox"
                          name="huggingface"
                          onChange={() => handleModuleToggle('huggingface')}
                        />
                      </div>
                      <div className="package-content">
                        <div className="package-header">
                          <h4>🤗 HuggingFace</h4>
                        </div>
                        <p>Text, Image, and Audio models from HuggingFace</p>
                      </div>
                    </label>

                    <label className="package-option">
                      <div className="checkbox-wrapper">
                        <input
                          type="checkbox"
                          name="ml"
                          onChange={() => handleModuleToggle('ml')}
                        />
                      </div>
                      <div className="package-content">
                        <div className="package-header">
                          <h4>📊 Machine Learning</h4>
                        </div>
                        <p>Classification, Regression, and statistical models</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Cloud AI Services */}
                <div className="package-group">
                  <h4>☁️ AI Services</h4>
                  <div className="package-options">
                    <label className="package-option">
                      <div className="checkbox-wrapper">
                        <input
                          type="checkbox"
                          name="openai"
                          onChange={() => handleModuleToggle('openai')}
                        />
                      </div>
                      <div className="package-content">
                        <div className="package-header">
                          <h4>🧠 OpenAI</h4>
                        </div>
                        <p>Additional services from OpenAI, like TTS and Transcription</p>
                      </div>
                    </label>

                    <label className="package-option">
                      <div className="checkbox-wrapper">
                        <input
                          type="checkbox"
                          name="elevenlabs"
                          onChange={() => handleModuleToggle('elevenlabs')}
                        />
                      </div>
                      <div className="package-content">
                        <div className="package-header">
                          <h4>🎤 ElevenLabs</h4>
                        </div>
                        <p>Advanced text-to-speech and voice cloning</p>
                      </div>
                    </label>

                    <label className="package-option">
                      <div className="checkbox-wrapper">
                        <input
                          type="checkbox"
                          name="fal"
                          onChange={() => handleModuleToggle('fal')}
                        />
                      </div>
                      <div className="package-content">
                        <div className="package-header">
                          <h4>⚡ FAL AI</h4>
                        </div>
                        <p>Run premium Image and Video models on Fal AI</p>
                      </div>
                    </label>

                    <label className="package-option">
                      <div className="checkbox-wrapper">
                        <input
                          type="checkbox"
                          name="replicate"
                          onChange={() => handleModuleToggle('replicate')}
                        />
                      </div>
                      <div className="package-content">
                        <div className="package-header">
                          <h4>🔄 Replicate</h4>
                        </div>
                        <p>Access hundreds of AI models hosted on Replicate</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Utilities */}
                <div className="package-group">
                  <h4>🛠️ Utilities</h4>
                  <div className="package-options">
                    <label className="package-option">
                      <div className="checkbox-wrapper">
                        <input
                          type="checkbox"
                          name="file"
                          onChange={() => handleModuleToggle('file')}
                        />
                      </div>
                      <div className="package-content">
                        <div className="package-header">
                          <h4>📄 Document Processing</h4>
                        </div>
                        <p>Convert, merge, and analyze PDFs, Excel, and more</p>
                      </div>
                    </label>

                    <label className="package-option">
                      <div className="checkbox-wrapper">
                        <input
                          type="checkbox"
                          name="data"
                          onChange={() => handleModuleToggle('data')}
                        />
                      </div>
                      <div className="package-content">
                        <div className="package-header">
                          <h4>📈 Data Processing</h4>
                        </div>
                        <p>Clean, transform, and analyze data with Pandas and Numpy</p>
                      </div>
                    </label>

                    <label className="package-option">
                      <div className="checkbox-wrapper">
                        <input
                          type="checkbox"
                          name="audio"
                          onChange={() => handleModuleToggle('audio')}
                        />
                      </div>
                      <div className="package-content">
                        <div className="package-header">
                          <h4>🔊 Audio Processing</h4>
                        </div>
                        <p>Apply audio effects and analyze audio</p>
                      </div>
                    </label>

                    <label className="package-option">
                      <div className="checkbox-wrapper">
                        <input
                          type="checkbox"
                          name="image"
                          onChange={() => handleModuleToggle('image')}
                        />
                      </div>
                      <div className="package-content">
                        <div className="package-header">
                          <h4>🖼️ Image Processing</h4>
                        </div>
                        <p>Transform and draw images</p>
                      </div>
                    </label>

                    <label className="package-option">
                      <div className="checkbox-wrapper">
                        <input
                          type="checkbox"
                          name="network"
                          onChange={() => handleModuleToggle('network')}
                        />
                      </div>
                      <div className="package-content">
                        <div className="package-header">
                          <h4>🌐 Network</h4>
                        </div>
                        <p>HTTP, IMAP and BeautifulSoup</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Integrations */}
                <div className="package-group">
                  <h4>🔌 Integrations</h4>
                  <div className="package-options">
                    <label className="package-option">
                      <div className="checkbox-wrapper">
                        <input
                          type="checkbox"
                          name="apple"
                          onChange={() => handleModuleToggle('apple')}
                        />
                      </div>
                      <div className="package-content">
                        <div className="package-header">
                          <h4>🍎 Apple</h4>
                        </div>
                        <p>Automation for Apple Notes, Calendar, and more</p>
                      </div>
                    </label>
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