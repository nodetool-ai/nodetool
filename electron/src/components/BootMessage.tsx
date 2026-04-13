import React, { useState, useEffect, useCallback } from "react";
import { ServerStatus } from "../types";
import logoUrl from "../assets/logo.png";

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

interface Provider {
  name: string;
  description: string;
  signupUrl: string;
  capabilities: string[];
}

const PROVIDERS: Provider[] = [
  {
    name: "Kie.ai",
    description: "Unified API access to multiple AI models including video generation, image synthesis, and audio models.",
    signupUrl: "https://kie.ai/",
    capabilities: ["Video Generation", "Image Generation", "Audio"],
  },
  {
    name: "Fal.ai",
    description: "Fast inference platform for image and video generation models with optimized performance.",
    signupUrl: "https://fal.ai/",
    capabilities: ["Image Generation", "Video Generation", "Fast Inference"],
  },
  {
    name: "Hugging Face",
    description: "Access to 500,000+ open-source models for text, image, audio, and more.",
    signupUrl: "https://huggingface.co/settings/tokens",
    capabilities: ["Text Generation", "Image Models", "Speech", "Embeddings"],
  },
  {
    name: "Replicate",
    description: "Run open-source machine learning models in the cloud with a simple API.",
    signupUrl: "https://replicate.com/",
    capabilities: ["Image Generation", "Video", "Audio", "Text"],
  },
  {
    name: "OpenAI",
    description: "Access GPT-4, DALL-E, Whisper, and other powerful AI models from OpenAI.",
    signupUrl: "https://platform.openai.com/api-keys",
    capabilities: ["Chat", "Image Generation", "Speech", "Embeddings"],
  },
  {
    name: "OpenRouter",
    description: "Unified API for accessing multiple LLM providers with automatic fallbacks.",
    signupUrl: "https://openrouter.ai/",
    capabilities: ["Chat", "Multiple LLMs", "Cost Optimization"],
  },
  {
    name: "Anthropic",
    description: "Access Claude models for advanced reasoning, analysis, and code generation.",
    signupUrl: "https://console.anthropic.com/",
    capabilities: ["Chat", "Analysis", "Code Generation"],
  },
  {
    name: "Cerebras",
    description: "Ultra-fast inference for large language models with industry-leading speed.",
    signupUrl: "https://cloud.cerebras.ai/",
    capabilities: ["Fast Inference", "Chat", "Text Generation"],
  },
  {
    name: "Gemini",
    description: "Google's multimodal AI models for text, image, audio, and video understanding.",
    signupUrl: "https://ai.google.dev/",
    capabilities: ["Multimodal", "Chat", "Vision", "Video"],
  },
  {
    name: "MiniMax",
    description: "Advanced AI models for video generation and multimodal content creation.",
    signupUrl: "https://www.minimax.io/",
    capabilities: ["Video Generation", "Chat", "Audio"],
  },
];

const ProviderCarousel: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % PROVIDERS.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + PROVIDERS.length) % PROVIDERS.length);
  }, []);

  const goToSlide = useCallback((index: number) => {
    setCurrentIndex(index);
    setIsAutoPlaying(false);
    // Resume auto-play after 10 seconds of inactivity
    setTimeout(() => setIsAutoPlaying(true), 10000);
  }, []);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(nextSlide, 4000);
    return () => clearInterval(interval);
  }, [isAutoPlaying, nextSlide]);

  const handleOpenProvider = async (url: string) => {
    try {
      await window.api?.system?.openExternal?.(url);
    } catch (error) {
      console.error("Failed to open provider link:", error);
    }
  };

  const currentProvider = PROVIDERS[currentIndex];

  return (
    <div className="provider-carousel-container">
      <div className="provider-carousel-header">
        <h3 className="provider-carousel-title">Supported Providers</h3>
        <p className="provider-carousel-subtitle">
          NodeTool integrates with these AI providers. Sign up to get API keys.
        </p>
      </div>

      <div className="provider-carousel">
        <button 
          className="provider-carousel-nav provider-carousel-prev" 
          onClick={prevSlide}
          type="button"
          aria-label="Previous provider"
        >
          ‹
        </button>
        
        <div className="provider-carousel-content">
          <div className="provider-carousel-card">
            <div className="provider-carousel-card-header">
              <h4 className="provider-carousel-name">{currentProvider.name}</h4>
            </div>
            <p className="provider-carousel-description">{currentProvider.description}</p>
            <div className="provider-carousel-capabilities">
              {currentProvider.capabilities.map((cap) => (
                <span key={cap} className="provider-carousel-tag">{cap}</span>
              ))}
            </div>
            <button
              className="provider-carousel-link"
              onClick={() => handleOpenProvider(currentProvider.signupUrl)}
              type="button"
            >
              Get API Key →
            </button>
          </div>
        </div>

        <button 
          className="provider-carousel-nav provider-carousel-next" 
          onClick={nextSlide}
          type="button"
          aria-label="Next provider"
        >
          ›
        </button>
      </div>

      <div className="provider-carousel-dots">
        {PROVIDERS.map((_, index) => (
          <button
            key={index}
            className={`provider-carousel-dot ${index === currentIndex ? 'active' : ''}`}
            onClick={() => goToSlide(index)}
            type="button"
            aria-label={`Go to ${PROVIDERS[index].name}`}
          />
        ))}
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
          <div className="boot-logo-wrapper">
            <img src={logoUrl} className="boot-logo" alt="Nodetool" />
          </div>
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

        {isInstalling && <ProviderCarousel />}
      </div>
    </div>
  );
};

export default BootMessage;
