import React, { useState, useEffect, useCallback } from "react";
import { ServerStatus } from "../types";

interface UpdateProgressData {
  componentName: string;
  progress: number;
  action: string;
  eta?: string;
}

interface BootMessageProps {
  message: string;
  showUpdateSteps: boolean;
  progressData: UpdateProgressData;
  status?: ServerStatus;
  errorMessage?: string;
  onRetry?: () => void;
  onOpenLogs?: () => void;
  onReinstall?: () => void;
}

interface FeaturedModel {
  name: string;
  icon: string;
  category: string;
  description: string;
}

const FEATURED_MODELS: FeaturedModel[] = [
  {
    name: "Nano Banana Pro",
    icon: "🍌",
    category: "Image Generation",
    description: "Google DeepMind's Nano Banana Pro delivers sharper 2K imagery, intelligent 4K scaling, improved text rendering, and enhanced character consistency.",
  },
  {
    name: "Sora 2",
    icon: "🎬",
    category: "Video Generation",
    description: "OpenAI's latest AI video model supporting text-to-video and image-to-video with realistic motion, physics consistency, and improved style control.",
  },
  {
    name: "Veo 3.1",
    icon: "🎥",
    category: "Video Generation",
    description: "Google DeepMind's next-gen video model producing high-fidelity, cinematic visuals with advanced scene understanding and natural motion.",
  },
  {
    name: "Kling 2.6",
    icon: "🔊",
    category: "Audio-Visual",
    description: "Kling AI's audio-visual model that produces synchronized video, speech, ambient sound, and sound effects from text or image inputs.",
  },
  {
    name: "Suno API",
    icon: "🎵",
    category: "Music Generation",
    description: "Transform text prompts into stunning AI-generated tracks with vocals and instruments. V5 delivers hyper-dynamic, natural compositions.",
  },
];

const KiePromotion: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % FEATURED_MODELS.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + FEATURED_MODELS.length) % FEATURED_MODELS.length);
  }, []);

  const goToSlide = useCallback((index: number) => {
    setCurrentIndex(index);
    setIsAutoPlaying(false);
    // Resume auto-play after 10 seconds of inactivity
    setTimeout(() => setIsAutoPlaying(true), 10000);
  }, []);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(nextSlide, 5000);
    return () => clearInterval(interval);
  }, [isAutoPlaying, nextSlide]);

  const handleOpenKie = async () => {
    try {
      await window.api?.system?.openExternal?.("https://kie.ai/");
    } catch (error) {
      console.error("Failed to open Kie.ai link:", error);
    }
  };

  const currentModel = FEATURED_MODELS[currentIndex];

  return (
    <div className="kie-promotion">
      <div className="kie-promotion-header">
        <div className="kie-logo">
          <span className="kie-logo-text">Kie.ai</span>
          <span className="kie-logo-badge">Featured Models</span>
        </div>
      </div>

      <div className="kie-carousel">
        <button 
          className="kie-carousel-nav kie-carousel-prev" 
          onClick={prevSlide}
          type="button"
          aria-label="Previous model"
        >
          ‹
        </button>
        
        <div className="kie-carousel-content">
          <div className="kie-model-card">
            <div className="kie-model-icon">{currentModel.icon}</div>
            <div className="kie-model-info">
              <span className="kie-model-category">{currentModel.category}</span>
              <h4 className="kie-model-name">{currentModel.name}</h4>
              <p className="kie-model-description">{currentModel.description}</p>
            </div>
          </div>
        </div>

        <button 
          className="kie-carousel-nav kie-carousel-next" 
          onClick={nextSlide}
          type="button"
          aria-label="Next model"
        >
          ›
        </button>
      </div>

      <div className="kie-carousel-dots">
        {FEATURED_MODELS.map((_, index) => (
          <button
            key={index}
            className={`kie-carousel-dot ${index === currentIndex ? 'active' : ''}`}
            onClick={() => goToSlide(index)}
            type="button"
            aria-label={`Go to model ${index + 1}`}
          />
        ))}
      </div>

      <div className="kie-promotion-footer">
        <p className="kie-tagline">
          Access all SOTA models through one affordable API
        </p>
        <button 
          className="kie-cta-button"
          onClick={handleOpenKie}
          type="button"
        >
          Get Your API Key at Kie.ai →
        </button>
        <p className="kie-disclaimer">
          We are not affiliated with Kie.ai — we just love their service!
        </p>
      </div>
    </div>
  );
};

const BootMessage: React.FC<BootMessageProps> = ({
  message,
  showUpdateSteps,
  progressData,
  status,
  errorMessage,
  onRetry,
  onOpenLogs,
  onReinstall,
}) => {
  const isError = status === "error" || Boolean(errorMessage);
  const resolvedMessage = errorMessage ?? message;
  const isInstalling = showUpdateSteps && !isError;

  return (
    <div id="boot-message">
      <div className={`boot-panel ${isInstalling ? 'boot-panel-installing' : ''}`}>
        <div className="brand">NodeTool</div>
        <div className="brand-ring" aria-hidden="true" />

        {!isInstalling && (
          <svg
            className="nodetool-icon"
            width="396"
            height="404"
            viewBox="0 0 396 404"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ animation: 'logo-pulse 4s ease-in-out infinite' }}
          >
            <path
              className="path-1"
              d="M128 176.5L195.5 139L70.5 70L2.5 108L1 112V403L126 323V180L128 176.5Z"
              fill="var(--c_border)"
            />
            <path
              className="path-2"
              d="M394.5 403L267.5 323V180L394.5 108V403Z"
              fill="var(--c_border)"
            />
            <path
              className="path-3"
              d="M394.5 108L195 1L70 69.5L268 179L394.5 108Z"
              fill="var(--c_border)"
            />
            <path
              className="path-4"
              d="M195.5 138.5L69.3451 70L3.5 107L127 176.5L195.5 138.5Z"
              fill="var(--c_border)"
            />
            <path
              className="path-5"
              d="M394.5 108V403L267.5 323V180L394.5 108ZM394.5 108L195 1L70 69.5L268 179L394.5 108ZM195.5 139L128 176.5L126 180V323L1 403V112L2.5 108L70.5 70L195.5 139ZM69.3451 70L195.5 138.5L127 176.5L3.5 107L69.3451 70Z"
              stroke="var(--c_text_primary)"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        )}

        <div className="boot-text">{resolvedMessage}</div>

        {isError && (
          <div className="boot-error">
            <div className="boot-error-title">Backend failed to start</div>
            <div className="boot-error-message">
              {resolvedMessage ||
                "An unexpected error occurred while starting the backend server."}
            </div>
            <div className="boot-actions">
              {onRetry && (
                <button className="boot-action primary" onClick={onRetry}>
                  Retry start
                </button>
              )}
              {onOpenLogs && (
                <button className="boot-action" onClick={onOpenLogs}>
                  Open logs
                </button>
              )}
              {onReinstall && (
                <button className="boot-action" onClick={onReinstall}>
                  Reinstall environment
                </button>
              )}
            </div>
          </div>
        )}

        {showUpdateSteps && (
          <div id="update-steps">
            <div className="progress-container">
              <div className="progress-label">
                <span className="action-label">
                  {progressData.action} {progressData.componentName}
                </span>
                <span>
                  <span className="progress-percentage">
                    {Math.round(progressData.progress)}%
                  </span>
                  <span className="progress-eta">
                    {progressData.eta ? ` (${progressData.eta})` : ''}
                  </span>
                </span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress"
                  style={{ width: `${progressData.progress}%` }}
                ></div>
              </div>
            </div>
          </div>
        )}

        {isInstalling && <KiePromotion />}
      </div>
    </div>
  );
};

export default BootMessage;
